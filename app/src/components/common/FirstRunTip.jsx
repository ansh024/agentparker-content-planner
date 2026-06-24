import { Lightbulb, X } from "lucide-react";
import { useDismissible } from "@/hooks/useDismissible";
import { cn } from "@/lib/utils";

/**
 * Dismissible onboarding hint shown once per `id` (persisted in localStorage).
 * Lightweight, inline alternative to an overlay tour.
 */
export default function FirstRunTip({ id, title, children, className }) {
  const [dismissed, dismiss] = useDismissible(`tip.${id}`);
  if (dismissed) return null;

  return (
    <div
      className={cn(
        "relative flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 pr-10",
        className
      )}
    >
      <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="text-sm">
        {title && <p className="font-medium text-foreground">{title}</p>}
        <div className="text-muted-foreground">{children}</div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
