import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  ChevronDown, ChevronRight, ExternalLink, FileText, Lightbulb,
  LoaderCircle, Pause, Play, Plus, Search, Sparkles, Trash2, X, Radio,
} from "lucide-react";
import {
  createTopicAndSearch, getLatestRun, getTopicStatus, groupByTopic, mergeTopicHits,
} from "../lib/topics";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/common/ConfirmDialog";

const log = logger("TopicsPage");
const FREQUENCIES = ["daily", "weekly"];

function parseCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function firstCitation(source) {
  const citations = source?.evidence || source?.source_citations || source?.metadata?.source_urls || [];
  return Array.isArray(citations) ? citations.find((item) => item?.url || typeof item === "string") : null;
}

function citationUrl(citation) {
  if (!citation) return "";
  return typeof citation === "string" ? citation : citation.url;
}

const EMPTY_FORM = {
  name: "",
  audience: "",
  contentFormat: "short-form video",
  keywords: "",
  competitors: "",
  platformFocus: "YouTube, Instagram, TikTok",
  frequency: "daily",
};

export default function TopicsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [topics, setTopics] = useState([]);
  const [runs, setRuns] = useState({});
  const [briefs, setBriefs] = useState({});
  const [clusters, setClusters] = useState({});
  const [hits, setHits] = useState({});
  const [expanded, setExpanded] = useState({});
  const [expandedRaw, setExpandedRaw] = useState({});
  const [loadingHits, setLoadingHits] = useState({});
  const [runningSearch, setRunningSearch] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { id, name }
  const [form, setForm] = useState(EMPTY_FORM);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const fetchTopics = useCallback(async () => {
    if (!user) return;
    log.debug("Fetching listening dashboard data");

    const topicsReq = supabase.from("listening_topics").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const runsReq = supabase.from("listening_runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80);
    const briefsReq = supabase.from("listening_briefs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);
    const clustersReq = supabase.from("listening_clusters").select("*").eq("user_id", user.id).order("score", { ascending: false, nullsFirst: false }).limit(120);

    const [topicsRes, runsRes, briefsRes, clustersRes] = await Promise.all([topicsReq, runsReq, briefsReq, clustersReq]);

    if (topicsRes.error) {
      setError(friendlyError(mapSupabaseError(topicsRes.error, "load-topics")));
    } else {
      setTopics(topicsRes.data || []);
      setError(null);
    }

    if (!runsRes.error) setRuns(groupByTopic(runsRes.data || []));
    if (!briefsRes.error) {
      const groupedBriefs = groupByTopic(briefsRes.data || []);
      setBriefs(Object.fromEntries(Object.entries(groupedBriefs).map(([topicId, rows]) => [topicId, rows[0]])));
    }
    if (!clustersRes.error) setClusters(groupByTopic(clustersRes.data || []));

    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) fetchTopics(); }, [user, fetchTopics]);

  const { containerRef, refreshing } = usePullToRefresh(fetchTopics);

  const loadHits = async (topicId) => {
    setLoadingHits((prev) => ({ ...prev, [topicId]: true }));
    const { data } = await supabase.from("listening_hits").select("*").eq("topic_id", topicId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .order("captured_at", { ascending: false }).limit(80);
    setHits((prev) => ({ ...prev, [topicId]: mergeTopicHits(prev[topicId], data || []) }));
    setLoadingHits((prev) => ({ ...prev, [topicId]: false }));
  };

  const toggleExpanded = async (topicId) => {
    const nextExpanded = !expanded[topicId];
    setExpanded((prev) => ({ ...prev, [topicId]: nextExpanded }));
    if (nextExpanded && !hits[topicId]) await loadHits(topicId);
  };

  const toggleRaw = async (topicId) => {
    const nextExpanded = !expandedRaw[topicId];
    setExpandedRaw((prev) => ({ ...prev, [topicId]: nextExpanded }));
    if (nextExpanded && !hits[topicId]) await loadHits(topicId);
  };

  const runSearchNow = async (topic, deep = false) => {
    setRunningSearch((prev) => ({ ...prev, [topic.id]: true }));
    setExpanded((prev) => ({ ...prev, [topic.id]: true }));
    log.info("Queuing creator research for topic", { id: topic.id, name: topic.name, deep });

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please log in to continue.");
      const res = await fetch("/api/listening/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topicId: topic.id, deep }),
      });

      const result = await res.json();
      if (!res.ok || !result.ok) {
        showToast(result.error || "Research failed to queue.", "error");
        return;
      }

      showToast(result.message || "Research run queued.", result.workerError ? "warning" : "success");
      await fetchTopics();
      await loadHits(topic.id);
    } catch (err) {
      log.error("Research run failed", { error: err });
      showToast(err.message || "Research failed. Try again.", "error");
    } finally {
      setRunningSearch((prev) => ({ ...prev, [topic.id]: false }));
    }
  };

  const createTopic = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.keywords.trim()) {
      showToast("Enter a name and keywords.", "warning");
      return;
    }

    setSaving(true);
    const topicPayload = {
      name: form.name.trim(),
      audience: form.audience.trim(),
      contentFormat: form.contentFormat.trim() || "short-form video",
      keywords: parseCsv(form.keywords),
      competitors: parseCsv(form.competitors),
      platformFocus: parseCsv(form.platformFocus),
      frequency: form.frequency,
    };

    try {
      await createTopicAndSearch({
        createTopic: async () => {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (!token) throw new Error("Please log in to continue.");
          const res = await fetch("/api/topics", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(topicPayload),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Couldn't create topic.");
          setTopics((prev) => [result, ...prev]);
          return result;
        },
        runSearch: async (createdTopic) => {
          showToast(`"${createdTopic.name}" created. Starting research...`, "info");
          await runSearchNow(createdTopic);
        },
      });

      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      log.error("Topic creation failed", { error: err });
      showToast(err.message || friendlyError(mapSupabaseError(err, "create-topic")), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (topic) => {
    await supabase.from("listening_topics").update({ active: !topic.active }).eq("id", topic.id);
    showToast(topic.active ? `"${topic.name}" paused.` : `"${topic.name}" resumed.`, "success");
    fetchTopics();
  };

  const deleteTopic = async (id, topicName) => {
    await supabase.from("listening_topics").delete().eq("id", id);
    showToast(`"${topicName}" deleted.`, "success");
    fetchTopics();
  };

  const captureAsIdea = async (hit) => {
    const { error: err } = await supabase.from("ideas").insert({
      user_id: user.id, source_url: hit.source_url, source_platform: hit.platform || "listening",
      context_text: hit.snippet || hit.title || "", title: hit.title || "Listening idea", status: "new",
      metadata: { listening_hit_id: hit.id, run_id: hit.run_id, cluster_id: hit.cluster_id },
    });
    if (err) showToast("Couldn't save as idea.", "error");
    else showToast("Idea saved from listening.", "success");
  };

  const saveClusterIdea = async (topic, cluster, angle = null) => {
    const citation = firstCitation(angle || cluster);
    const { error: err } = await supabase.from("ideas").insert({
      user_id: user.id,
      source_url: citationUrl(citation) || `last30days://cluster/${cluster.id}`,
      source_platform: "listening",
      context_text: angle?.angle || cluster.summary || cluster.title,
      title: angle?.title || cluster.title,
      status: "new",
      metadata: { topic_id: topic.id, cluster_id: cluster.id, run_id: cluster.run_id, evidence: angle?.evidence || [] },
    });
    if (err) showToast("Couldn't save idea.", "error");
    else showToast("Idea saved to inbox.", "success");
  };

  const createScriptOutline = async (topic, angle) => {
    const { error: err } = await supabase.from("ideas").insert({
      user_id: user.id,
      source_url: citationUrl(firstCitation(angle)) || `last30days://brief/${briefs[topic.id]?.id || topic.id}`,
      source_platform: "listening",
      title: `Script: ${angle.title}`,
      context_text: `${angle.angle}\n\nHook: ${angle.title}\nWhy: ${angle.why || ""}`,
      status: "new",
      metadata: { topic_id: topic.id, type: "script_outline", evidence: angle.evidence || [] },
    });
    if (err) showToast("Couldn't create script outline.", "error");
    else showToast("Script outline saved to inbox.", "success");
  };

  const markClusterIrrelevant = async (cluster) => {
    const metadata = { ...(cluster.metadata || {}), dismissed: true };
    const { error: err } = await supabase.from("listening_clusters").update({ metadata }).eq("id", cluster.id);
    if (err) showToast("Couldn't mark cluster irrelevant.", "error");
    else {
      setClusters((prev) => ({
        ...prev,
        [cluster.topic_id]: (prev[cluster.topic_id] || []).filter((item) => item.id !== cluster.id),
      }));
      showToast("Cluster hidden.", "success");
    }
  };

  return (
    <div ref={containerRef} className="mx-auto max-w-4xl p-4 sm:p-6" style={refreshing ? { opacity: 0.7 } : {}}>
      {refreshing && (
        <div className="fixed left-0 right-0 top-0 z-50 flex justify-center pt-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <PageHeader
        title="Listening"
        subtitle="Creator-grade research briefs from Reddit, HN, YouTube, GitHub, prediction markets, and the web."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add topic
          </Button>
        }
      />

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={fetchTopics}>Retry</Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (<Card key={i} className="h-28 animate-pulse" />))}
        </div>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="Discover what to create"
          description="Add a creator niche and get research briefs with angles, hooks, and source evidence."
          actionLabel="Add your first topic"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="space-y-4">
          {topics.map((topic) => {
            const latestRun = getLatestRun(runs[topic.id]);
            const isRunning = runningSearch[topic.id] || ["queued", "running"].includes(latestRun?.status);
            const statusInfo = getTopicStatus(topic, isRunning, latestRun);
            const topicBrief = briefs[topic.id];
            const topicClusters = (clusters[topic.id] || []).filter((cluster) => !cluster.metadata?.dismissed);
            const topicHits = hits[topic.id] || [];
            const isExpanded = expanded[topic.id];
            const isRawExpanded = expandedRaw[topic.id];

            return (
              <Card key={topic.id} className="overflow-hidden p-0">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{topic.name}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusInfo.color)}>{statusInfo.label}</span>
                        <Badge variant="secondary" className="capitalize text-[10px]">{topic.frequency}</Badge>
                      </div>
                      <div className="mb-1 flex flex-wrap gap-1">
                        {(topic.keywords || []).map((kw) => (
                          <span key={kw} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{kw}</span>
                        ))}
                      </div>
                      <div className="space-y-0.5 text-[10px] text-muted-foreground">
                        {topic.audience && <p>Audience: {topic.audience}</p>}
                        {topic.last_run_at && <p>Last searched: {new Date(topic.last_run_at).toLocaleString()}</p>}
                        {latestRun?.error_message && <p className="text-destructive">Last run failed: {latestRun.error_message}</p>}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => runSearchNow(topic)} disabled={isRunning}>
                        {isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        {isRunning ? "Searching" : "Search now"}
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 text-purple-600 dark:text-purple-400" onClick={() => runSearchNow(topic, true)} disabled={isRunning}>
                            <Sparkles className="h-4 w-4" /> Deep run
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>A more thorough research pass</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(topic)} aria-label={topic.active ? "Pause" : "Resume"}>
                            {topic.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{topic.active ? "Pause scheduled runs" : "Resume scheduled runs"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete({ id: topic.id, name: topic.name })} aria-label="Delete topic">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete topic</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <button onClick={() => toggleExpanded(topic.id)}
                    className="mt-3 flex w-full items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
                    <span>{isExpanded ? "Hide research brief" : isRunning ? "Show research brief (searching…)" : "Show research brief"}</span>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t bg-muted/30 px-4 py-3">
                    {isRunning && (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                        <LoaderCircle className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                        Searching sources and building a creator brief. Results will update after the worker finishes.
                      </div>
                    )}

                    {topicBrief ? (
                      <Card className="p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <h4 className="text-sm font-semibold text-foreground">{topicBrief.headline}</h4>
                        </div>
                        {topicBrief.what_changed && <p className="mb-3 text-xs text-muted-foreground">{topicBrief.what_changed}</p>}
                        {topicBrief.audience_pains?.length > 0 && (
                          <div className="mb-3">
                            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Why it matters</p>
                            <div className="flex flex-wrap gap-1">
                              {topicBrief.audience_pains.map((pain) => (
                                <span key={pain} className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{pain}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          {(topicBrief.content_angles || []).slice(0, 5).map((angle, index) => (
                            <div key={`${angle.title}-${index}`} className="rounded-lg border p-2.5">
                              <p className="text-xs font-medium text-foreground">{angle.title}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{angle.angle}</p>
                              {angle.why && <p className="mt-1 text-[10px] text-muted-foreground/80">{angle.why}</p>}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" className="h-7 gap-1 text-[10px]"
                                  onClick={() => saveClusterIdea(topic, { id: topicBrief.id, run_id: topicBrief.run_id, summary: topicBrief.what_changed, title: angle.title }, angle)}>
                                  <Lightbulb className="h-3 w-3" /> Save idea
                                </Button>
                                <Button variant="secondary" size="sm" className="h-7 gap-1 text-[10px]" onClick={() => createScriptOutline(topic, angle)}>
                                  <FileText className="h-3 w-3" /> Script outline
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {topicBrief.scripts_or_hooks?.length > 0 && (
                          <div className="mt-3">
                            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Hooks to try</p>
                            <div className="space-y-1">
                              {topicBrief.scripts_or_hooks.map((hook) => (
                                <p key={hook} className="text-[11px] text-muted-foreground">"{hook}"</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    ) : (
                      <Card className="p-4 text-center text-xs text-muted-foreground">
                        {isRunning ? "Brief is being generated." : "No creator brief yet. Click Search now to run research."}
                      </Card>
                    )}

                    {topicClusters.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] uppercase text-muted-foreground">Clusters</p>
                        <div className="space-y-2">
                          {topicClusters.slice(0, 8).map((cluster) => {
                            const sourceUrl = citationUrl(firstCitation(cluster));
                            return (
                              <Card key={cluster.id} className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-medium text-foreground">{cluster.title}</p>
                                    {cluster.summary && <p className="mt-1 text-[11px] text-muted-foreground">{cluster.summary}</p>}
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {(cluster.sources || []).map((source) => (
                                        <span key={source} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{source}</span>
                                      ))}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">{cluster.score ? Number(cluster.score).toFixed(2) : ""}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Button variant="secondary" size="sm" className="h-7 gap-1 text-[10px]" onClick={() => saveClusterIdea(topic, cluster)}>
                                    <Lightbulb className="h-3 w-3" /> Save idea
                                  </Button>
                                  {sourceUrl && (
                                    <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-[10px]">
                                      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-3 w-3" /> Open sources
                                      </a>
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px] text-muted-foreground" onClick={() => markClusterIrrelevant(cluster)}>
                                    <X className="h-3 w-3" /> Mark irrelevant
                                  </Button>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {runs[topic.id]?.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] uppercase text-muted-foreground">Run history</p>
                        <div className="flex flex-wrap gap-1">
                          {runs[topic.id].slice(0, 5).map((run) => (
                            <span key={run.id} className="rounded-full border bg-card px-2 py-1 text-[10px] text-muted-foreground">
                              {run.status} · {run.total_new_hits || 0} new · {new Date(run.created_at).toLocaleDateString()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <button onClick={() => toggleRaw(topic.id)}
                      className="flex w-full items-center justify-between rounded-lg bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent">
                      <span>{isRawExpanded ? "Hide raw results" : `Show raw results (${topicHits.length || latestRun?.total_candidates || 0})`}</span>
                      {isRawExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>

                    {isRawExpanded && (
                      <div className="max-h-[420px] space-y-2 overflow-y-auto">
                        {loadingHits[topic.id] ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">Loading results…</p>
                        ) : topicHits.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">{isRunning ? "Search in progress…" : "No raw results yet."}</p>
                        ) : topicHits.map((hit) => (
                          <Card key={hit.id} className="p-2.5 text-xs">
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <span className="flex-1 font-medium text-foreground">{hit.title || "Untitled"}</span>
                              <span className="flex-shrink-0 text-[10px] uppercase text-muted-foreground">{hit.platform}</span>
                            </div>
                            {hit.snippet && <p className="mb-2 line-clamp-2 text-muted-foreground">{hit.snippet}</p>}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">
                                {hit.sighting_count > 1 ? `${hit.sighting_count} sightings` : "New sighting"}
                              </span>
                              <div className="flex items-center gap-2">
                                <a href={hit.source_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                                  <ExternalLink className="h-3 w-3" /> View source
                                </a>
                                <Button variant="secondary" size="sm" className="h-7 gap-1 text-[10px]" onClick={() => captureAsIdea(hit)}>
                                  <Lightbulb className="h-3 w-3" /> Idea
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create topic — right-side sheet */}
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent side="right" className="p-0">
          <SheetHeader>
            <SheetTitle>New listening topic</SheetTitle>
            <SheetDescription>Describe a creator niche. We'll research it and build a brief.</SheetDescription>
          </SheetHeader>
          <Separator />
          <form onSubmit={createTopic} className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Topic name</Label>
              <Input id="t-name" required value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="e.g. AI video creation" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-audience">Audience</Label>
              <Input id="t-audience" value={form.audience} onChange={(e) => updateForm("audience", e.target.value)} placeholder="e.g. creators selling templates" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-format">Content format</Label>
                <Input id="t-format" value={form.contentFormat} onChange={(e) => updateForm("contentFormat", e.target.value)} placeholder="short-form video" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-freq">Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => updateForm("frequency", v)}>
                  <SelectTrigger id="t-freq"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (<SelectItem key={f} value={f}>{f === "daily" ? "Daily" : "Weekly"}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-keywords">Keywords</Label>
              <Input id="t-keywords" required value={form.keywords} onChange={(e) => updateForm("keywords", e.target.value)} placeholder="e.g. AI UGC, product demos, video ads" />
              <p className="text-[11px] text-muted-foreground">Comma-separated.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-comp">Competitors / tools</Label>
              <Input id="t-comp" value={form.competitors} onChange={(e) => updateForm("competitors", e.target.value)} placeholder="e.g. Runway, HeyGen, Arcads" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-plat">Platform focus</Label>
              <Input id="t-plat" value={form.platformFocus} onChange={(e) => updateForm("platformFocus", e.target.value)} placeholder="e.g. YouTube, Instagram, TikTok" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {saving ? "Creating…" : "Create & search now"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name}"?`}
        description="This removes the topic. Existing ideas you've saved from it are kept."
        confirmLabel="Delete"
        onConfirm={() => { deleteTopic(pendingDelete.id, pendingDelete.name); setPendingDelete(null); }}
      />
    </div>
  );
}
