import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { getIdeaMedia, getIdeaNotes, getImportStatus, getImportWarnings } from "../lib/ideaImport";
import {
  ArrowLeft, ExternalLink, Calendar, Trash2, Edit3, Save, Sparkles,
  Lightbulb, FileText, Loader2, RefreshCw, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import HelpButton from "@/components/common/HelpButton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import StatusBadge, { IDEA_STATUSES, STATUS_LABELS } from "@/components/common/StatusBadge";

const log = logger("IdeaDetail");

const STATUSES = IDEA_STATUSES;

function CopyButton({ getText, label = "Copy" }) {
  const { showToast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      showToast("Copied to clipboard.", "success");
    } catch {
      showToast("Couldn't copy.", "error");
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={copy} aria-label={label}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function IdeaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [idea, setIdea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    fetchIdea();
  }, [user, id]);

  const fetchIdea = async () => {
    log.debug("Fetching idea detail", { id });
    const { data, error } = await supabase
      .from("ideas").select("*").eq("id", id).eq("user_id", user.id).single();

    if (error) {
      showToast("This idea could not be found.", "error");
      navigate("/inbox");
      return;
    }
    setIdea(data);
    setNotes(getIdeaNotes(data));
    setLoading(false);
  };

  const updateStatus = async (status) => {
    const { error } = await supabase.from("ideas").update({ status }).eq("id", id);
    if (error) {
      showToast(friendlyError(mapSupabaseError(error, "update-idea")), "error");
    } else {
      setIdea((prev) => ({ ...prev, status }));
      showToast(`Status changed to ${STATUS_LABELS[status]}.`, "success");
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    const metadata = {
      ...(idea.metadata || {}),
      import: { ...(idea.metadata?.import || {}), notes },
    };
    const { error } = await supabase.from("ideas").update({ metadata }).eq("id", id);
    if (error) {
      showToast(friendlyError(mapSupabaseError(error, "update-idea")), "error");
    } else {
      setIdea((prev) => ({ ...prev, metadata }));
      setEditing(false);
      showToast("Notes saved.", "success");
    }
    setSaving(false);
  };

  const generateAi = async (action) => {
    setAiLoading(action);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`/api/ideas/${id}/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(payload.error || "AI generation failed. Try again.", "error");
      } else {
        setIdea(payload.idea);
        showToast(`${action === "script" ? "Script draft" : action === "hooks" ? "Hooks" : "Brief"} generated.`, "success");
      }
    } finally {
      setAiLoading("");
    }
  };

  const deleteIdea = async () => {
    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) {
      showToast(friendlyError(mapSupabaseError(error, "delete-idea")), "error");
    } else {
      showToast("Idea deleted.", "success");
      navigate("/inbox");
    }
  };

  const scheduleIdea = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("content_plans").insert({
      user_id: user.id,
      idea_id: id,
      scheduled_date: today,
    });
    if (error) {
      showToast("Couldn't schedule this idea.", "error");
    } else {
      await supabase.from("ideas").update({ status: "planned" }).eq("id", id);
      setIdea((prev) => ({ ...prev, status: "planned" }));
      showToast("Scheduled for today!", "success");
    }
  };

  const getDomain = (url) => {
    try { return new URL(url).hostname.replace("www.", ""); }
    catch { return url; }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Skeleton className="mb-4 h-6 w-32" />
        <Card className="overflow-hidden p-0">
          <Skeleton className="h-56 w-full rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </Card>
      </div>
    );
  }

  if (!idea) return null;

  const media = getIdeaMedia(idea);
  const importStatus = getImportStatus(idea);
  const importWarnings = getImportWarnings(idea);
  const aiOutputs = idea.metadata?.ai || {};
  const hasAi = aiOutputs.brief || aiOutputs.hooks?.hooks?.length > 0 || aiOutputs.script || idea.ai_summary;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <HelpButton />
      </div>

      <Card className="overflow-hidden p-0">
        {media.mediaUrl ? (
          media.mediaContentType.startsWith("video/") ? (
            <video src={media.mediaUrl} poster={media.previewUrl || undefined} controls className="h-64 w-full bg-black object-cover" />
          ) : (
            <img src={media.mediaUrl} alt="" className="h-56 w-full bg-muted object-cover" />
          )
        ) : media.previewUrl ? (
          <img src={media.previewUrl} alt="" className="h-56 w-full bg-muted object-cover" />
        ) : null}

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={idea.status} />
            <Badge variant="secondary" className="capitalize">{idea.source_platform || "manual"}</Badge>
            {importStatus !== "ready" && (
              <Badge
                variant={importStatus === "import_failed" ? "destructive" : "secondary"}
                className={cn(importStatus === "importing" && "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300")}
              >
                {importStatus === "import_failed" ? "Import failed" : "Importing"}
              </Badge>
            )}
            {idea.source_author && (
              <span className="text-xs text-muted-foreground">by {idea.source_author}</span>
            )}
          </div>

          <h1 className="mb-2 text-lg font-semibold text-foreground">
            {idea.title || idea.ai_summary || "Untitled idea"}
          </h1>

          <a href={idea.source_url} target="_blank" rel="noopener noreferrer"
            className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            {getDomain(idea.source_url)}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          {importStatus === "importing" && (
            <Alert variant="warning" className="mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>Import is still running. Media and metadata will update when the source finishes processing.</AlertDescription>
            </Alert>
          )}
          {importStatus === "import_failed" && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>The link was saved, but the media import did not complete cleanly. You can still use the saved caption and source link.</AlertDescription>
            </Alert>
          )}
          {importWarnings.length > 0 && (
            <div className="mb-4 space-y-1 rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {importWarnings.map((warning) => (<p key={warning}>{warning}</p>))}
            </div>
          )}

          <Tabs defaultValue="details" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="ai">AI {hasAi ? "✨" : ""}</TabsTrigger>
            </TabsList>

            {/* DETAILS */}
            <TabsContent value="details" className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Source caption</span>
                  {idea.context_text && <CopyButton getText={() => idea.context_text} label="Copy caption" />}
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {idea.context_text || "No source caption was captured for this item."}
                </p>
              </div>

              {idea.ai_summary && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <span className="text-xs font-medium uppercase text-primary">AI summary</span>
                  <p className="mt-1 text-sm text-foreground">{idea.ai_summary}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 border-t pt-4 text-xs text-muted-foreground">
                <div>
                  <span className="text-muted-foreground/70">Created</span>
                  <p>{new Date(idea.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground/70">Updated</span>
                  <p>{new Date(idea.updated_at).toLocaleString()}</p>
                </div>
              </div>
            </TabsContent>

            {/* NOTES */}
            <TabsContent value="notes">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Your notes</span>
                  {!editing && (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary" onClick={() => setEditing(true)}>
                      <Edit3 className="h-3 w-3" /> Edit
                    </Button>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} autoFocus />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveNotes} disabled={saving}>
                        <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setNotes(getIdeaNotes(idea)); setEditing(false); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {getIdeaNotes(idea) || "No notes yet. Add context about why you saved this idea."}
                  </p>
                )}
              </div>
            </TabsContent>

            {/* AI */}
            <TabsContent value="ai" className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => generateAi("brief")} disabled={aiLoading !== ""}>
                  {aiLoading === "brief" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate brief
                </Button>
                <Button variant="outline" size="sm" onClick={() => generateAi("hooks")} disabled={aiLoading !== ""}>
                  {aiLoading === "hooks" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                  Generate hooks
                </Button>
                <Button size="sm" onClick={() => generateAi("script")} disabled={aiLoading !== ""}>
                  {aiLoading === "script" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Draft script
                </Button>
              </div>

              {!hasAi && (
                <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No AI output yet. Generate a brief, hooks, or a script to get started.
                </p>
              )}

              {aiOutputs.brief && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Brief</p>
                    <CopyButton getText={() => aiOutputs.brief.summary || ""} label="Copy brief" />
                  </div>
                  <p className="mt-1 text-sm text-foreground">{aiOutputs.brief.summary}</p>
                  {Array.isArray(aiOutputs.brief.why_it_works) && aiOutputs.brief.why_it_works.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {aiOutputs.brief.why_it_works.map((item) => (<p key={item} className="text-xs text-muted-foreground">• {item}</p>))}
                    </div>
                  )}
                  {Array.isArray(aiOutputs.brief.creator_angles) && aiOutputs.brief.creator_angles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {aiOutputs.brief.creator_angles.map((item) => (
                        <span key={item} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{item}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {aiOutputs.hooks?.hooks?.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Hooks</p>
                    <CopyButton getText={() => aiOutputs.hooks.hooks.join("\n")} label="Copy hooks" />
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {aiOutputs.hooks.hooks.map((hook) => (<p key={hook} className="text-sm text-foreground">{hook}</p>))}
                  </div>
                </div>
              )}

              {aiOutputs.script && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Script draft</p>
                    <CopyButton
                      getText={() => [aiOutputs.script.title, aiOutputs.script.hook, ...(aiOutputs.script.beats || []), aiOutputs.script.caption_draft, aiOutputs.script.cta].filter(Boolean).join("\n\n")}
                      label="Copy script"
                    />
                  </div>
                  {aiOutputs.script.title && <p className="mt-1 text-sm font-medium text-foreground">{aiOutputs.script.title}</p>}
                  {aiOutputs.script.hook && <p className="mt-2 text-sm text-foreground">{aiOutputs.script.hook}</p>}
                  {Array.isArray(aiOutputs.script.beats) && aiOutputs.script.beats.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {aiOutputs.script.beats.map((beat, index) => (
                        <p key={`${index}-${beat}`} className="text-xs text-muted-foreground">{index + 1}. {beat}</p>
                      ))}
                    </div>
                  )}
                  {aiOutputs.script.caption_draft && (
                    <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-foreground">
                      {aiOutputs.script.caption_draft}
                    </div>
                  )}
                  {aiOutputs.script.cta && <p className="mt-2 text-xs font-medium text-primary">{aiOutputs.script.cta}</p>}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Select value={idea.status} onValueChange={updateStatus}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={scheduleIdea}>
            <Calendar className="h-4 w-4" /> Schedule for today
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={fetchIdea} aria-label="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this idea?"
        description="This permanently removes the idea and its AI outputs. This can't be undone."
        confirmLabel="Delete"
        onConfirm={deleteIdea}
      />
    </div>
  );
}
