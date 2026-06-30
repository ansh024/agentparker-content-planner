import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Code, Youtube, Globe, Quote, Bookmark, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { firstCitation, citationUrl } from "@/lib/listening";

// Detect platform from metadata or source URL
function detectPlatform(cluster) {
  const p = cluster.metadata?.platform?.toLowerCase();
  if (p) return p;
  const urls = (cluster.metadata?.citations || []).map((c) => (typeof c === "string" ? c : c?.url || "")).join(" ").toLowerCase();
  if (urls.includes("reddit.com")) return "reddit";
  if (urls.includes("news.ycombinator") || urls.includes("ycombinator")) return "hn";
  if (urls.includes("youtube.com") || urls.includes("youtu.be")) return "youtube";
  return "web";
}

const PLATFORM_META = {
  reddit:  { label: "Reddit",       Icon: MessageSquare, color: "text-teal-700 dark:text-teal-300",  bg: "bg-teal-50 dark:bg-teal-950/40" },
  hn:      { label: "Hacker News",  Icon: Code,          color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/40" },
  youtube: { label: "YouTube",      Icon: Youtube,       color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-50 dark:bg-violet-950/40" },
  web:     { label: "Web",          Icon: Globe,         color: "text-muted-foreground",               bg: "bg-muted" },
};

export function PlatformChip({ platform, withLabel = true }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.web;
  const { Icon, label, color, bg } = meta;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", color, bg)}>
      <Icon className="h-3 w-3" />
      {withLabel && <span>{label}</span>}
    </span>
  );
}

function SignalBars({ score }) {
  const n = Number(score);
  const bars = n >= 85 ? 3 : n >= 70 ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-0.5 h-3" title={`Signal score ${score}`}>
      {[5, 8, 11].map((h, i) => (
        <span
          key={i}
          className={cn("w-0.5 rounded-sm", i < bars ? "bg-primary" : "bg-border")}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

function relativeAge(dateStr) {
  if (!dateStr) return null;
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true }); } catch { return null; }
}

// compact = inside drawer (no card border, bg-muted); default = full card in Signals tab
export default function SignalRow({ cluster, compact = false, onSave }) {
  const platform = detectPlatform(cluster);
  const age = relativeAge(cluster.created_at);
  const score = cluster.score ? Math.round(Number(cluster.score)) : null;
  const sourceUrl = citationUrl(firstCitation(cluster));

  return (
    <div className={cn(
      "relative rounded-lg border p-3.5",
      compact
        ? "border-border/50 bg-muted/50"
        : "border-border bg-card"
    )}>
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform={platform} />
        {cluster.metadata?.source && (
          <span className="text-xs font-semibold text-foreground/80">{cluster.metadata.source}</span>
        )}
        {age && (
          <>
            <span className="text-muted-foreground/50 text-xs">·</span>
            <span className="text-xs text-muted-foreground">{age}</span>
          </>
        )}
        {score !== null && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <SignalBars score={score} />
            <span className="text-[11px] font-bold text-muted-foreground tabular-nums">{score}</span>
          </span>
        )}
      </div>

      {/* Title */}
      {cluster.title && (
        <div className="mt-2 flex items-start gap-1.5">
          <p className="flex-1 text-sm font-medium text-foreground leading-snug">{cluster.title}</p>
          {compact && sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 mt-0.5 text-muted-foreground/50 hover:text-primary transition-colors"
              aria-label="Open source"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Quote / summary */}
      {cluster.summary && (
        <div className="mt-1.5 flex gap-1.5 text-xs italic text-muted-foreground leading-relaxed">
          <Quote className="h-3 w-3 shrink-0 mt-0.5 text-border" />
          <span>{cluster.summary}</span>
        </div>
      )}

      {/* Engagement metadata */}
      {cluster.metadata?.engagement && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">{cluster.metadata.engagement}</p>
      )}

      {/* Footer actions */}
      {((!compact && onSave) || sourceUrl) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!compact && onSave && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSave(cluster)}>
              <Bookmark className="h-3.5 w-3.5" />
              Save
            </Button>
          )}
          {sourceUrl && (
            <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open source
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
