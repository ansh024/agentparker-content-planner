import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  ArrowLeft, LoaderCircle, MoreVertical, Pause, Play, Search, Sparkles,
  Trash2, Radio, FileText, Layers, ListFilter, History,
} from "lucide-react";
import { getLatestRun, getTopicStatus, mergeTopicHits } from "../lib/topics";
import {
  queueResearchRun, captureAsIdea, saveClusterIdea, createScriptOutline,
  markClusterIrrelevant,
} from "../lib/listening";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import HelpButton from "@/components/common/HelpButton";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import TopicStatusBadge from "@/components/listening/TopicStatusBadge";
import BriefView from "@/components/listening/BriefView";
import ClusterCard from "@/components/listening/ClusterCard";
import HitCard from "@/components/listening/HitCard";

const log = logger("TopicDetailPage");

function relativeTime(value) {
  if (!value) return "—";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "—";
  }
}

function StatTile({ label, value }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-foreground sm:text-lg">{value}</p>
    </Card>
  );
}

const RUN_STATUS_COLOR = {
  succeeded: "text-green-600 dark:text-green-400",
  failed: "text-destructive",
  running: "text-amber-600 dark:text-amber-400",
  queued: "text-amber-600 dark:text-amber-400",
};

export default function TopicDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [topic, setTopic] = useState(null);
  const [runs, setRuns] = useState([]);
  const [brief, setBrief] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [hits, setHits] = useState([]);
  const [hitsLoaded, setHitsLoaded] = useState(false);
  const [loadingHits, setLoadingHits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [runningSearch, setRunningSearch] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [tab, setTab] = useState("brief");

  const fetchAll = useCallback(async () => {
    if (!user || !id) return;
    const topicReq = supabase.from("listening_topics").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    const runsReq = supabase.from("listening_runs").select("*").eq("topic_id", id).order("created_at", { ascending: false }).limit(30);
    const briefReq = supabase.from("listening_briefs").select("*").eq("topic_id", id).order("created_at", { ascending: false }).limit(1);
    const clustersReq = supabase.from("listening_clusters").select("*").eq("topic_id", id).order("score", { ascending: false, nullsFirst: false }).limit(40);

    const [topicRes, runsRes, briefRes, clustersRes] = await Promise.all([topicReq, runsReq, briefReq, clustersReq]);

    if (topicRes.error || !topicRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setTopic(topicRes.data);
    if (!runsRes.error) setRuns(runsRes.data || []);
    if (!briefRes.error) setBrief(briefRes.data?.[0] || null);
    if (!clustersRes.error) setClusters((clustersRes.data || []).filter((c) => !c.metadata?.dismissed));
    setLoading(false);
  }, [user, id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const { containerRef, refreshing } = usePullToRefresh(fetchAll);

  const loadHits = useCallback(async () => {
    if (!id) return;
    setLoadingHits(true);
    const { data } = await supabase.from("listening_hits").select("*").eq("topic_id", id)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .order("captured_at", { ascending: false }).limit(80);
    setHits((prev) => mergeTopicHits(prev, data || []));
    setHitsLoaded(true);
    setLoadingHits(false);
  }, [id]);

  useEffect(() => {
    if (tab === "raw" && !hitsLoaded) loadHits();
  }, [tab, hitsLoaded, loadHits]);

  const latestRun = getLatestRun(runs);
  const isRunning = runningSearch || ["queued", "running"].includes(latestRun?.status);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const newThisWeek = runs.reduce(
      (sum, run) => (new Date(run.created_at).getTime() >= weekAgo ? sum + (run.total_new_hits || 0) : sum),
      0,
    );
    return { newThisWeek };
  }, [runs]);

  const runSearchNow = async (deep = false) => {
    setRunningSearch(true);
    log.info("Queuing research", { id, deep });
    try {
      const { ok, result } = await queueResearchRun({ supabase, topicId: id, deep });
      if (!ok) {
        showToast(result.error || "Research failed to queue.", "error");
        return;
      }
      showToast(result.message || "Research run queued.", result.workerError ? "warning" : "success");
      await fetchAll();
    } catch (err) {
      log.error("Research run failed", { error: err });
      showToast(err.message || "Research failed. Try again.", "error");
    } finally {
      setRunningSearch(false);
    }
  };

  const toggleActive = async () => {
    await supabase.from("listening_topics").update({ active: !topic.active }).eq("id", topic.id);
    showToast(topic.active ? `"${topic.name}" paused.` : `"${topic.name}" resumed.`, "success");
    fetchAll();
  };

  const deleteTopic = async () => {
    await supabase.from("listening_topics").delete().eq("id", topic.id);
    showToast(`"${topic.name}" deleted.`, "success");
    navigate("/topics");
  };

  // Idea actions wired to the shared lib helpers
  const onSaveAngle = (angle) =>
    saveClusterIdea({
      supabase, user, showToast, topic,
      cluster: { id: brief.id, run_id: brief.run_id, summary: brief.what_changed, title: angle.title },
      angle,
    });
  const onScriptOutline = (angle) => createScriptOutline({ supabase, user, showToast, topic, angle, brief });
  const onSaveCluster = (cluster) => saveClusterIdea({ supabase, user, showToast, topic, cluster });
  const onMarkIrrelevant = (cluster) =>
    markClusterIrrelevant({
      supabase, showToast, cluster,
      onHidden: (c) => setClusters((prev) => prev.filter((x) => x.id !== c.id)),
    });
  const onSaveHit = (hit) => captureAsIdea({ supabase, user, showToast, hit });

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-4 h-8 w-64" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="mt-6 h-64" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <BackLink />
        <EmptyState
          icon={Radio}
          title="Topic not found"
          description="This topic may have been deleted."
          actionLabel="Back to Listening"
          onAction={() => navigate("/topics")}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mx-auto max-w-4xl p-4 sm:p-6" style={refreshing ? { opacity: 0.7 } : {}}>
      {refreshing && (
        <div className="fixed left-0 right-0 top-0 z-50 flex justify-center pt-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <BackLink />

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{topic.name}</h1>
            <TopicStatusBadge topic={topic} isRunning={isRunning} latestRun={latestRun} />
            <Badge variant="secondary" className="capitalize">{topic.frequency}</Badge>
          </div>
          {topic.audience && (
            <p className="mt-1.5 text-sm text-muted-foreground">Audience: {topic.audience}</p>
          )}
        </div>
        <HelpButton />
      </div>

      {/* Action bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => runSearchNow(false)} disabled={isRunning}>
          {isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {isRunning ? "Searching…" : "Search now"}
        </Button>
        <Button variant="outline" onClick={() => runSearchNow(true)} disabled={isRunning} className="hidden sm:inline-flex">
          <Sparkles className="h-4 w-4" /> Deep run
        </Button>
        <Button variant="outline" onClick={toggleActive} className="hidden sm:inline-flex">
          {topic.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {topic.active ? "Pause" : "Resume"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="sm:hidden" onClick={() => runSearchNow(true)} disabled={isRunning}>
              <Sparkles className="h-4 w-4" /> Deep run
            </DropdownMenuItem>
            <DropdownMenuItem className="sm:hidden" onClick={toggleActive}>
              {topic.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {topic.active ? "Pause" : "Resume"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete topic
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Last run" value={relativeTime(topic.last_run_at)} />
        <StatTile label="New this week" value={stats.newThisWeek} />
        <StatTile label="Clusters" value={clusters.length} />
        <StatTile label="Runs" value={runs.length} />
      </div>

      {isRunning && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
          Searching sources and building a creator brief. Results update when the worker finishes.
        </div>
      )}

      {latestRun?.error_message && !isRunning && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          Last run failed: {latestRun.error_message}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto sm:w-auto">
          <TabsTrigger value="brief"><FileText className="mr-1.5 h-4 w-4" /> Brief</TabsTrigger>
          <TabsTrigger value="clusters"><Layers className="mr-1.5 h-4 w-4" /> Clusters {clusters.length > 0 && `(${clusters.length})`}</TabsTrigger>
          <TabsTrigger value="raw"><ListFilter className="mr-1.5 h-4 w-4" /> Raw results</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1.5 h-4 w-4" /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="brief" className="mt-4">
          {brief ? (
            <BriefView brief={brief} onSaveAngle={onSaveAngle} onScriptOutline={onScriptOutline} />
          ) : (
            <EmptyState
              icon={Sparkles}
              title={isRunning ? "Building your brief…" : "No brief yet"}
              description={isRunning ? "The research run is in progress." : "Run a search to generate a creator brief with angles and hooks."}
              actionLabel={isRunning ? undefined : "Search now"}
              onAction={isRunning ? undefined : () => runSearchNow(false)}
            />
          )}
        </TabsContent>

        <TabsContent value="clusters" className="mt-4">
          {clusters.length > 0 ? (
            <div className="space-y-3">
              {clusters.map((cluster) => (
                <ClusterCard key={cluster.id} cluster={cluster} onSaveIdea={onSaveCluster} onMarkIrrelevant={onMarkIrrelevant} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Layers} title="No clusters yet" description="Clusters of related discussion appear here after a research run." />
          )}
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          {loadingHits ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : hits.length > 0 ? (
            <div className="space-y-3">
              {hits.map((hit) => <HitCard key={hit.id} hit={hit} onSaveIdea={onSaveHit} />)}
            </div>
          ) : (
            <EmptyState icon={ListFilter} title="No raw results yet" description={isRunning ? "Search in progress…" : "Individual sources surfaced by a run show up here."} />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {runs.length > 0 ? (
            <div className="divide-y rounded-lg border bg-card">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <span className={cn("font-medium capitalize", RUN_STATUS_COLOR[run.status] || "text-foreground")}>{run.status}</span>
                    {run.error_message && <p className="mt-0.5 truncate text-xs text-muted-foreground">{run.error_message}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>{run.total_new_hits || 0} new</span>
                    <span>{relativeTime(run.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={History} title="No runs yet" description="Each research run is logged here with its results." />
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title={`Delete "${topic.name}"?`}
        description="This removes the topic. Existing ideas you've saved from it are kept."
        confirmLabel="Delete"
        onConfirm={() => { setShowDelete(false); deleteTopic(); }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/topics" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Listening
    </Link>
  );
}
