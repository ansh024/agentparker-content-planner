import { useState, useEffect } from "react";
import { Copy, Check, Calendar, RefreshCw, Trash2, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { platformLabel, updateDraft, deleteDraft, scheduleDraft, generateOne } from "../../lib/drafts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLE = {
  generating: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  edited: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  scheduled: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  posted: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function DraftCard({ draft, onChange, onRemove }) {
  const { showToast } = useToast();
  const [body, setBody] = useState(draft.body || "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Keep local text in sync when generation streams a new body in.
  useEffect(() => {
    if (!dirty) setBody(draft.body || "");
  }, [draft.body]); // eslint-disable-line react-hooks/exhaustive-deps

  const generating = draft.status === "generating";
  const meta = draft.ai_meta || {};

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateDraft(draft.id, { body });
      onChange?.(updated);
      setDirty(false);
      showToast("Draft saved.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    showToast("Copied to clipboard.", "success");
    setTimeout(() => setCopied(false), 1500);
  };

  const regenerate = async () => {
    setBusy(true);
    onChange?.({ ...draft, status: "generating" });
    try {
      const { draft: updated } = await generateOne(draft.id);
      onChange?.(updated);
      setDirty(false);
    } catch (err) {
      showToast(err.message, "error");
      onChange?.({ ...draft, status: "failed" });
    } finally {
      setBusy(false);
    }
  };

  const scheduleToday = async () => {
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await scheduleDraft(draft.id, date);
      onChange?.({ ...draft, status: "scheduled" });
      showToast("Scheduled for today.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteDraft(draft.id);
      onRemove?.(draft.id);
    } catch (err) {
      showToast(err.message, "error");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{platformLabel(draft.platform)}</Badge>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[draft.status])}>
            {draft.status}
          </span>
          {meta.grounded && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={`Grounded in ${meta.kb_docs_used?.length || 0} KB docs${meta.on_voice ? " · on-voice" : ""}`}>
              <Sparkles className="h-3 w-3" /> on-voice
            </span>
          )}
        </div>
      </div>

      {generating ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Generating your {platformLabel(draft.platform)} draft…
        </div>
      ) : draft.status === "failed" ? (
        <div className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">Generation failed. Try again.</p>
          <Button size="sm" variant="outline" onClick={regenerate} disabled={busy}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : (
        <>
          <Textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setDirty(true); }}
            rows={Math.min(Math.max(body.split("\n").length + 1, 6), 20)}
            className="resize-y font-normal"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              Copy
            </Button>
            {dirty && (
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save edits"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={scheduleToday} disabled={busy}>
              <Calendar className="mr-1.5 h-4 w-4" /> Schedule today
            </Button>
            <Button size="sm" variant="ghost" onClick={regenerate} disabled={busy}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Regenerate
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy} aria-label="Delete draft">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
