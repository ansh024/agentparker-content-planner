import { cn } from "@/lib/utils";
import HelpButton from "./HelpButton";

/**
 * Consistent page header: title + optional subtitle on the left,
 * actions + a contextual Help button on the right.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  showHelp = true,
  className,
}) {
  return (
    <div
      className={cn(
        "mb-5 flex items-start justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {showHelp && <HelpButton />}
      </div>
    </div>
  );
}
