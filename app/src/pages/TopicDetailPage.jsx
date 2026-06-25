import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow, differenceInHours, differenceInMinutes } from "date-fns";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  ArrowLeft, LoaderCircle, MoreVertical, Pause, Play, Search, Sparkles,
  Trash2, Radio, Lightbulb, Layers, TrendingUp, Clock, History,
} from "lucide-react";
import { getLatestRun } from "../lib/topics";
import {
  queueResearchRun, saveClusterIdea, createScriptOutline,
} from "../lib/listening";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import BriefCard from "@/components/listening/BriefCard";
import AngleCard from "@/components/listening/AngleCard";
import AngleDrawer from "@/components/listening/AngleDrawer";
import SignalRow from "@/components/listening/SignalRow";

const log = logger("TopicDetailPage");

function relativeTime(value) {
  if (!value) return "—";
  try { return formatDistanceToNow(new Date(value), { addSuffix: true }); } catch { return "—"; }
}

function lastRunLabel(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    const h = differenceInHours(new Date(), d);
    if (h < 1) {
      const m = differenceInMinutes(new Date(), d);
      return `${m}m`;
    }
    return `${h}h`;
  } catch { return "—"; }
}

// ---- Stat card ----
function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm",
      accent ? "border-primary/20 bg-primary/5" : "border-border bg-card"
    )}>
      <span className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-widest text-muted-foreground leading-tight">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-[19px] font-semibold leading-none text-foreground tabular-nums">{value}</span>
          {sub && <span className="text-xs text-muted-foreground/70 truncate">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

// ---- History timeline ----
function HistoryView({ runs }) {
  if (!runs.length) {
    return <EmptyState icon={History} title="No runs yet" description="Each research run is logged here with its results." />;
  }

  const RUN_COLOR = {
    succeeded: "text-green-600 dark:text-green-400",
    failed: "text-destructive",
    running: "text-amber-600 dark:text-amber-400",
    queued: "text-amber-600 dark:text-amber-400",
  };

  return (
    <ol className="relative pl-6 space-y-0" style={{ borderLeft: "2px solid hsl(var(--border))", marginLeft: 10 }}>
      {runs.map((run, i) => {
        const isNew = i === 0 && (run.status === "succeeded" || run.status === "running");
        return (
          <li key={run.id} className="relative pb-5 last:pb-0">
            {/* Timeline dot */}
            <span
              className={cn(
                "absolute -left-[25px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-background",
                isNew ? "border-primary bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]" : "border-muted-foreground/40"
              )}
            />
            <div className="flex flex-wrap items-center gap-2 ml-1">
              <span className={cn("text-sm font-medium capitalize", RUN_COLOR[run.status] || "text-foreground")}>
                {run.status}
              </span>
              {isNew && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">New</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{relativeTime(run.created_at)}</span>
            </div>
            <div className="mt-1 ml-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{run.total_new_hits || 0} new</span>
              {run.error_message && (
                <p className="mt-0.5 text-xs text-destructive">{run.error_message}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function TopicDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [topic, setTopic] = useState(null);
  const [runs, setRuns] = useState([]);
  const [brief, setBrief] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [runningSearch, setRunningSearch] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [tab, setTab] = useState("angles");
  const [activeIndex, setActiveIndex] = useState(null); // index into brief.content_angles
  const [savedSet, setSavedSet] = useState(() => new Set());

  const fetchAll = useCallback(async () => {
    if (!user || !id) return;
    const [topicRes, runsRes, briefRes, clustersRes] = await Promise.all([
      supabase.from("listening_topics").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
      supabase.from("listening_runs").select("*").eq("topic_id", id).order("created_at", { ascending: false }).limit(30),
      supabase.from("listening_briefs").select("*").eq("topic_id", id).order("created_at", { ascending: false }).limit(1),
      supabase.from("listening_clusters").select("*").eq("topic_id", id).order("score", { ascending: false, nullsFirst: false }).limit(40),
    ]);

    if (topicRes.error || !topicRes.data) { setNotFound(true); setLoading(false); return; }
    setTopic(topicRes.data);
    if (!runsRes.error) setRuns(runsRes.data || []);
    if (!briefRes.error) setBrief(briefRes.data?.[0] || null);
    if (!clustersRes.error) setClusters((clustersRes.data || []).filter((c) => !c.metadata?.dismissed));
    setLoading(false);
  }, [user, id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const { containerRef, refreshing } = usePullToRefresh(fetchAll);

  const latestRun = getLatestRun(runs);
  const isRunning = runningSearch || ["queued", "running"].includes(latestRun?.status);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const newThisWeek = runs.reduce(
      (sum, run) => (new Date(run.created_at).getTime() >= weekAgo ? sum + (run.total_new_hits || 0) : sum), 0,
    );
    return { newThisWeek };
  }, [runs]);

  // Angles derived from brief
  const angles = brief?.content_angles || [];
  const hooks = brief?.scripts_or_hooks || [];

  // Format filter chips
  const formats = useMemo(() => {
    const fmts = angles.map((a) => a.format).filter(Boolean);
    const unique = [...new Set(fmts.map((f) => (f.split("·")[1] || f).trim()))].filter(Boolean);
    return unique;
  }, [angles]);
  const [formatFilter, setFormatFilter] = useState("All");

  const visibleAngles = useMemo(() => {
    if (formatFilter === "All") return angles;
    return angles.filter((a) => {
      const sub = (a.format?.split("·")[1] || a.format || "").trim();
      return sub === formatFilter;
    });
  }, [angles, formatFilter]);

  const activeAngle = activeIndex !== null ? angles[activeIndex] ?? null : null;

  const runSearchNow = async (deep = false) => {
    setRunningSearch(true);
    try {
      const { ok, result } = await queueResearchRun({ supabase, topicId: id, deep });
      if (!ok) { showToast(result.error || "Research failed to queue.", "error"); return; }
      showToast(result.message || "Research run queued.", result.workerError ? "warning" : "success");
      await fetchAll();
    } catch (err) {
      log.error("Research run failed", { error: err });
      showToast(err.message || "Research failed. Try again.", "error");
    } finally { setRunningSearch(false); }
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

  const handleSaveAngle = (angle, idx) => {
    // Build a synthetic cluster from angle data + mark as saved
    const syntheticCluster = {
      id: `angle-${idx}`,
      run_id: brief?.run_id,
      title: angle.title,
      summary: angle.angle,
    };
    saveClusterIdea({ supabase, user, showToast, topic, cluster: syntheticCluster, angle });
    setSavedSet((prev) => { const n = new Set(prev); n.add(idx); return n; });
  };

  const handleScriptOutline = (angle) => {
    createScriptOutline({ supabase, user, showToast, topic, angle, brief });
  };

  const handleSaveCluster = (cluster) => {
    saveClusterIdea({ supabase, user, showToast, topic, cluster });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <Skeleton className="h-64" />
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

  const lastRunAgo = lastRunLabel(topic.last_run_at);
  const anglesCount = angles.length;

  return (
    <div ref={containerRef} className="mx-auto max-w-4xl p-4 sm:p-6" style={refreshing ? { opacity: 0.7 } : {}}>
      {refreshing && (
        <div className="fixed left-0 right-0 top-0 z-50 flex justify-center pt-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <BackLink />

      {/* ---- Header ---- */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{topic.name}</h1>
            <TopicStatusBadge topic={topic} isRunning={isRunning} latestRun={latestRun} />
            <Badge variant="secondary" className="capitalize">{topic.frequency}</Badge>
            {topic.last_run_at && (
              <span className="text-xs text-muted-foreground ml-auto hidden sm:block whitespace-nowrap">
                Last ran {relativeTime(topic.last_run_at)}
              </span>
            )}
          </div>
          {topic.audience && (
            <p className="mt-1 text-sm text-muted-foreground">Audience: {topic.audience}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            className="hidden sm:inline-flex gap-1.5"
            onClick={() => runSearchNow(false)}
            disabled={isRunning}
          >
            {isRunning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {isRunning ? "Searching…" : "Search now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex gap-1.5"
            onClick={() => runSearchNow(true)}
            disabled={isRunning}
          >
            <Sparkles className="h-3.5 w-3.5" /> Deep run
          </Button>
          <HelpButton />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="sm:hidden" onClick={() => runSearchNow(false)} disabled={isRunning}>
                <Search className="h-4 w-4" /> Search now
              </DropdownMenuItem>
              <DropdownMenuItem className="sm:hidden" onClick={() => runSearchNow(true)} disabled={isRunning}>
                <Sparkles className="h-4 w-4" /> Deep run
              </DropdownMenuItem>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem onClick={toggleActive}>
                {topic.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {topic.active ? "Pause" : "Resume"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete topic
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ---- Stat cards ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Lightbulb}   label="Content angles" value={anglesCount}          sub="ready to use"               accent />
        <StatCard icon={Layers}      label="Clusters"        value={clusters.length}      sub={`${clusters.length} mentions`} />
        <StatCard icon={TrendingUp}  label="New this week"   value={stats.newThisWeek}   sub="cluster" />
        <StatCard icon={Clock}       label="Last run"        value={lastRunAgo}           sub={`ago · ${topic.frequency}`} />
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

      {/* ---- Tabs ---- */}
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto sm:w-auto">
          <TabsTrigger value="angles">
            <Lightbulb className="mr-1.5 h-4 w-4" /> Angles {anglesCount > 0 && `(${anglesCount})`}
          </TabsTrigger>
          <TabsTrigger value="signals">
            <Layers className="mr-1.5 h-4 w-4" /> Signals {clusters.length > 0 && `(${clusters.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1.5 h-4 w-4" /> History
          </TabsTrigger>
        </TabsList>

        {/* ---- ANGLES TAB ---- */}
        <TabsContent value="angles" className="mt-5 space-y-5">
          {brief ? (
            <>
              <BriefCard brief={brief} />

              {/* Section header + format filters */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-lg font-semibold text-foreground">Content angles</h2>
                  {visibleAngles.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {visibleAngles.length} ranked idea{visibleAngles.length !== 1 ? "s" : ""} · each backed by its signal cluster
                    </span>
                  )}
                </div>
                {formats.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter by format">
                    {["All", ...formats].map((f) => (
                      <button
                        key={f}
                        role="tab"
                        aria-selected={formatFilter === f}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                          formatFilter === f
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-border/80"
                        )}
                        onClick={() => setFormatFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {visibleAngles.length > 0 ? (
                <div className="space-y-3">
                  {visibleAngles.map((angle, i) => (
                    <AngleCard
                      key={i}
                      angle={angle}
                      index={i}
                      hook={hooks[i] || null}
                      clusters={clusters}
                      saved={savedSet.has(i)}
                      active={activeIndex === i}
                      onOpen={setActiveIndex}
                      onSave={() => handleSaveAngle(angle, i)}
                      onScriptOutline={() => handleScriptOutline(angle)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Lightbulb}
                  title="No angles match this format"
                  description="Try selecting All to see all content angles."
                  actionLabel="Show all"
                  onAction={() => setFormatFilter("All")}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={Sparkles}
              title={isRunning ? "Building your brief…" : "No brief yet"}
              description={isRunning ? "The research run is in progress." : "Run a search to generate content angles and a creator brief."}
              actionLabel={isRunning ? undefined : "Search now"}
              onAction={isRunning ? undefined : () => runSearchNow(false)}
            />
          )}
        </TabsContent>

        {/* ---- SIGNALS TAB ---- */}
        <TabsContent value="signals" className="mt-5">
          {clusters.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-lg font-semibold text-foreground">Signals</h2>
                <span className="text-sm text-muted-foreground">
                  {clusters.length} clusters · ranked by score
                </span>
              </div>
              <div className="space-y-2.5">
                {clusters.map((cluster) => (
                  <SignalRow key={cluster.id} cluster={cluster} onSave={handleSaveCluster} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Layers}
              title="No signals yet"
              description={isRunning ? "Search in progress…" : "Research clusters surface here after a run."}
            />
          )}
        </TabsContent>

        {/* ---- HISTORY TAB ---- */}
        <TabsContent value="history" className="mt-5">
          <div className="space-y-4">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-lg font-semibold text-foreground">History</h2>
              {runs.length > 0 && (
                <span className="text-sm text-muted-foreground">{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            <HistoryView runs={runs} />
          </div>
        </TabsContent>
      </Tabs>

      {/* ---- Angle drawer ---- */}
      <AngleDrawer
        angle={activeAngle}
        index={activeIndex}
        hook={activeIndex !== null ? (hooks[activeIndex] || null) : null}
        altHooks={
          activeIndex !== null
            ? hooks.filter((_, i) => i !== activeIndex).slice(0, 2)
            : []
        }
        clusters={clusters}
        saved={activeIndex !== null && savedSet.has(activeIndex)}
        onSave={() => activeAngle && handleSaveAngle(activeAngle, activeIndex)}
        onScriptOutline={() => activeAngle && handleScriptOutline(activeAngle)}
        onClose={() => setActiveIndex(null)}
      />

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
