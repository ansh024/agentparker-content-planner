import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { LayoutGrid, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import FirstRunTip from "@/components/common/FirstRunTip";

const log = logger("BoardPage");

const COLUMNS = [
  { id: "new", label: "Ideas", tint: "bg-blue-50/60 dark:bg-blue-900/10 border-blue-200/70 dark:border-blue-800/50", dot: "bg-blue-500" },
  { id: "planned", label: "Planned", tint: "bg-purple-50/60 dark:bg-purple-900/10 border-purple-200/70 dark:border-purple-800/50", dot: "bg-purple-500" },
  { id: "drafting", label: "Creating", tint: "bg-amber-50/60 dark:bg-amber-900/10 border-amber-200/70 dark:border-amber-800/50", dot: "bg-amber-500" },
  { id: "published", label: "Published", tint: "bg-green-50/60 dark:bg-green-900/10 border-green-200/70 dark:border-green-800/50", dot: "bg-green-500" },
];

export default function BoardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [columns, setColumns] = useState({ new: [], planned: [], drafting: [], published: [] });
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const fetchBoard = useCallback(async () => {
    const { data } = await supabase.from("ideas").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const grouped = { new: [], planned: [], drafting: [], published: [] };
    (data || []).forEach((idea) => {
      if (grouped[idea.status]) grouped[idea.status].push(idea);
      else grouped.new.push(idea);
    });
    setColumns(grouped);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) fetchBoard(); }, [user, fetchBoard]);

  const { containerRef, refreshing } = usePullToRefresh(fetchBoard);

  const moveCard = async (ideaId, toStatus) => {
    setColumns((prev) => {
      const next = { ...prev };
      for (const col of Object.keys(next)) {
        next[col] = next[col].filter((i) => i.id !== ideaId);
      }
      const movedIdea = Object.values(prev).flat().find((i) => i.id === ideaId);
      if (movedIdea) next[toStatus] = [...next[toStatus], { ...movedIdea, status: toStatus }];
      return next;
    });

    const { error } = await supabase.from("ideas").update({ status: toStatus }).eq("id", ideaId);
    if (error) {
      showToast("Couldn't move idea.", "error");
      fetchBoard();
    } else {
      showToast("Idea moved.", "success");
    }
  };

  const handleDragStart = (e, ideaId) => {
    setDragging(ideaId);
    e.dataTransfer.setData("ideaId", ideaId);
  };

  const handleDrop = async (e, toStatus) => {
    e.preventDefault();
    const ideaId = e.dataTransfer.getData("ideaId") || dragging;
    setDragging(null);
    setDragOver(null);
    if (ideaId) moveCard(ideaId, toStatus);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="rounded-xl border p-4">
              <Skeleton className="mb-3 h-5 w-20" />
              {[1, 2].map((i) => (<Skeleton key={i} className="mb-2 h-24 w-full rounded-lg" />))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalIdeas = Object.values(columns).flat().length;

  return (
    <div ref={containerRef} className="p-4 sm:p-6" style={refreshing ? { opacity: 0.7 } : {}}>
      {refreshing && (
        <div className="fixed left-0 right-0 top-0 z-50 flex justify-center pt-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <PageHeader
        title="Content Pipeline"
        subtitle={`${totalIdeas} ${totalIdeas === 1 ? "idea" : "ideas"} across ${COLUMNS.length} stages`}
      />

      {totalIdeas === 0 ? (
        <>
          <FirstRunTip id="board" title="This is your pipeline" className="mb-5">
            Each column is a stage. Drag a card from <b>Ideas</b> all the way to <b>Published</b> as you create. Capture some ideas first to fill it up.
          </FirstRunTip>
          <EmptyState
            icon={LayoutGrid}
            title="Your pipeline is empty"
            description="Capture ideas to see them flow through this board."
            actionLabel="Go to inbox"
            onAction={() => navigate("/inbox")}
          />
        </>
      ) : (
        <>
          <FirstRunTip id="board-drag" className="mb-4">
            Tip: drag any card between columns to update its status instantly.
          </FirstRunTip>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
            {COLUMNS.map((col) => (
              <div key={col.id}
                className="w-[280px] flex-shrink-0 snap-start sm:w-[300px]"
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
                onDragLeave={() => setDragOver((c) => (c === col.id ? null : c))}
                onDrop={(e) => handleDrop(e, col.id)}>
                <div className={cn(
                  "min-h-[200px] rounded-xl border p-3 transition-all",
                  col.tint,
                  dragOver === col.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}>
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <div className={cn("h-2.5 w-2.5 rounded-full", col.dot)} />
                    <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                    <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{columns[col.id]?.length || 0}</span>
                  </div>
                  <div className="min-h-[60px] space-y-2">
                    {columns[col.id]?.map((idea) => (
                      <div key={idea.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idea.id)}
                        onClick={() => navigate(`/inbox/${idea.id}`)}
                        className={cn(
                          "cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:shadow",
                          dragging === idea.id && "opacity-50"
                        )}>
                        <p className="truncate text-xs font-medium text-foreground">
                          {idea.context_text || idea.source_url?.slice(0, 80) || "Untitled"}
                        </p>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {idea.source_url ? new URL(idea.source_url).hostname.replace("www.", "") : "No source"}
                        </p>
                      </div>
                    ))}
                    {columns[col.id]?.length === 0 && (
                      <p className="py-4 text-center text-xs italic text-muted-foreground">Drop ideas here</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
