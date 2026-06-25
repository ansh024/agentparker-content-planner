import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BriefCard({ brief }) {
  const [open, setOpen] = useState(false);
  if (!brief) return null;

  return (
    <section className="rounded-xl border border-border bg-card shadow-xs overflow-hidden" style={{ borderLeft: "3px solid hsl(var(--primary))" }}>
      <div className="p-5">
        <div className="flex gap-3.5 items-start">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1.5">The takeaway</p>
            <p className="text-base font-semibold leading-snug text-foreground">{brief.headline}</p>
          </div>
        </div>

        <button
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-border/80 hover:text-foreground transition-colors"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Hide full brief" : "Read full brief"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        </button>

        {open && (
          <div className="mt-4 pt-4 border-t border-dashed border-border">
            {brief.what_changed && (
              <p className="text-sm leading-relaxed text-muted-foreground">{brief.what_changed}</p>
            )}
            {brief.audience_pains?.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Why it matters</p>
                <ul className="space-y-2">
                  {brief.audience_pains.map((pain, i) => (
                    <li key={i} className="flex gap-2.5 items-start text-sm text-foreground/80 leading-snug">
                      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      {pain}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
