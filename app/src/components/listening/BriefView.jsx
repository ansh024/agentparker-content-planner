import { Sparkles, Lightbulb, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// Renders a single research brief: headline, what-changed, "why it matters"
// pains, content angles (each savable), and hooks. Pure presentation — the
// page supplies onSaveAngle / onScriptOutline handlers.
export default function BriefView({ brief, onSaveAngle, onScriptOutline }) {
  if (!brief) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-semibold leading-snug text-foreground">
            {brief.headline}
          </h2>
        </div>
        {brief.what_changed && (
          <p className="text-sm leading-relaxed text-muted-foreground">{brief.what_changed}</p>
        )}
        {brief.audience_pains?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Why it matters
            </p>
            <div className="flex flex-wrap gap-1.5">
              {brief.audience_pains.map((pain) => (
                <span
                  key={pain}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {pain}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      {brief.content_angles?.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Content angles</h3>
          <div className="grid gap-3">
            {brief.content_angles.slice(0, 6).map((angle, index) => (
              <Card key={`${angle.title}-${index}`} className="p-4">
                <p className="text-sm font-semibold text-foreground">{angle.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{angle.angle}</p>
                {angle.why && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">{angle.why}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onSaveAngle?.(angle)}>
                    <Lightbulb className="h-4 w-4" /> Save idea
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onScriptOutline?.(angle)}>
                    <FileText className="h-4 w-4" /> Script outline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {brief.scripts_or_hooks?.length > 0 && (
        <section className="space-y-3">
          <Separator />
          <h3 className="text-sm font-semibold text-foreground">Hooks to try</h3>
          <ul className="space-y-2">
            {brief.scripts_or_hooks.map((hook) => (
              <li
                key={hook}
                className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm leading-relaxed text-muted-foreground"
              >
                "{hook}"
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
