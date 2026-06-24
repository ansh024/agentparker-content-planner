import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { getImportStatus } from "../lib/ideaImport";
import {
  Plus, Trash2, Search, CheckSquare, Square, X, Download,
  SlidersHorizontal, ArrowDownUp, Lightbulb, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import PageHeader from "@/components/common/PageHeader";
import SearchInput from "@/components/common/SearchInput";
import EmptyState from "@/components/common/EmptyState";
import FirstRunTip from "@/components/common/FirstRunTip";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import StatusBadge, { IDEA_STATUSES, STATUS_LABELS } from "@/components/common/StatusBadge";

const log = logger("InboxPage");

const STATUSES = IDEA_STATUSES;
const PLATFORM_ICONS = {
  instagram: "📸", youtube: "▶️", twitter: "🐦", reddit: "🤖",
  tiktok: "🎵", web: "🌐", telegram: "✈️", manual: "📝",
};

const SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
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
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [pendingDelete, setPendingDelete] = useState(null); // single idea id
  const [confirmBulk, setConfirmBulk] = useState(false);
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

  // Platforms present in the current set (for the filter popover)
  const availablePlatforms = [...new Set(ideas.map((i) => i.source_platform).filter(Boolean))];

  let filteredIdeas = debouncedSearch
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

  if (platformFilter !== "all") {
    filteredIdeas = filteredIdeas.filter((i) => i.source_platform === platformFilter);
  }
  if (sort === "oldest") {
    filteredIdeas = [...filteredIdeas].reverse();
  }

  const activeFilterCount = (platformFilter !== "all" ? 1 : 0);

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
    setConfirmBulk(false);
  };

  const exportCSV = () => {
    const headers = ["status", "source_url", "source_platform", "context_text", "title", "ai_summary", "created_at"];
    const rows = filteredIdeas.map((idea) => headers.map((h) => `"${String(idea[h] || "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const dl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dl; a.download = `contentplanner-ideas-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(dl);
    showToast("CSV exported!", "success");
  };

  const getDomain = (u) => { try { return new URL(u).hostname.replace("www.", ""); } catch { return u; } };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title="Idea Inbox"
        subtitle="Capture links and notes, then triage them into your pipeline."
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={exportCSV} aria-label="Export CSV">
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export filtered ideas as CSV</TooltipContent>
            </Tooltip>
            <Button onClick={() => { setShowForm((v) => !v); setTimeout(() => urlInputRef.current?.focus(), 50); }}>
              <Plus className="h-4 w-4" /> New idea
            </Button>
          </>
        }
      />

      <FirstRunTip id="inbox" title="Welcome to your Inbox" className="mb-5">
        Paste a link or note with <b>New idea</b> (or press <kbd className="rounded border bg-muted px-1 text-xs">N</kbd>).
        You can also share links straight from Instagram, YouTube or the web — install the app from the menu to enable one-tap capture.
      </FirstRunTip>

      {showForm && (
        <Card className="mb-6 p-4">
          <form onSubmit={createIdea} className="space-y-3">
            <Input type="url" required ref={urlInputRef} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a URL…" />
            <Textarea value={contextText} onChange={(e) => setContextText(e.target.value)} placeholder="Why did you save this? Add some context…" rows={2} />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !url.trim()}>{saving ? "Saving…" : "Save idea"}</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Filter / search toolbar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search ideas…" className="min-w-[200px] flex-1 sm:max-w-xs" />

          {/* Filters popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && <Badge className="ml-0.5 h-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60">
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
                  <Select value={platformFilter} onValueChange={setPlatformFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All platforms</SelectItem>
                      {availablePlatforms.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PLATFORM_ICONS[p] || "📝"} <span className="capitalize">{p}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setPlatformFilter("all")}>
                    Clear filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowDownUp className="h-4 w-4" /> {SORTS[sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                {Object.entries(SORTS).map(([k, label]) => (
                  <DropdownMenuRadioItem key={k} value={k}>{label}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={selectMode ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => { setSelectMode((v) => !v); if (selectMode) setSelected(new Set()); }}
              >
                <CheckSquare className="h-4 w-4" /> Select
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select multiple ideas to edit in bulk</TooltipContent>
          </Tooltip>
        </div>

        {/* Status segmented filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                filter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <button onClick={selectAll} className="text-xs font-medium text-primary hover:underline">
            {selected.size === filteredIdeas.length && filteredIdeas.length > 0 ? "Deselect all" : `Select all (${filteredIdeas.length})`}
          </button>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <Select onValueChange={(v) => bulkStatusChange(v)} value="">
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Change status…" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost" size="sm"
            className="ml-auto h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={selected.size === 0}
            onClick={() => setConfirmBulk(true)}
          >
            Delete selected
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelected(new Set()); setSelectMode(false); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={fetchIdeas}>Try again</Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </Card>
          ))}
        </div>
      ) : filteredIdeas.length === 0 ? (
        <EmptyState
          icon={search || activeFilterCount ? Search : Lightbulb}
          title={search || activeFilterCount ? "No matches found" : "No ideas yet"}
          description={
            search || activeFilterCount
              ? "Try a different search term or clear your filters."
              : "Paste a URL above, or share a link to ContentPlanner from any app."
          }
          actionLabel={search || activeFilterCount ? undefined : "Capture your first idea"}
          onAction={search || activeFilterCount ? undefined : () => { setShowForm(true); setTimeout(() => urlInputRef.current?.focus(), 50); }}
        />
      ) : (
        <div className="space-y-2">
          {filteredIdeas.map((idea) => {
            const importStatus = getImportStatus(idea);
            const isSelected = selected.has(idea.id);
            return (
              <Card
                key={idea.id}
                onClick={() => selectMode ? toggleSelect(idea.id) : navigate(`/inbox/${idea.id}`)}
                className={cn(
                  "group cursor-pointer p-0 transition-shadow hover:shadow-md",
                  isSelected && "ring-2 ring-primary"
                )}
              >
                <div className="flex items-start gap-3 p-4">
                  {selectMode && (
                    <div className="mt-0.5" onClick={(e) => { e.stopPropagation(); toggleSelect(idea.id); }}>
                      {isSelected
                        ? <CheckSquare className="h-5 w-5 text-primary" />
                        : <Square className="h-5 w-5 text-muted-foreground/50" />}
                    </div>
                  )}
                  {idea.og_image_url && (
                    <img src={idea.og_image_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg bg-muted object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs">{PLATFORM_ICONS[idea.source_platform] || "📝"}</span>
                      <StatusBadge status={idea.status} />
                      {importStatus !== "ready" && (
                        <Badge
                          variant={importStatus === "import_failed" ? "destructive" : "secondary"}
                          className={cn("text-[10px]", importStatus === "importing" && "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300")}
                        >
                          {importStatus === "import_failed" ? "Import failed" : "Importing"}
                        </Badge>
                      )}
                      <span className="truncate text-[10px] text-muted-foreground">{getDomain(idea.source_url)}</span>
                    </div>
                    <p className="truncate text-sm font-medium text-foreground">
                      {idea.title || idea.ai_summary || getDomain(idea.source_url)}
                    </p>
                    {idea.context_text && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{idea.context_text}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <Select value={idea.status} onValueChange={(v) => updateStatus(idea.id, v)}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete(idea.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete idea</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm single delete */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Delete this idea?"
        description="You can undo this from the notification right after."
        confirmLabel="Delete"
        onConfirm={() => { deleteIdea(pendingDelete); setPendingDelete(null); }}
      />

      {/* Confirm bulk delete */}
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Delete ${selected.size} ideas?`}
        description="This can't be undone in bulk."
        confirmLabel={`Delete ${selected.size}`}
        onConfirm={bulkDelete}
      />
    </div>
  );
}
