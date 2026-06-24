import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Loader2, Link2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";
import { detectPlatform, resolveSharePayload } from "../lib/shareTarget";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { IDEA_STATUSES, STATUS_LABELS } from "@/components/common/StatusBadge";

const log = logger("SharePage");
const PENDING_SHARE_KEY = "pendingShare";

const PLATFORM_ICONS = {
  instagram: "📸", youtube: "▶️", twitter: "🐦", reddit: "🤖",
  tiktok: "🎵", web: "🌐", manual: "📝",
};

function getPendingShare() {
  try {
    const raw = sessionStorage.getItem(PENDING_SHARE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setPendingShare(payload) {
  sessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(payload));
}

function clearPendingShare() {
  sessionStorage.removeItem(PENDING_SHARE_KEY);
}

function getDomain(u) {
  try { return new URL(u).hostname.replace("www.", ""); } catch { return u; }
}

export default function SharePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sharedPayload = useMemo(() => {
    const resolved = resolveSharePayload(searchParams);
    const pending = getPendingShare();
    return resolved.url
      ? resolved
      : { url: pending?.url || "", title: pending?.title || "", text: pending?.text || "" };
  }, [searchParams]);

  // Form fields
  const [title, setTitle] = useState(sharedPayload.title || "");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("new");
  const [tags, setTags] = useState("");
  const [topicId, setTopicId] = useState("");
  const [topics, setTopics] = useState([]);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  const platform = detectPlatform(sharedPayload.url);
  const noUrl = !sharedPayload.url;

  // Redirect unauthenticated users, storing the payload for after login
  useEffect(() => {
    if (authLoading) return;
    if (!user && !noUrl) {
      setPendingShare(sharedPayload);
      navigate("/login?next=/share", { replace: true });
    }
  }, [authLoading, user, noUrl, sharedPayload, navigate]);

  // Pre-fill title from shared payload once resolved
  useEffect(() => {
    if (sharedPayload.title && !title) setTitle(sharedPayload.title);
  }, [sharedPayload.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load listening topics for the dropdown
  useEffect(() => {
    if (!user) return;
    supabase
      .from("listening_topics")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setTopics(data || []));
  }, [user]);

  // Auto-focus title on mount
  useEffect(() => {
    if (user && !noUrl) setTimeout(() => titleRef.current?.focus(), 100);
  }, [user, noUrl]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!sharedPayload.url) return;
    setSaving(true);

    const session = (await supabase.auth.getSession()).data.session;
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          url: sharedPayload.url,
          platform,
          shared_title: sharedPayload.title,
          shared_text: sharedPayload.text,
          user_title: title.trim(),
          notes: notes.trim(),
          status,
          tags: tagList.length ? tagList : null,
          topic_id: topicId || null,
          defer_enrichment: true,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        log.error("Import failed", payload);
        setSaving(false);
        return;
      }

      const ideaId = payload.idea?.id;
      clearPendingShare();

      // Fire-and-forget enrichment — survives navigation via keepalive
      if (ideaId) {
        fetch(`/api/ideas/${ideaId}/enrich`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          keepalive: true,
        }).catch(() => {});
      }

      navigate("/inbox", { replace: true });
    } catch (err) {
      log.error("Save error", err);
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (noUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-10 w-10 text-amber-600" />
          </div>
          <h1 className="text-lg font-semibold">No link found</h1>
          <p className="mt-2 text-sm text-muted-foreground">Share a URL to save it.</p>
          <Button className="mt-4 w-full" variant="outline" onClick={() => navigate("/inbox")}>Go to Inbox</Button>
        </Card>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8 sm:items-center">
      <div className="w-full max-w-sm space-y-4">
        {/* Source preview */}
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
          <span className="text-lg">{PLATFORM_ICONS[platform] || "🌐"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{getDomain(sharedPayload.url)}</p>
            {sharedPayload.text && (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{sharedPayload.text}</p>
            )}
          </div>
          <Link2 className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
        </div>

        {/* Compose form */}
        <Card className="p-4">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
              <Input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this idea a name…"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Note / brief</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why did you save this? Your angle…"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IDEA_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Topic</label>
                <Select value={topicId} onValueChange={setTopicId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No topic</SelectItem>
                    {topics.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tags</label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="comma, separated, tags"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving…</> : "Save idea"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/inbox")} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
