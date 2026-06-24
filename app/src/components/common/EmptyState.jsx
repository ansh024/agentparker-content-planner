import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Consistent empty / first-use state.
 * @param {React.ElementType} icon - lucide icon component
 * @param {string} title
 * @param {string} description
 * @param {string} [actionLabel]
 * @param {() => void} [onAction]
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5">
          {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}
