import { useState, useEffect, useCallback } from "react";
import { Wand2 } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { REPURPOSE_PLATFORMS, listDrafts, repurposeIdea } from "../../lib/drafts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import DraftCard from "./DraftCard";

/**
 * Repurpose an idea into platform-native drafts. Generation is client-driven
 * fan-out: repurposeIdea() creates the rows then calls generate-one per draft,
 * streaming each result back through the onDraft callback.
 */
export default function RepurposePanel({ ideaId }) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState(["linkedin"]);
  const [drafts, setDrafts] = useState([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const existing = await listDrafts({ idea_id: ideaId });
      setDrafts(existing);
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [ideaId, showToast]);

  useEffect(() => { load(); }, [load]);

  const mergeDraft = (d) =>
    setDrafts((prev) => {
      const i = prev.findIndex((x) => x.id === d.id);
      if (i === -1) return [d, ...prev];
      const next = [...prev];
      next[i] = d;
      return next;
    });

  const toggle = (value) =>
    setSelected((s) => (s.includes(value) ? s.filter((x) => x !== value) : [...s, value]));

  const generate = async () => {
    if (selected.length === 0) return;
    setRunning(true);
    try {
      await repurposeIdea(ideaId, selected, mergeDraft);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Platforms</Label>
          <div className="flex flex-wrap gap-3">
            {REPURPOSE_PLATFORMS.map((p) => (
              <label key={p.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(p.value)} onCheckedChange={() => toggle(p.value)} />
                {p.label}
              </label>
            ))}
            <span className="text-xs text-muted-foreground">More platforms coming soon</span>
          </div>
        </div>
        <Button onClick={generate} disabled={running || selected.length === 0}>
          <Wand2 className="mr-1.5 h-4 w-4" />
          {running ? "Generating…" : "Generate drafts"}
        </Button>
      </div>

      {drafts.length > 0 && (
        <div className="space-y-3">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              onChange={mergeDraft}
              onRemove={(id) => setDrafts((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
