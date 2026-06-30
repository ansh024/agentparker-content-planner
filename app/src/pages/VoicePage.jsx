import { useState, useEffect } from "react";
import { Mic, Sparkles, RefreshCw, Plus, X } from "lucide-react";
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

// Chip-style input: type and press Enter (or comma) to add a value.
function TagInput({ id, values, onChange, placeholder }) {
  const [draft, setDraft] = useState("");

  const commit = (raw) => {
    const v = raw.trim().replace(/,$/, "").trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };

  const remove = (i) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
      {values.map((v, i) => (
        <Badge key={`${v}-${i}`} variant="secondary" className="gap-1 pr-1">
          {v}
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-sm opacity-60 hover:opacity-100"
            aria-label={`Remove ${v}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && values.length) {
            remove(values.length - 1);
          }
        }}
        onBlur={() => draft && commit(draft)}
        placeholder={values.length ? "" : placeholder}
        className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function BootstrapForm({ onDone, onCancel }) {
  const { showToast } = useToast();
  const [posts, setPosts] = useState([""]);
  const [knownFor, setKnownFor] = useState([]);
  const [take, setTake] = useState([]);
  const [neverSay, setNeverSay] = useState([]);
  const [running, setRunning] = useState(false);

  const updatePost = (i, v) => setPosts((prev) => prev.map((p, idx) => (idx === i ? v : p)));
  const addPost = () => setPosts((prev) => [...prev, ""]);
  const removePost = (i) => setPosts((prev) => (prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i)));

  const submit = async (e) => {
    e.preventDefault();
    const cleaned = posts.map((s) => s.trim()).filter((s) => s.length > 20);
    if (cleaned.length === 0) {
      showToast("Add at least one full post (20+ characters).", "error");
      return;
    }
    setRunning(true);
    try {
      const { profile } = await bootstrapVoice({
        samples: cleaned,
        known_for: knownFor.join("; ") || undefined,
        defendable_take: take.join("; ") || undefined,
        never_say: neverSay.join("; ") || undefined,
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
        <Label>Your best posts</Label>
        <p className="text-xs text-muted-foreground">
          Add 5–10 posts — one per box. The more you add, the better we learn your voice.
        </p>
        <div className="space-y-2">
          {posts.map((post, i) => (
            <div key={i} className="relative">
              <Textarea
                rows={5}
                value={post}
                onChange={(e) => updatePost(i, e.target.value)}
                placeholder={`Post ${i + 1}…`}
                className="pr-9"
              />
              {(posts.length > 1 || post) && (
                <button
                  type="button"
                  onClick={() => removePost(i)}
                  className="absolute right-2 top-2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove post ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addPost} className="mt-1">
          <Plus className="mr-1.5 h-4 w-4" /> Add another post
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="vp-known">Known for</Label>
          <TagInput id="vp-known" values={knownFor} onChange={setKnownFor} placeholder="e.g. B2B growth" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vp-take">Takes you'll defend</Label>
          <TagInput id="vp-take" values={take} onChange={setTake} placeholder="e.g. cold email is dead" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vp-never">Words you'd never use</Label>
          <TagInput id="vp-never" values={neverSay} onChange={setNeverSay} placeholder="e.g. 'in today's world'" />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-muted-foreground">Press Enter or comma to add each entry.</p>
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
