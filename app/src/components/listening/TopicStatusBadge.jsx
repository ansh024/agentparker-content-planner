import { cn } from "@/lib/utils";
import { getTopicStatus } from "@/lib/topics";

// Status pill with a leading dot. Wraps getTopicStatus so the colour logic
// stays in one place. The existing helper returns Tailwind bg/text classes for
// the pill; we add a matching solid dot for a crisper read.
const DOT = {
  Searching: "bg-amber-500",
  Queued: "bg-amber-500",
  Failed: "bg-red-500",
  Paused: "bg-gray-400",
  "Ready to run": "bg-blue-500",
  "Up to date": "bg-green-500",
  "Due soon": "bg-amber-500",
  Overdue: "bg-red-500",
};

export default function TopicStatusBadge({ topic, isRunning = false, latestRun = null, className }) {
  const status = getTopicStatus(topic, isRunning, latestRun);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        status.color,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[status.label] || "bg-current")} />
      {status.label}
    </span>
  );
}
