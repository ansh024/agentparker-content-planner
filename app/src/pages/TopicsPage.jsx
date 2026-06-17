import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Lightbulb,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  createTopicAndSearch,
  getLatestRun,
  getTopicStatus,
  groupByTopic,
  mergeTopicHits,
} from "../lib/topics";

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
  const [showInfo, setShowInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: "",
    audience: "",
    contentFormat: "short-form video",
    keywords: "",
    competitors: "",
    platformFocus: "YouTube, Instagram, TikTok",
    frequency: "daily",
  });

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const fetchTopics = useCallback(async () => {
    if (!user) return;
    log.debug("Fetching listening dashboard data");

    const topicsReq = supabase
      .from("listening_topics")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const runsReq = supabase
      .from("listening_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    const briefsReq = supabase
      .from("listening_briefs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);

    const clustersReq = supabase
      .from("listening_clusters")
      .select("*")
      .eq("user_id", user.id)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(120);

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
    const { data } = await supabase
      .from("listening_hits")
      .select("*")
      .eq("topic_id", topicId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .order("captured_at", { ascending: false })
      .limit(80);
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
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

      setForm({
        name: "",
        audience: "",
        contentFormat: "short-form video",
        keywords: "",
        competitors: "",
        platformFocus: "YouTube, Instagram, TikTok",
        frequency: "daily",
      });
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
      user_id: user.id,
      source_url: hit.source_url,
      source_platform: hit.platform || "listening",
      context_text: hit.snippet || hit.title || "",
      title: hit.title || "Listening idea",
      status: "new",
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
      metadata: {
        topic_id: topic.id,
        cluster_id: cluster.id,
        run_id: cluster.run_id,
        evidence: angle?.evidence || [],
      },
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
    <div
      ref={containerRef}
      className="p-4 sm:p-6 max-w-4xl mx-auto"
      style={refreshing ? { opacity: 0.7 } : {}}
    >
      {refreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Listening</h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Creator-grade research briefs from Reddit, HN, YouTube, GitHub, prediction markets, and the web.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowInfo(!showInfo)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
            How it works
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Add Topic
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="mb-6 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">How listening works</h3>
          <ol className="space-y-1.5 text-xs text-blue-800 dark:text-blue-300 pl-4 list-decimal">
            <li>Add the audience, format, keywords, tools, and target platforms for a creator niche.</li>
            <li>Search now queues a last30days research run and shows queued/running/succeeded state.</li>
            <li>The brief answers what to make now, why it matters, and which sources prove it.</li>
            <li>Clusters and raw hits stay below the brief so each run builds on prior sightings.</li>
          </ol>
        </div>
      )}

      {showForm && (
        <form onSubmit={createTopic} className="mb-6 rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Topic name
              <input type="text" required value={form.name} onChange={(e) => updateForm("name", e.target.value)}
                placeholder="e.g. AI video creation" className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Audience
              <input type="text" value={form.audience} onChange={(e) => updateForm("audience", e.target.value)}
                placeholder="e.g. creators selling templates" className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Content format
              <input type="text" value={form.contentFormat} onChange={(e) => updateForm("contentFormat", e.target.value)}
                placeholder="e.g. short-form video" className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Frequency
              <select value={form.frequency} onChange={(e) => updateForm("frequency", e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm">
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>{frequency === "daily" ? "Daily" : "Weekly"}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
              Keywords
              <input type="text" required value={form.keywords} onChange={(e) => updateForm("keywords", e.target.value)}
                placeholder="e.g. AI UGC, product demos, video ads" className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Competitors/tools
              <input type="text" value={form.competitors} onChange={(e) => updateForm("competitors", e.target.value)}
                placeholder="e.g. Runway, HeyGen, Arcads" className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Platform focus
              <input type="text" value={form.platformFocus} onChange={(e) => updateForm("platformFocus", e.target.value)}
                placeholder="e.g. YouTube, Instagram, TikTok" className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {saving ? "Creating..." : "Create & search now"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error} <button onClick={fetchTopics} className="ml-3 underline text-xs">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" />
      ) : topics.length === 0 ? (
        <div className="rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <Sparkles className="mx-auto mb-4 h-10 w-10 text-brand-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Discover what to create</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Add a creator niche and get research briefs with angles, hooks, and source evidence.
          </p>
          <button onClick={() => setShowForm(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 min-h-[44px]">
            <Plus className="h-4 w-4" /> Add your first topic
          </button>
        </div>
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
              <section key={topic.id} className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{topic.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                        <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] text-gray-600 dark:text-gray-400 capitalize">{topic.frequency}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {(topic.keywords || []).map((kw) => (
                          <span key={kw} className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-gray-400">{kw}</span>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 space-y-0.5">
                        {topic.audience && <p>Audience: {topic.audience}</p>}
                        {topic.last_run_at && <p>Last searched: {new Date(topic.last_run_at).toLocaleString()}</p>}
                        {latestRun?.error_message && <p className="text-red-500">Last run failed: {latestRun.error_message}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      <button onClick={() => runSearchNow(topic)} disabled={isRunning}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 min-h-[32px]">
                        {isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        <span>{isRunning ? "Searching" : "Search now"}</span>
                      </button>
                      <button onClick={() => runSearchNow(topic, true)} disabled={isRunning}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50 min-h-[32px]">
                        <Sparkles className="h-4 w-4" />
                        <span>Deep run</span>
                      </button>
                      <button onClick={() => toggleActive(topic)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 min-w-[32px] min-h-[32px]"
                        title={topic.active ? "Pause" : "Resume"}>
                        {topic.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button onClick={() => deleteTopic(topic.id, topic.name)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 min-w-[32px] min-h-[32px]" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <button onClick={() => toggleExpanded(topic.id)}
                    className="mt-3 w-full flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <span>{isExpanded ? "Hide research brief" : isRunning ? "Show research brief (searching...)" : "Show research brief"}</span>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 space-y-3">
                    {isRunning && (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                        Searching sources and building a creator brief. Results will update after the worker finishes.
                      </div>
                    )}

                    {topicBrief ? (
                      <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-brand-600" />
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{topicBrief.headline}</h4>
                        </div>
                        {topicBrief.what_changed && <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">{topicBrief.what_changed}</p>}
                        {topicBrief.audience_pains?.length > 0 && (
                          <div className="mb-3">
                            <p className="text-[10px] uppercase text-gray-400 mb-1">Why it matters</p>
                            <div className="flex flex-wrap gap-1">
                              {topicBrief.audience_pains.map((pain) => (
                                <span key={pain} className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1 text-[10px] text-gray-600 dark:text-gray-300">{pain}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          {(topicBrief.content_angles || []).slice(0, 5).map((angle, index) => (
                            <div key={`${angle.title}-${index}`} className="rounded-lg border dark:border-gray-700 p-2.5">
                              <p className="text-xs font-medium text-gray-900 dark:text-white">{angle.title}</p>
                              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{angle.angle}</p>
                              {angle.why && <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{angle.why}</p>}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button onClick={() => saveClusterIdea(topic, { id: topicBrief.id, run_id: topicBrief.run_id, summary: topicBrief.what_changed, title: angle.title }, angle)}
                                  className="inline-flex items-center gap-1 rounded bg-brand-100 dark:bg-brand-900/30 px-2 py-1 text-[10px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-800">
                                  <Lightbulb className="h-3 w-3" /> Save idea
                                </button>
                                <button onClick={() => createScriptOutline(topic, angle)}
                                  className="inline-flex items-center gap-1 rounded bg-purple-100 dark:bg-purple-900/30 px-2 py-1 text-[10px] font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800">
                                  <FileText className="h-3 w-3" /> Script outline
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {topicBrief.scripts_or_hooks?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[10px] uppercase text-gray-400 mb-1">Hooks to try</p>
                            <div className="space-y-1">
                              {topicBrief.scripts_or_hooks.map((hook) => (
                                <p key={hook} className="text-[11px] text-gray-600 dark:text-gray-300">"{hook}"</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center text-xs text-gray-400 dark:text-gray-500">
                        {isRunning ? "Brief is being generated." : "No creator brief yet. Click Search now to run research."}
                      </div>
                    )}

                    {topicClusters.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] uppercase text-gray-400">Clusters</p>
                        <div className="space-y-2">
                          {topicClusters.slice(0, 8).map((cluster) => {
                            const sourceUrl = citationUrl(firstCitation(cluster));
                            return (
                              <div key={cluster.id} className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-medium text-gray-900 dark:text-white">{cluster.title}</p>
                                    {cluster.summary && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{cluster.summary}</p>}
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {(cluster.sources || []).map((source) => (
                                        <span key={source} className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-300">{source}</span>
                                      ))}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-gray-400">{cluster.score ? Number(cluster.score).toFixed(2) : ""}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button onClick={() => saveClusterIdea(topic, cluster)}
                                    className="inline-flex items-center gap-1 rounded bg-brand-100 dark:bg-brand-900/30 px-2 py-1 text-[10px] font-medium text-brand-700 dark:text-brand-300">
                                    <Lightbulb className="h-3 w-3" /> Save idea
                                  </button>
                                  {sourceUrl && (
                                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                      <ExternalLink className="h-3 w-3" /> Open sources
                                    </a>
                                  )}
                                  <button onClick={() => markClusterIrrelevant(cluster)}
                                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <X className="h-3 w-3" /> Mark irrelevant
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {runs[topic.id]?.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] uppercase text-gray-400">Run history</p>
                        <div className="flex flex-wrap gap-1">
                          {runs[topic.id].slice(0, 5).map((run) => (
                            <span key={run.id} className="rounded-full bg-white dark:bg-gray-800 border dark:border-gray-700 px-2 py-1 text-[10px] text-gray-500 dark:text-gray-300">
                              {run.status} · {run.total_new_hits || 0} new · {new Date(run.created_at).toLocaleDateString()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <button onClick={() => toggleRaw(topic.id)}
                      className="w-full flex items-center justify-between rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <span>{isRawExpanded ? "Hide raw results" : `Show raw results (${topicHits.length || latestRun?.total_candidates || 0})`}</span>
                      {isRawExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>

                    {isRawExpanded && (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {loadingHits[topic.id] ? (
                          <p className="py-4 text-center text-xs text-gray-400">Loading results...</p>
                        ) : topicHits.length === 0 ? (
                          <p className="py-4 text-center text-xs text-gray-400">{isRunning ? "Search in progress..." : "No raw results yet."}</p>
                        ) : topicHits.map((hit) => (
                          <div key={hit.id} className="rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 p-2.5 text-xs">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-gray-900 dark:text-white flex-1">{hit.title || "Untitled"}</span>
                              <span className="text-[10px] uppercase text-gray-400 dark:text-gray-500 flex-shrink-0">{hit.platform}</span>
                            </div>
                            {hit.snippet && <p className="text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{hit.snippet}</p>}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-400 dark:text-gray-500">
                                {hit.sighting_count > 1 ? `${hit.sighting_count} sightings` : "New sighting"}
                              </span>
                              <div className="flex items-center gap-2">
                                <a href={hit.source_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline text-[10px]">
                                  <ExternalLink className="h-3 w-3" /> View source
                                </a>
                                <button onClick={() => captureAsIdea(hit)}
                                  className="inline-flex items-center gap-1 rounded bg-brand-100 dark:bg-brand-900/30 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-800 min-h-[28px]">
                                  <Lightbulb className="h-3 w-3" /> Idea
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
