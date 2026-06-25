import { useEffect, useState } from "react";
import { ArrowLeft, X, Flame, Target, Copy, Check, Bookmark, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SignalRow from "./SignalRow";

function HookBox({ hook, onCopy, copied }) {
  return (
    <div className="relative rounded-lg border border-border bg-muted/50 p-3.5" style={{ borderLeft: "2px solid hsl(var(--primary))" }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-primary flex items-center gap-1.5 mb-2">
        <span style={{ fontSize: 11 }}>❝</span> Suggested hook
      </p>
      <p className="text-sm italic leading-relaxed text-foreground/75 pr-16">{hook}</p>
      <button
        className={cn(
          "absolute top-3 right-3 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
          copied
            ? "border-green-500 text-green-600 dark:text-green-400"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        )}
        onClick={onCopy}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function AngleDrawer({ angle, index, hook, altHooks = [], clusters = [], saved, onSave, onScriptOutline, onClose }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  // Animate in on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(!!angle));
    return () => cancelAnimationFrame(id);
  }, [angle]);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!angle) return null;

  const rank = (index ?? 0) + 1;
  const isStrong = rank <= 2 && !!angle.why;

  const handleCopy = () => {
    if (hook && navigator.clipboard) {
      navigator.clipboard.writeText(hook.replace(/^"|"$/g, "")).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={cn("fixed inset-0 z-50 pointer-events-none", shown && "pointer-events-auto")}>
      {/* Scrim */}
      <div
        className={cn("absolute inset-0 bg-black/30 transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          "absolute top-0 right-0 h-full bg-background flex flex-col shadow-2xl transition-transform duration-300 ease-out",
          shown ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: "min(560px, 92vw)" }}
        role="dialog"
        aria-label={angle.title}
      >
        {/* Bar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 shrink-0">
          <button
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Head */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Content angle · #{rank}
            </p>
            <h2 className="text-2xl font-bold leading-snug text-foreground">{angle.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                isStrong ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {isStrong ? <><Flame className="h-3 w-3" /> Strong signal</> : <><Target className="h-3 w-3" /> Emerging</>}
              </span>
              {angle.format && (
                <span className="text-[11px] text-muted-foreground">{angle.format}</span>
              )}
            </div>
          </div>

          {/* The move */}
          {angle.angle && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">The move</p>
              <p className="text-sm leading-relaxed text-foreground/80">{angle.angle}</p>
            </div>
          )}

          {/* Hook */}
          {hook && <HookBox hook={hook} onCopy={handleCopy} copied={copied} />}

          {/* Why now */}
          {angle.why && (
            <div className="rounded-lg p-3.5" style={{ background: "hsl(var(--primary) / 0.05)", borderLeft: "3px solid hsl(var(--primary))" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Why now</p>
              <p className="text-sm leading-relaxed text-foreground/80">{angle.why}</p>
            </div>
          )}

          {/* Signals */}
          {clusters.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Backed by {clusters.length} signal{clusters.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {clusters.map((c) => (
                  <SignalRow key={c.id} cluster={c} compact />
                ))}
              </div>
            </div>
          )}

          {/* Alternate hooks */}
          {altHooks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Alternate hooks</p>
              {altHooks.map((h, i) => (
                <p key={i} className="text-sm italic text-muted-foreground leading-relaxed rounded-md bg-muted px-3 py-2">{h}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2.5 border-t border-border px-6 py-4 shrink-0 bg-background">
          <Button
            className={cn("flex-1 justify-center gap-2", saved && "bg-green-600 hover:bg-green-700")}
            onClick={onSave}
          >
            <Bookmark className="h-4 w-4" />
            {saved ? "Saved to inbox" : "Save idea"}
          </Button>
          <Button variant="outline" className="flex-1 justify-center gap-2" onClick={onScriptOutline}>
            <FileText className="h-4 w-4" />
            Script outline
          </Button>
        </div>
      </aside>
    </div>
  );
}
