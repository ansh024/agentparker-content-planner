import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, addMonths, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

const log = logger("CalendarPage");

export default function CalendarPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [plans, setPlans] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user, currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    log.debug("Fetching calendar data", { monthStart, monthEnd });

    const [plansRes, ideasRes] = await Promise.all([
      supabase.from("content_plans").select("*, ideas(*)")
        .eq("user_id", user.id)
        .gte("scheduled_date", monthStart)
        .lte("scheduled_date", monthEnd),
      supabase.from("ideas").select("*")
        .eq("user_id", user.id)
        .eq("status", "new")
        .order("created_at", { ascending: false }),
    ]);

    if (plansRes.error) {
      const code = mapSupabaseError(plansRes.error, "load-plans");
      log.error("Failed to load calendar", { error: plansRes.error, code });
      setError(friendlyError(code));
    } else {
      log.info(`Loaded ${plansRes.data?.length || 0} plan entries, ${ideasRes.data?.length || 0} queued ideas`);
      setPlans(plansRes.data || []);
      setIdeas(ideasRes.data || []);
    }
    setLoading(false);
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-900">
        {format(currentMonth, "MMMM yyyy")}
      </h2>
      <div className="flex gap-1">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => setCurrentMonth(new Date())} className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">
          Today
        </button>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderDays = () => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (
      <div className="grid grid-cols-7 border-b">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 uppercase py-2">{d}</div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDate = day;
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const dayPlans = plans.filter((p) => p.scheduled_date === dateStr);

        days.push(
          <div
            key={dateStr}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("bg-brand-50");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("bg-brand-50");
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("bg-brand-50");
              const ideaId = e.dataTransfer.getData("ideaId");
              if (!ideaId) return;

              const existing = plans.find((p) => p.idea_id === ideaId && p.scheduled_date === dateStr);
              if (existing) {
                showToast("This idea is already on this date.", "warning");
                return;
              }

              log.info("Scheduling idea", { ideaId, date: dateStr });
              const { error: err } = await supabase.from("content_plans").insert({
                user_id: user.id,
                idea_id: ideaId,
                scheduled_date: dateStr,
                target_platform: "instagram",
              });

              if (err) {
                showToast(friendlyError(mapSupabaseError(err, "schedule-plan")), "error");
              } else {
                showToast("Idea added to calendar!", "success");
                fetchData();
              }
            }}
            className={`min-h-[90px] border border-gray-100 p-1.5 text-xs transition-colors ${
              !isSameMonth(day, monthStart)
                ? "bg-gray-50 text-gray-400"
                : isSameDay(day, new Date())
                ? "bg-brand-50"
                : "bg-white"
            }`}
          >
            <div className="mb-1 text-right font-medium">{format(currentDate, "d")}</div>
            {dayPlans.map((plan) => (
              <div
                key={plan.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("planId", plan.id)}
                className="mb-1 truncate rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-800 cursor-pointer hover:bg-brand-200"
                title={plan.ideas?.context_text || plan.ideas?.ai_summary || plan.ideas?.source_url || "Untitled"}
              >
                {plan.ideas?.context_text || plan.ideas?.ai_summary || plan.ideas?.source_url?.slice(0, 50) || "Untitled idea"}
              </div>
            ))}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toISOString()} className="grid grid-cols-7">{days}</div>
      );
      days = [];
    }
    return <div>{rows}</div>;
  };

  const renderIdeasQueue = () => (
    <div className="mt-6 border-t pt-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Idea Queue ({ideas.length})</h3>
      {ideas.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No new ideas waiting. Capture some ideas first then drag them here.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("ideaId", idea.id)}
              className="cursor-grab rounded-lg border bg-white px-2.5 py-1.5 text-xs text-gray-700 shadow-sm hover:shadow active:cursor-grabbing"
              title={idea.source_url}
            >
              {idea.context_text || idea.source_url?.slice(0, 50) || "Untitled"}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Content Calendar</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchData} className="ml-3 text-red-700 underline hover:no-underline text-xs">Try again</button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse rounded-xl border bg-white p-4 shadow-sm">
          <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          {renderHeader()}
          {renderDays()}
          {renderCells()}
        </div>
      )}
      {renderIdeasQueue()}
    </div>
  );
}
