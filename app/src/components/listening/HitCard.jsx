import { Lightbulb, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// One raw search result (a "hit"): title, platform, snippet, sighting count,
// and view-source / save actions.
export default function HitCard({ hit, onSaveIdea }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
          {hit.title || "Untitled"}
        </p>
        {hit.platform && (
          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
            {hit.platform}
          </span>
        )}
      </div>
      {hit.snippet && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {hit.snippet}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {hit.sighting_count > 1 ? `${hit.sighting_count} sightings` : "New sighting"}
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href={hit.source_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Source
            </a>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onSaveIdea?.(hit)}>
            <Lightbulb className="h-4 w-4" /> Save idea
          </Button>
        </div>
      </div>
    </Card>
  );
}
