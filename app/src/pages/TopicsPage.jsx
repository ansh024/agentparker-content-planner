import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { Plus, Pause, Play, Trash2, ExternalLink, RefreshCw, Sparkles, Lightbulb, ChevronDown, ChevronRight } from "lucide-react";

const log = logger("TopicsPage");
const FREQUENCIES = ["daily", "weekly"];

function getTopicStatus(topic) {
  if (!topic.active) return { label: "Paused", color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" };
  if (!topic.last_run_at) return { label: "Ready to run", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" };
  const hoursSince = (Date.now() - new Date(topic.last_run_at).getTime()) / 3600000;
  if (hoursSince < 24) return { label: "Up to date", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" };
  if (hoursSince < 48) return { label: "Due soon", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" };
  return { label: "Overdue", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" };
}

export default function TopicsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [topics, setTopics] = useState([]);
  const [hits, setHits] = useState({});
  const [expandedHits, setExpandedHits] = useState({});
  const [loadingHits, setLoadingHits] = useState({});
  const [runningSearch, setRunningSearch] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetchTopics = useCallback(async () => {
    log.debug("Fetching topics");
    const { data, error: err } = await supabase
      .from("listening_topics").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (err) setError(friendlyError(mapSupabaseError(err, "load-topics")));
    else { setTopics(data || []); setError(null); }
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) fetchTopics(); }, [user, fetchTopics]);

  const { containerRef, refreshing } = usePullToRefresh(fetchTopics);

  const fetchHits = async (topicId) => {
    setExpandedHits((prev) => ({ ...prev, [topicId]: !prev[topicId] }));
    if (!expandedHits[topicId]) {
      setLoadingHits((prev) => ({ ...prev, [topicId]: true }));
      const { data } = await supabase
        .from("listening_hits").select("*").eq("topic_id", topicId)
        .order("engagement_score", { ascending: false }).limit(30);
      setHits((prev) => ({ ...prev, [topicId]: data || [] }));
      setLoadingHits((prev) => ({ ...prev, [topicId]: false }));
    }
  };

  const captureAsIdea = async (hit) => {
    const { error: err } = await supabase.from("ideas").insert({
      user_id: user.id, source_url: hit.source_url, source_platform: hit.platform,
      context_text: hit.snippet || hit.title || "",
      title: hit.title, status: "new",
    });
    if (err) showToast("Couldn't save as idea.", "error");
    else {
      showToast("Idea saved from listening!", "success");
      // Update the hit to mark it captured (optional UI change)
      setHits((prev) => {
        const topicHits = prev[hit.topic_id]?.map((h) =>
          h.id === hit.id ? { ...h, _captured: true } : h
        );
        return { ...prev, [hit.topic_id]: topicHits };
      });
    }
  };

  const runSearchNow = async (topic) => {
    setRunningSearch((prev) => ({ ...prev, [topic.id]: true }));
    log.info("Running search for topic", { id: topic.id, name: topic.name });

    try {
      const session = await supabase.auth.getSession();
      const res = await fetch("/api/listening/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({ topicId: topic.id, keywords: topic.keywords, platforms: topic.platforms || ["reddit", "web"] }),
      });

      const result = await res.json();
      if (result.ok) {
        showToast(result.message, "success");
        fetchTopics(); // Refresh to get updated last_run_at
        if (expandedHits[topic.id]) {
          setExpandedHits((prev) => ({ ...prev, [topic.id]: false }));
          setTimeout(() => fetchHits(topic.id), 500);
        }
      } else {
        showToast(result.error || "Search failed. Check API key.", "error");
      }
    } catch (err) {
      log.error("Search run failed", { error: err });
      showToast("Search failed. Try again.", "error");
    } finally {
      setRunningSearch((prev) => ({ ...prev, [topic.id]: false }));
    }
  };

  const createTopic = async (e) => {
    e.preventDefault();
    if (!name.trim() || !keywords.trim()) { showToast("Enter a name and keywords.", "warning"); return; }
    setSaving(true);
    const keywordArray = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const { error: err } = await supabase.from("listening_topics").insert({
      user_id: user.id, name: name.trim(), keywords: keywordArray, frequency, active: true,
    });
    if (err) showToast(friendlyError(mapSupabaseError(err, "create-topic")), "error");
    else {
      showToast(`"${name.trim()}" added. Click 'Search now' to find content.`, "success");
      setName(""); setKeywords(""); setShowForm(false); fetchTopics();
    }
    setSaving(false);
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
    <div
      ref={containerRef}
      className="p-4 sm:p-6 max-w-3xl mx-auto"
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
            Real-time search across Reddit, HN, YouTube, and the web.
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
            <li>Add a topic with keywords (e.g. "content creation trends")</li>
            <li>Click <strong>Search now</strong> to run a live search via Firecrawl</li>
            <li>Results appear sorted by relevance from Reddit, HN, YouTube, and web</li>
            <li>Click <strong>💡 Capture as idea</strong> on any hit to save it to your inbox</li>
          </ol>
          <p className="mt-3 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Powered by Firecrawl — searches live content across platforms.
          </p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={createTopic} className="mb-6 rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Topic name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SaaS marketing" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Keywords (comma separated)</label>
              <input type="text" required value={keywords} onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. content creation trends, social media tools"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm">
                {FREQUENCIES.map((f) => (<option key={f} value={f}>{f === "daily" ? "Daily" : "Weekly"}</option>))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Creating..." : "Create & search now"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            </div>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error} <button onClick={fetchTopics} className="ml-3 underline text-xs">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{/* skeletons */}</div>
      ) : topics.length === 0 ? (
        <div className="rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <div className="mb-4 text-5xl">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Discover what to create</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
            Add topics you want to track. We'll search Reddit, HN, YouTube, and the web for trending discussions.
          </p>
          <button onClick={() => setShowForm(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 min-h-[44px]">
            <Sparkles className="h-4 w-4" /> Add your first topic
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {topics.map((topic) => {
            const statusInfo = getTopicStatus(topic);
            const topicHits = hits[topic.id] || [];
            const isExpanded = expandedHits[topic.id];
            const isLoadingHits = loadingHits[topic.id];
            const isRunning = runningSearch[topic.id];

            return (
              <div key={topic.id} className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{topic.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                        <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] text-gray-600 dark:text-gray-400 capitalize">{topic.frequency}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {topic.keywords.map((kw) => (
                          <span key={kw} className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-gray-400">{kw}</span>
                        ))}
                      </div>
                      {topic.last_run_at && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">Last searched: {new Date(topic.last_run_at).toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => runSearchNow(topic)} disabled={isRunning}
                        className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 min-w-[32px] min-h-[32px]"
                        title="Search now">
                        {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

                  {/* Show hits toggle */}
                  <button onClick={() => fetchHits(topic.id)}
                    className="mt-3 w-full flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <span>{isExpanded ? "Hide results" : `Show results (${topicHits.length || "..."})`}</span>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Hits list */}
                {isExpanded && (
                  <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3">
                    {isLoadingHits ? (
                      <div className="space-y-2">{/* skeleton */}</div>
                    ) : topicHits.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500">No results yet. Click Search now to find content.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {topicHits.map((hit) => (
                          <div key={hit.id} className={`rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 p-2.5 text-xs ${hit._captured ? "opacity-40" : ""}`}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-gray-900 dark:text-white truncate flex-1">{hit.title || "Untitled"}</span>
                              <span className="text-[10px] uppercase text-gray-400 dark:text-gray-500 flex-shrink-0">{hit.platform}</span>
                            </div>
                            {hit.snippet && <p className="text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{hit.snippet}</p>}
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 dark:text-gray-500">
                                {hit.author && `by ${hit.author}`} {hit.engagement_score ? ` • ${hit.engagement_score} pts` : ""}
                              </span>
                              <div className="flex items-center gap-2">
                                <a href={hit.source_url} target="_blank" rel="noopener noreferrer"
                                  className="text-brand-600 dark:text-brand-400 hover:underline text-[10px]">
                                  View source
                                </a>
                                <button onClick={() => captureAsIdea(hit)}
                                  className="inline-flex items-center gap-1 rounded bg-brand-100 dark:bg-brand-900/30 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-800 min-h-[28px]"
                                  title="Save as idea">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
