import { useState } from "react";
import { Layers, Flame, Target, Copy, Check, Bookmark, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlatformChip } from "./SignalRow";

function HookBox({ hook, onCopy, copied }) {
  return (
    <div className="relative mt-3.5 rounded-lg border border-border bg-muted/50 p-3" style={{ borderLeft: "2px solid hsl(var(--primary))" }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-primary flex items-center gap-1.5 mb-1.5">
        <span style={{ fontSize: 11 }}>❝</span> Suggested hook
      </p>
      <p className="text-sm italic leading-relaxed text-foreground/75 pr-16">{hook}</p>
      <button
        className={cn(
          "absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
          copied
            ? "border-green-500 text-green-600 dark:text-green-400"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        )}
        onClick={(e) => { e.stopPropagation(); onCopy(); }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function AngleCard({ angle, index, hook, clusters = [], saved, active, onOpen, onSave, onScriptOutline }) {
  const [copied, setCopied] = useState(false);
  const rank = index + 1;
  const isStrong = rank <= 2 && !!angle.why;

  const handleCopy = () => {
    if (hook && navigator.clipboard) {
      navigator.clipboard.writeText(hook.replace(/^"|"$/g, "")).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article
      className={cn(
        "relative flex overflow-hidden rounded-xl border bg-card shadow-sm cursor-pointer transition-all duration-150",
        active
          ? "border-primary shadow-md"
          : "border-border hover:border-border/80 hover:shadow-md"
      )}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(index); } }}
    >
      {/* Accent rail */}
      <div className="w-1 shrink-0 bg-primary" />

      <div className="flex-1 min-w-0 p-5">
        {/* Top row: rank · priority · format */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-foreground text-background text-[11px] font-bold">
            {rank}
          </span>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
            isStrong ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            {isStrong
              ? <><Flame className="h-3 w-3" /> Strong signal</>
              : <><Target className="h-3 w-3" /> Emerging</>
            }
          </span>
          {angle.format && (
            <span className="ml-auto text-[11px] text-muted-foreground hidden sm:block">{angle.format}</span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-3 text-base font-semibold leading-snug text-foreground">{angle.title}</h3>

        {/* Move */}
        {angle.angle && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{angle.angle}</p>
        )}

        {/* Hook box */}
        {hook && (
          <HookBox hook={hook} onCopy={handleCopy} copied={copied} />
        )}

        {/* Footer */}
        <div
          className="mt-4 pt-3.5 border-t border-border flex flex-wrap items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Backed by {clusters.length} signal{clusters.length !== 1 ? "s" : ""}
            <span className="inline-flex gap-1 ml-1">
              {/* show unique platforms */}
              {[...new Set(clusters.map((c) => c.metadata?.platform || "web"))].slice(0, 3).map((p) => (
                <PlatformChip key={p} platform={p} withLabel={false} />
              ))}
            </span>
          </span>

          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className={cn("h-8 gap-1.5 text-xs", saved && "bg-green-600 hover:bg-green-700")}
              onClick={(e) => { e.stopPropagation(); onSave?.(); }}
            >
              <Bookmark className="h-3.5 w-3.5" />
              {saved ? "Saved" : "Save idea"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={(e) => { e.stopPropagation(); onScriptOutline?.(); }}
            >
              <FileText className="h-3.5 w-3.5" />
              Script outline
            </Button>
            <span className="hidden sm:inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
              View <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
