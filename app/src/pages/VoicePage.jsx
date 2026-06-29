import { useState, useEffect } from "react";
import { Mic, Sparkles, RefreshCw } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { getVoiceProfile, bootstrapVoice, updateVoiceProfile } from "../lib/kb";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function VoicePage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("view"); // view | bootstrap

  useEffect(() => {
    (async () => {
      try {
        const p = await getVoiceProfile();
        setProfile(p);
        if (!p) setMode("bootstrap");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PageHeader title="Voice" subtitle="How you write — applied to every generated draft." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHeader
        title="Voice"
        subtitle="How you write — applied to every generated draft."
        actions={
          profile && mode === "view" ? (
            <Button variant="outline" size="sm" onClick={() => setMode("bootstrap")}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Re-train
            </Button>
          ) : null
        }
      />

      {mode === "bootstrap" ? (
        <BootstrapForm
          onDone={(p) => { setProfile(p); setMode("view"); }}
          onCancel={profile ? () => setMode("view") : null}
        />
      ) : profile ? (
        <ProfileView profile={profile} onSaved={setProfile} />
      ) : (
        <EmptyState
          icon={Mic}
          title="Teach the app your voice"
          description="Paste 5–10 of your best posts. We'll learn how you write so every draft sounds like you, not a generic AI."
          actionLabel="Get started"
          onAction={() => setMode("bootstrap")}
        />
      )}
    </div>
  );
}

function BootstrapForm({ onDone, onCancel }) {
  const { showToast } = useToast();
  const [samples, setSamples] = useState("");
  const [knownFor, setKnownFor] = useState("");
  const [take, setTake] = useState("");
  const [neverSay, setNeverSay] = useState("");
  const [running, setRunning] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    // Split on lines of 3+ dashes, or fall back to double-newline blocks.
    const parts = samples.includes("---")
      ? samples.split(/\n-{3,}\n?/)
      : samples.split(/\n\s*\n/);
    const cleaned = parts.map((s) => s.trim()).filter((s) => s.length > 20);
    if (cleaned.length === 0) {
      showToast("Paste at least one full post (separate multiple with a blank line).", "error");
      return;
    }
    setRunning(true);
    try {
      const { profile } = await bootstrapVoice({
        samples: cleaned,
        known_for: knownFor.trim() || undefined,
        defendable_take: take.trim() || undefined,
        never_say: neverSay.trim() || undefined,
      });
      showToast(`Voice learned from ${cleaned.length} posts.`, "success");
      onDone(profile);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-5">
      <div className="space-y-1.5">
        <Label htmlFor="vp-samples">Your best posts</Label>
        <p className="text-xs text-muted-foreground">
          Paste 5–10 posts. Separate each with a blank line (or a line of <code>---</code>).
        </p>
        <Textarea
          id="vp-samples"
          required
          rows={12}
          value={samples}
          onChange={(e) => setSamples(e.target.value)}
          placeholder={"First post…\n\nSecond post…\n\nThird post…"}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="vp-known">Known for</Label>
          <Input id="vp-known" value={knownFor} onChange={(e) => setKnownFor(e.target.value)} placeholder="e.g. B2B growth" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vp-take">A take you'll defend</Label>
          <Input id="vp-take" value={take} onChange={(e) => setTake(e.target.value)} placeholder="e.g. cold email is dead" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vp-never">Words you'd never use</Label>
          <Input id="vp-never" value={neverSay} onChange={(e) => setNeverSay(e.target.value)} placeholder="e.g. 'in today's world'" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={running}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          {running ? "Analyzing your voice…" : "Learn my voice"}
        </Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={running}>Cancel</Button>}
      </div>
    </form>
  );
}

function ProfileView({ profile, onSaved }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [doRules, setDoRules] = useState((profile.do_rules || []).join("\n"));
  const [dontRules, setDontRules] = useState((profile.dont_rules || []).join("\n"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateVoiceProfile({
        do_rules: doRules.split("\n").map((s) => s.trim()).filter(Boolean),
        dont_rules: dontRules.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      onSaved(updated);
      setEditing(false);
      showToast("Voice rules saved.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">How you write</h3>
          <span className="text-xs text-muted-foreground">
            {profile.sample_count || 0} samples · updated {new Date(profile.updated_at).toLocaleDateString()}
          </span>
        </div>
        {profile.summary && <p className="mt-2 text-sm text-muted-foreground">{profile.summary}</p>}
        {profile.tone_descriptors?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.tone_descriptors.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Do / Don't rules</h3>
          {!editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          )}
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-green-700 dark:text-green-400">Do</Label>
            {editing ? (
              <Textarea rows={6} value={doRules} onChange={(e) => setDoRules(e.target.value)} placeholder="One rule per line" />
            ) : (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {(profile.do_rules || []).map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-red-700 dark:text-red-400">Don't</Label>
            {editing ? (
              <Textarea rows={6} value={dontRules} onChange={(e) => setDontRules(e.target.value)} placeholder="One rule per line" />
            ) : (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {(profile.dont_rules || []).map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>

      {profile.signature_moves?.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold text-foreground">Signature moves</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {profile.signature_moves.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
