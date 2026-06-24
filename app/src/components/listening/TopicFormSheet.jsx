import { useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../lib/supabase";
import { logger } from "../../lib/logger";
import { friendlyError, mapSupabaseError } from "../../lib/errors";
import { createTopicAndSearch } from "@/lib/topics";
import { parseCsv, queueResearchRun } from "@/lib/listening";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

const log = logger("TopicFormSheet");
const FREQUENCIES = ["daily", "weekly"];

const EMPTY_FORM = {
  name: "",
  audience: "",
  contentFormat: "short-form video",
  keywords: "",
  competitors: "",
  platformFocus: "YouTube, Instagram, TikTok",
  frequency: "daily",
};

/**
 * Right-side sheet for creating a listening topic. On success it creates the
 * topic (POST /api/topics), kicks off a research run, and calls onCreated(topic).
 */
export default function TopicFormSheet({ open, onOpenChange, onCreated }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const createTopic = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.keywords.trim()) {
      showToast("Enter a name and keywords.", "warning");
      return;
    }

    setSaving(true);
    const topicPayload = {
      name: form.name.trim(),
      audience: form.audience.trim(),
      contentFormat: form.contentFormat.trim() || "short-form video",
      keywords: parseCsv(form.keywords),
      competitors: parseCsv(form.competitors),
      platformFocus: parseCsv(form.platformFocus),
      frequency: form.frequency,
    };

    try {
      await createTopicAndSearch({
        createTopic: async () => {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (!token) throw new Error("Please log in to continue.");
          const res = await fetch("/api/topics", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(topicPayload),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Couldn't create topic.");
          return result;
        },
        runSearch: async (createdTopic) => {
          onCreated?.(createdTopic);
          showToast(`"${createdTopic.name}" created. Starting research…`, "info");
          try {
            const { ok, result } = await queueResearchRun({ supabase, topicId: createdTopic.id });
            if (!ok) showToast(result.error || "Research failed to queue.", "error");
            else showToast(result.message || "Research run queued.", result.workerError ? "warning" : "success");
          } catch (err) {
            log.error("Research run failed", { error: err });
            showToast(err.message || "Research failed. Try again.", "error");
          }
        },
      });

      setForm(EMPTY_FORM);
      onOpenChange(false);
    } catch (err) {
      log.error("Topic creation failed", { error: err });
      showToast(err.message || friendlyError(mapSupabaseError(err, "create-topic")), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0">
        <SheetHeader>
          <SheetTitle>New listening topic</SheetTitle>
          <SheetDescription>Describe a creator niche. We'll research it and build a brief.</SheetDescription>
        </SheetHeader>
        <Separator />
        <form onSubmit={createTopic} className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Topic name</Label>
            <Input id="t-name" required value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="e.g. AI video creation" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-audience">Audience</Label>
            <Input id="t-audience" value={form.audience} onChange={(e) => updateForm("audience", e.target.value)} placeholder="e.g. creators selling templates" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-format">Content format</Label>
              <Input id="t-format" value={form.contentFormat} onChange={(e) => updateForm("contentFormat", e.target.value)} placeholder="short-form video" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-freq">Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => updateForm("frequency", v)}>
                <SelectTrigger id="t-freq"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (<SelectItem key={f} value={f}>{f === "daily" ? "Daily" : "Weekly"}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-keywords">Keywords</Label>
            <Input id="t-keywords" required value={form.keywords} onChange={(e) => updateForm("keywords", e.target.value)} placeholder="e.g. AI UGC, product demos, video ads" />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-comp">Competitors / tools</Label>
            <Input id="t-comp" value={form.competitors} onChange={(e) => updateForm("competitors", e.target.value)} placeholder="e.g. Runway, HeyGen, Arcads" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-plat">Platform focus</Label>
            <Input id="t-plat" value={form.platformFocus} onChange={(e) => updateForm("platformFocus", e.target.value)} placeholder="e.g. YouTube, Instagram, TikTok" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {saving ? "Creating…" : "Create & search now"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
