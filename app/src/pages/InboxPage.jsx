import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { getImportStatus } from "../lib/ideaImport";
import { Plus, Trash2, ExternalLink, Search, CheckSquare, Square, X, Download } from "lucide-react";

const log = logger("InboxPage");

const STATUSES = ["new", "planned", "drafting", "published", "archived"];
const STATUS_COLORS = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  planned: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  drafting: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
const PLATFORM_ICONS = {
  instagram: "📸", youtube: "▶️", twitter: "🐦", reddit: "🤖",
  tiktok: "🎵", web: "🌐", telegram: "✈️", manual: "📝",
};

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function InboxPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("new");
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [contextText, setContextText] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [selected, setSelected] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [lastDeleted, setLastDeleted] = useState(null);
  const urlInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    fetchIdeas();
    const channel = supabase
      .channel("ideas-changes")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "ideas",
        filter: `user_id=eq.${user.id}`,
      }, () => fetchIdeas())
      .subscribe((status) => log.debug("Realtime status", { status }));
    return () => { supabase.removeChannel(channel); };
  }, [user, filter]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setShowForm(false);
        setSelectMode(false);
        setSelected(new Set());
      }
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) {
        e.preventDefault();
        setShowForm(true);
        setTimeout(() => urlInputRef.current?.focus(), 50);
      }
      const numKey = parseInt(e.key);
      if (numKey >= 1 && numKey <= 5 && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) {
        const statuses = ["all", ...STATUSES];
        setFilter(statuses[numKey - 1] || "new");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const fetchIdeas = async () => {
    setError(null);
    log.debug("Fetching ideas", { filter });
    let query = supabase.from("ideas").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error: err } = await query;
    if (err) {
      const code = mapSupabaseError(err, "load-ideas");
      log.error("Failed to load ideas", { error: err, code });
      setError(friendlyError(code));
    } else {
      setIdeas(data || []);
    }
    setLoading(false);
  };

  const filteredIdeas = debouncedSearch
    ? ideas.filter((idea) => {
        const searchLower = debouncedSearch.toLowerCase();
        return (
          (idea.context_text || "").toLowerCase().includes(searchLower) ||
          (idea.source_url || "").toLowerCase().includes(searchLower) ||
          (idea.title || "").toLowerCase().includes(searchLower) ||
          (idea.ai_summary || "").toLowerCase().includes(searchLower)
        );
      })
    : ideas;

  const createIdea = async (e) => {
    e.preventDefault();
    if (!url.trim()) { showToast(friendlyError("IDEA_INVALID_URL"), "warning"); return; }
    setSaving(true);
    log.info("Creating imported idea", { url: url.trim() });
    const session = (await supabase.auth.getSession()).data.session;
    const response = await fetch("/api/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        url: url.trim(),
        notes: contextText.trim(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(payload.error || "Couldn't save your idea. Try again.", "error");
    } else {
      showToast(
        payload.import_status === "import_failed"
          ? "Idea saved, but the media import needs attention."
          : "Idea imported to your inbox!",
        payload.import_status === "import_failed" ? "warning" : "success",
      );
      setUrl(""); setContextText(""); setShowForm(false);
      fetchIdeas();
    }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    const { error: err } = await supabase.from("ideas").update({ status }).eq("id", id);
    if (err) showToast(friendlyError(mapSupabaseError(err, "update-idea")), "error");
  };

  const deleteIdea = async (id) => {
    const idea = ideas.find((i) => i.id === id);
    setLastDeleted(idea);
    const { error: err } = await supabase.from("ideas").delete().eq("id", id);
    if (err) {
      showToast(friendlyError(mapSupabaseError(err, "delete-idea")), "error");
    } else {
      showToast(
        <span>Idea deleted. <button onClick={() => undoDelete(idea)} className="underline font-medium">Undo</button></span>,
        "info", 6000
      );
    }
  };

  const undoDelete = async (idea) => {
    log.info("Undo delete", { id: idea.id });
    const { error } = await supabase.from("ideas").insert({
      id: idea.id, user_id: idea.user_id, source_url: idea.source_url,
      source_platform: idea.source_platform, context_text: idea.context_text,
      status: idea.status, title: idea.title, ai_summary: idea.ai_summary,
      og_image_url: idea.og_image_url, created_at: idea.created_at,
      source_author: idea.source_author, metadata: idea.metadata,
    });
    if (error) {
      showToast("Couldn't restore the idea.", "error");
    } else {
      showToast("Idea restored!", "success");
      fetchIdeas();
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    setSelectMode(next.size > 0);
  };

  const selectAll = () => {
    if (selected.size === filteredIdeas.length) {
      setSelected(new Set());
      setSelectMode(false);
    } else {
      setSelected(new Set(filteredIdeas.map((i) => i.id)));
      setSelectMode(true);
    }
  };

  const bulkStatusChange = async (status) => {
    if (selected.size === 0) return;
    const { error } = await supabase.from("ideas").update({ status }).in("id", [...selected]);
    if (error) {
      showToast("Couldn't update all ideas. Try again.", "error");
    } else {
      showToast(`${selected.size} ideas marked as ${status}.`, "success");
      setSelected(new Set());
      setSelectMode(false);
      fetchIdeas();
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    const { error } = await supabase.from("ideas").delete().in("id", ids);
    if (error) {
      showToast("Couldn't delete all ideas. Try again.", "error");
    } else {
      showToast(`${ids.length} ideas deleted.`, "success");
      setSelected(new Set());
      setSelectMode(false);
      fetchIdeas();
    }
  };

  const exportCSV = () => {
    const headers = ["status", "source_url", "source_platform", "context_text", "title", "ai_summary", "created_at"];
    const rows = filteredIdeas.map((idea) => headers.map((h) => `"${String(idea[h] || "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contentplanner-ideas-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported!", "success");
  };

  const getDomain = (url) => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Idea Inbox</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800" title="Export CSV">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button onClick={() => { setShowForm(!showForm); setTimeout(() => urlInputRef.current?.focus(), 50); }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> New Idea
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createIdea} className="mb-6 rounded-xl border bg-white dark:bg-gray-800 dark:border-gray-700 p-4 shadow-sm">
          <div className="space-y-3">
            <input type="url" required ref={urlInputRef} value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL..." className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <textarea value={contextText} onChange={(e) => setContextText(e.target.value)}
              placeholder="Why did you save this? Add some context..." rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <div className="flex gap-2">
              <button type="submit" disabled={saving || !url.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Saving..." : "Save idea"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            </div>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas..." className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" /></button>
          )}
        </div>
        {["all", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              filter === s ? "bg-brand-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}>{s}</button>
        ))}
      </div>

      {selectMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 dark:bg-brand-900/20 px-3 py-2">
          <button onClick={selectAll} className="text-xs text-brand-600 hover:underline">
            {selected.size === filteredIdeas.length ? "Deselect all" : `Select all (${filteredIdeas.length})`}
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">|</span>
          <span className="text-xs text-gray-600 dark:text-gray-400">{selected.size} selected</span>
          <select onChange={(e) => { if (e.target.value) bulkStatusChange(e.target.value); e.target.value = ""; }}
            className="rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-2 py-1 text-xs">
            <option value="">Change status...</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <button onClick={bulkDelete} className="text-xs text-red-600 hover:underline ml-auto">Delete selected</button>
          <button onClick={() => { setSelected(new Set()); setSelectMode(false); }} className="p-0.5 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" /></button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchIdeas} className="ml-3 underline hover:no-underline text-xs">Try again</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : filteredIdeas.length === 0 ? (
        <div className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center text-gray-500 dark:text-gray-400">
          <div className="mb-3 text-4xl">💡</div>
          <p className="text-lg font-medium dark:text-white">{search ? "No matches found" : "No ideas yet"}</p>
          <p className="mt-1 text-sm">
            {search ? "Try a different search term." : "Paste a URL above or send a link to your Telegram bot."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIdeas.map((idea) => (
            <div key={idea.id} onClick={() => selectMode ? toggleSelect(idea.id) : navigate(`/inbox/${idea.id}`)}
              className={`group rounded-xl border bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm transition-shadow hover:shadow-md cursor-pointer ${
                selected.has(idea.id) ? "ring-2 ring-brand-500" : ""
              }`}>
              {(() => {
                const importStatus = getImportStatus(idea);
                return (
              <div className="flex items-start gap-3 p-4">
                {selectMode && (
                  <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                    {selected.has(idea.id)
                      ? <CheckSquare className="h-5 w-5 text-brand-600" />
                      : <Square className="h-5 w-5 text-gray-300" />}
                  </div>
                )}
                {idea.og_image_url && (
                  <img src={idea.og_image_url} alt="" className="w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs">{PLATFORM_ICONS[idea.source_platform] || "📝"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_COLORS[idea.status]}`}>{idea.status}</span>
                    {importStatus !== "ready" && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        importStatus === "import_failed"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                      }`}>
                        {importStatus === "import_failed" ? "Import failed" : "Importing"}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{getDomain(idea.source_url)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {idea.title || idea.ai_summary || getDomain(idea.source_url)}
                  </p>
                  {idea.context_text && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{idea.context_text}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <select value={idea.status} onChange={(e) => updateStatus(idea.id, e.target.value)}
                    className="rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-2 py-1 text-xs text-gray-600 dark:text-gray-400">
                    {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  <button onClick={() => deleteIdea(idea.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                    <Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
