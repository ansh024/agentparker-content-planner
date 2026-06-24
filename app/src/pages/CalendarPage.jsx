import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, addMonths, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarPlus, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import PageHeader from "@/components/common/PageHeader";
import FirstRunTip from "@/components/common/FirstRunTip";

const log = logger("CalendarPage");

const ideaLabel = (idea) =>
  idea?.context_text || idea?.ai_summary || idea?.title || idea?.source_url || "Untitled idea";

export default function CalendarPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [plans, setPlans] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null); // "yyyy-MM-dd"
  const [dragOver, setDragOver] = useState(null);

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

  const scheduleIdea = async (ideaId, dateStr) => {
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
    if (err) showToast(friendlyError(mapSupabaseError(err, "schedule-plan")), "error");
    else { showToast("Idea added to calendar!", "success"); fetchData(); }
  };

  const removePlan = async (planId) => {
    const { error: err } = await supabase.from("content_plans").delete().eq("id", planId);
    if (err) showToast("Couldn't remove from calendar.", "error");
    else { showToast("Removed from calendar.", "success"); fetchData(); }
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
        const inMonth = isSameMonth(currentDate, monthStart);
        const isToday = isSameDay(currentDate, new Date());

        days.push(
          <div
            key={dateStr}
            onClick={() => setSelectedDate(dateStr)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(dateStr); }}
            onDragLeave={() => setDragOver((d) => (d === dateStr ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const ideaId = e.dataTransfer.getData("ideaId");
              if (ideaId) scheduleIdea(ideaId, dateStr);
            }}
            className={cn(
              "min-h-[78px] cursor-pointer border border-border/60 p-1.5 text-xs transition-colors sm:min-h-[96px]",
              !inMonth && "bg-muted/40 text-muted-foreground",
              inMonth && "bg-card hover:bg-accent/50",
              isToday && "bg-primary/10",
              dragOver === dateStr && "bg-primary/20 ring-1 ring-inset ring-primary"
            )}
          >
            <div className={cn("mb-1 text-right font-medium", isToday && "text-primary")}>
              {isToday ? (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {format(currentDate, "d")}
                </span>
              ) : (
                format(currentDate, "d")
              )}
            </div>
            {dayPlans.slice(0, 3).map((plan) => (
              <div
                key={plan.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("planId", plan.id)}
                className="mb-1 truncate rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                title={ideaLabel(plan.ideas)}
              >
                {ideaLabel(plan.ideas).slice(0, 50)}
              </div>
            ))}
            {dayPlans.length > 3 && (
              <div className="px-1.5 text-[10px] text-muted-foreground">+{dayPlans.length - 3} more</div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div key={day.toISOString()} className="grid grid-cols-7">{days}</div>);
      days = [];
    }
    return <div>{rows}</div>;
  };

  const selectedPlans = selectedDate ? plans.filter((p) => p.scheduled_date === selectedDate) : [];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="Content Calendar"
        subtitle="Drag ideas from the queue onto a day to schedule them."
        actions={
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous month</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next month</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={fetchData}>Try again</Button>
        </div>
      )}

      {loading ? (
        <Card className="p-4">
          <Skeleton className="mb-4 h-6 w-40" />
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 35 }).map((_, i) => (<Skeleton key={i} className="h-20 rounded" />))}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{format(currentMonth, "MMMM yyyy")}</h2>
          </div>
          <div className="grid grid-cols-7 border-b">
            {dayNames.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium uppercase text-muted-foreground">{d}</div>
            ))}
          </div>
          {renderCells()}
        </Card>
      )}

      {/* Idea queue */}
      <div className="mt-6 border-t pt-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Idea queue ({ideas.length})</h3>
        <p className="mb-3 text-xs text-muted-foreground">Drag any chip onto a calendar day to schedule it.</p>
        {ideas.length === 0 ? (
          <FirstRunTip id="calendar-queue">
            No new ideas waiting. Capture some ideas first, then drag them onto a date to plan when they go live.
          </FirstRunTip>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("ideaId", idea.id)}
                className="cursor-grab rounded-lg border bg-card px-2.5 py-1.5 text-xs text-foreground shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
                title={idea.source_url}
              >
                {ideaLabel(idea).slice(0, 50)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day detail panel */}
      <Sheet open={!!selectedDate} onOpenChange={(v) => !v && setSelectedDate(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>
              {selectedDate && format(new Date(selectedDate + "T00:00:00"), "EEEE, MMM d")}
            </SheetTitle>
            <SheetDescription>
              {selectedPlans.length} {selectedPlans.length === 1 ? "item" : "items"} scheduled
            </SheetDescription>
          </SheetHeader>
          <Separator />
          <div className="flex-1 space-y-2 overflow-y-auto p-6">
            {selectedPlans.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <CalendarPlus className="h-8 w-8 text-muted-foreground/60" />
                <p>Nothing scheduled yet. Drag an idea from the queue onto this day.</p>
              </div>
            ) : (
              selectedPlans.map((plan) => (
                <div key={plan.id} className="flex items-start gap-2 rounded-lg border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{ideaLabel(plan.ideas)}</p>
                    {plan.target_platform && (
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">{plan.target_platform}</p>
                    )}
                  </div>
                  {plan.idea_id && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/inbox/${plan.idea_id}`)} aria-label="Open idea">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open idea</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removePlan(plan.id)} aria-label="Remove from day">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove from this day</TooltipContent>
                  </Tooltip>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
