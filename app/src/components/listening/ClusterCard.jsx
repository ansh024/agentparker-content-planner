import { Lightbulb, ExternalLink, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { firstCitation, citationUrl } from "@/lib/listening";

// One trend cluster: title, summary, source chips, relevance score, and the
// save / open-source / dismiss actions.
export default function ClusterCard({ cluster, onSaveIdea, onMarkIrrelevant }) {
  const sourceUrl = citationUrl(firstCitation(cluster));
  const score = cluster.score ? Number(cluster.score).toFixed(1) : null;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{cluster.title}</p>
          {cluster.summary && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{cluster.summary}</p>
          )}
          {cluster.sources?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {cluster.sources.map((source) => (
                <span
                  key={source}
                  className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {source}
                </span>
              ))}
            </div>
          )}
        </div>
        {score && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            {score}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onSaveIdea?.(cluster)}>
          <Lightbulb className="h-4 w-4" /> Save idea
        </Button>
        {sourceUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Open sources
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onMarkIrrelevant?.(cluster)}
        >
          <X className="h-4 w-4" /> Mark irrelevant
        </Button>
      </div>
    </Card>
  );
}
