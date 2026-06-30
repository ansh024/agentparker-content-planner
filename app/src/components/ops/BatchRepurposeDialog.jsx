import { useState, useEffect } from "react";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { batchRepurpose } from "../../lib/ops";
import { REPURPOSE_PLATFORMS } from "../../lib/drafts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// Select several inbox ideas → generate platform drafts for all of them in one
// action. Generation is client fan-out (see lib/ops.batchRepurpose).
export default function BatchRepurposeDialog({ open, onOpenChange, onDone }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [ideas, setIdeas] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [platforms, setPlatforms] = useState(["linkedin"]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (!open || !user) return;
    setPicked(new Set());
    setProgress({ done: 0, total: 0 });
    supabase
      .from("ideas")
      .select("id,title,source_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setIdeas(data || []));
  }, [open, user]);

  const toggleIdea = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const togglePlatform = (v) =>
    setPlatforms((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const run = async () => {
    const ideaIds = [...picked];
    if (ideaIds.length === 0 || platforms.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: ideaIds.length * platforms.length });
    try {
      let done = 0;
      await batchRepurpose(ideaIds, platforms, (d) => {
        if (d.status === "ready" || d.status === "failed") {
          done += 1;
          setProgress((p) => ({ ...p, done }));
        }
      });
      showToast("Batch drafts generated. Find them in Drafts.", "success");
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Batch repurpose</DialogTitle>
          <DialogDescription>Turn several inbox ideas into platform drafts at once.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Platforms</Label>
          <div className="flex gap-3">
            {REPURPOSE_PLATFORMS.map((p) => (
              <label key={p.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={platforms.includes(p.value)} onCheckedChange={() => togglePlatform(p.value)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-2 space-y-2">
          <Label>Ideas ({picked.size} selected)</Label>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {ideas.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No ideas in your inbox yet.</p>
            ) : ideas.map((i) => (
              <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <Checkbox checked={picked.has(i.id)} onCheckedChange={() => toggleIdea(i.id)} />
                <span className="truncate">{i.title || i.source_url}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          {running && progress.total > 0 && (
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {progress.done}/{progress.total} done
            </span>
          )}
          <Button onClick={run} disabled={running || picked.size === 0 || platforms.length === 0}>
            {running ? "Generating…" : `Generate ${picked.size * platforms.length || ""} drafts`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
