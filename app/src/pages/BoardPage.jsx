import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { Lightbulb, ChevronRight } from "lucide-react";

const log = logger("BoardPage");

const COLUMNS = [
  { id: "new", label: "Ideas", color: "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800", dot: "bg-blue-500" },
  { id: "planned", label: "Planned", color: "bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800", dot: "bg-purple-500" },
  { id: "drafting", label: "Creating", color: "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  { id: "published", label: "Published", color: "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800", dot: "bg-green-500" },
];

export default function BoardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [columns, setColumns] = useState({ new: [], planned: [], drafting: [], published: [] });
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);

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
    // Optimistic update
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
      fetchBoard(); // Revert
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
    if (ideaId) moveCard(ideaId, toStatus);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="rounded-xl border dark:border-gray-700 p-4 animate-pulse">
              <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              {[1, 2].map((i) => (<div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg mb-2" />))}
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
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Content Pipeline</h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{totalIdeas} ideas across {COLUMNS.length} stages</p>
        </div>
      </div>

      {totalIdeas === 0 ? (
        <div className="rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <div className="mb-4 text-5xl">📋</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Your pipeline is empty</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Capture ideas to see them flow through this board.</p>
          <button onClick={() => navigate("/inbox")}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 min-h-[44px]">
            Go to inbox <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ WebkitOverflowScrolling: "touch" }}>
          {COLUMNS.map((col) => (
            <div key={col.id}
              className="flex-shrink-0 w-[280px] sm:w-[300px] snap-start"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.id)}>
              <div className={`rounded-xl border ${col.color} p-3 min-h-[200px]`}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{col.label}</h3>
                  <span className="rounded-full bg-white dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">{columns[col.id]?.length || 0}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {columns[col.id]?.map((idea) => (
                    <div key={idea.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idea.id)}
                      onClick={() => navigate(`/inbox/${idea.id}`)}
                      className="rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 p-3 shadow-sm cursor-pointer hover:shadow-md active:shadow transition-shadow">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {idea.context_text || idea.source_url?.slice(0, 80) || "Untitled"}
                      </p>
                      <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 truncate">
                        {idea.source_url ? new URL(idea.source_url).hostname : "No source"}
                      </p>
                    </div>
                  ))}
                  {columns[col.id]?.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic py-4 text-center">Drop ideas here</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
