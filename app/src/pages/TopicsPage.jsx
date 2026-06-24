import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  ChevronRight, LoaderCircle, MoreVertical, Pause, Play, Plus, Radio,
  Search, Sparkles, Trash2,
} from "lucide-react";
import { getLatestRun, getTopicStatus, groupByTopic } from "../lib/topics";
import { queueResearchRun } from "../lib/listening";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import SearchInput from "@/components/common/SearchInput";
import TopicStatusBadge from "@/components/listening/TopicStatusBadge";
import TopicFormSheet from "@/components/listening/TopicFormSheet";

const log = logger("TopicsPage");
const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
];

function relativeTime(value) {
  if (!value) return null;
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return null;
  }
}

function StatTile({ label, value, accent }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", accent || "text-foreground")}>{value}</p>
    </Card>
  );
}

export default function TopicsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [topics, setTopics] = useState([]);
  const [runs, setRuns] = useState({});
  const [briefs, setBriefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [runningSearch, setRunningSearch] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null); // { id, name }

  const fetchTopics = useCallback(async () => {
    if (!user) return;
    log.debug("Fetching listening list");

    const topicsReq = supabase.from("listening_topics").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const runsReq = supabase.from("listening_runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80);
    const briefsReq = supabase.from("listening_briefs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);

    const [topicsRes, runsRes, briefsRes] = await Promise.all([topicsReq, runsReq, briefsReq]);

    if (topicsRes.error) {
      setError(friendlyError(mapSupabaseError(topicsRes.error, "load-topics")));
    } else {
      setTopics(topicsRes.data || []);
      setError(null);
    }

    if (!runsRes.error) setRuns(groupByTopic(runsRes.data || []));
    if (!briefsRes.error) {
      const grouped = groupByTopic(briefsRes.data || []);
      setBriefs(Object.fromEntries(Object.entries(grouped).map(([topicId, rows]) => [topicId, rows[0]])));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) fetchTopics(); }, [user, fetchTopics]);

  const { containerRef, refreshing } = usePullToRefresh(fetchTopics);

  const summary = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    let active = 0;
    let dueOrOverdue = 0;
    let newThisWeek = 0;
    for (const topic of topics) {
      if (topic.active) active += 1;
      const label = getTopicStatus(topic, false, getLatestRun(runs[topic.id])).label;
      if (label === "Due soon" || label === "Overdue") dueOrOverdue += 1;
    }
    for (const topicRuns of Object.values(runs)) {
      for (const run of topicRuns) {
        if (new Date(run.created_at).getTime() >= weekAgo) newThisWeek += run.total_new_hits || 0;
      }
    }
    return { total: topics.length, active, dueOrOverdue, newThisWeek };
  }, [topics, runs]);

  const visibleTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return topics.filter((topic) => {
      if (statusFilter === "active" && !topic.active) return false;
      if (statusFilter === "paused" && topic.active) return false;
      if (!q) return true;
      const haystack = [topic.name, ...(topic.keywords || []), topic.audience].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [topics, query, statusFilter]);

  const runSearchNow = async (topic, deep = false) => {
    setRunningSearch((prev) => ({ ...prev, [topic.id]: true }));
    log.info("Queuing research", { id: topic.id, deep });
    try {
      const { ok, result } = await queueResearchRun({ supabase, topicId: topic.id, deep });
      if (!ok) {
        showToast(result.error || "Research failed to queue.", "error");
        return;
      }
      showToast(result.message || "Research run queued.", result.workerError ? "warning" : "success");
      await fetchTopics();
    } catch (err) {
      log.error("Research run failed", { error: err });
      showToast(err.message || "Research failed. Try again.", "error");
    } finally {
      setRunningSearch((prev) => ({ ...prev, [topic.id]: false }));
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
          {[1, 2, 3].map((i) => (<Card key={i} className="h-24 animate-pulse" />))}
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
        <div className="space-y-5">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Topics" value={summary.total} />
            <StatTile label="Active" value={summary.active} />
            <StatTile label="Due / overdue" value={summary.dueOrOverdue} accent={summary.dueOrOverdue > 0 ? "text-amber-600 dark:text-amber-400" : undefined} />
            <StatTile label="New this week" value={summary.newThisWeek} accent={summary.newThisWeek > 0 ? "text-primary" : undefined} />
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput value={query} onChange={setQuery} placeholder="Search topics…" className="flex-1" />
            <div className="flex rounded-lg border bg-card p-0.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                    statusFilter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Topic rows */}
          {visibleTopics.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No topics match your filters.</p>
          ) : (
            <div className="space-y-3">
              {visibleTopics.map((topic) => {
                const latestRun = getLatestRun(runs[topic.id]);
                const isRunning = runningSearch[topic.id] || ["queued", "running"].includes(latestRun?.status);
                const brief = briefs[topic.id];
                const keywords = topic.keywords || [];
                const lastRun = relativeTime(topic.last_run_at);

                return (
                  <Card key={topic.id} className="group relative overflow-hidden transition-colors hover:border-primary/40">
                    <Link to={`/topics/${topic.id}`} className="block p-4 pr-12 sm:p-5 sm:pr-14">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{topic.name}</h3>
                        <TopicStatusBadge topic={topic} isRunning={isRunning} latestRun={latestRun} />
                        <Badge variant="secondary" className="capitalize">{topic.frequency}</Badge>
                      </div>

                      {brief?.headline && (
                        <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">{brief.headline}</p>
                      )}

                      {keywords.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          {keywords.slice(0, 3).map((kw) => (
                            <span key={kw} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{kw}</span>
                          ))}
                          {keywords.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{keywords.length - 3}</span>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {lastRun && <span>Last searched {lastRun}</span>}
                        {latestRun?.total_new_hits > 0 && <span>{latestRun.total_new_hits} new</span>}
                        {latestRun?.error_message && <span className="text-destructive">Last run failed</span>}
                      </div>
                    </Link>

                    {/* Quick actions — outside the Link so clicks don't navigate */}
                    <div className="absolute right-3 top-3 flex items-center gap-1 sm:right-4 sm:top-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-primary"
                            onClick={() => runSearchNow(topic)}
                            disabled={isRunning}
                            aria-label="Search now"
                          >
                            {isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Search now</TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => runSearchNow(topic, true)} disabled={isRunning}>
                            <Sparkles className="h-4 w-4" /> Deep run
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(topic)}>
                            {topic.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            {topic.active ? "Pause" : "Resume"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setPendingDelete({ id: topic.id, name: topic.name })}
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <TopicFormSheet open={showForm} onOpenChange={setShowForm} onCreated={() => fetchTopics()} />

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
