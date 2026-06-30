import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Inbox, PenLine, CalendarDays, Radio, Target, Wand2, CheckCircle2, ArrowRight,
} from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { getToday, setTargets, fillMyWeek } from "../lib/ops";
import { platformLabel } from "../lib/drafts";
import PageHeader from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import BatchRepurposeDialog from "@/components/ops/BatchRepurposeDialog";

export default function TodayPage() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getToday());
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const fill = async () => {
    setFilling(true);
    try {
      const { plans } = await fillMyWeek(5);
      showToast(`Planned ${plans.length} posts on your calendar.`, "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setFilling(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PageHeader title="Today" subtitle="Your daily content operating rhythm." />
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      </div>
    );
  }

  const t = data || {};
  const targets = t.targets;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHeader
        title="Today"
        subtitle="Your daily content operating rhythm."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBatchOpen(true)}>
              <Wand2 className="mr-1.5 h-4 w-4" /> Batch repurpose
            </Button>
            <Button size="sm" onClick={fill} disabled={filling}>
              <CalendarDays className="mr-1.5 h-4 w-4" /> {filling ? "Planning…" : "Fill my week"}
            </Button>
          </div>
        }
      />

      {/* Targets / streak */}
      <div className="mb-5 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Daily targets</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setTargetsOpen(true)}>
            {targets ? "Edit" : "Set targets"}
          </Button>
        </div>
        {targets ? (
          <div className="mt-3 flex gap-6 text-sm">
            <div>
              <span className="text-2xl font-bold text-foreground">{t.progress?.posted || 0}</span>
              <span className="text-muted-foreground"> / {targets.posts} posts</span>
            </div>
            <div>
              <span className="text-muted-foreground">{targets.comments} comments goal</span>
              <span className="ml-1 text-xs text-muted-foreground">(track via the extension)</span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Set a soft daily goal to build a rhythm — e.g. 2 posts + 10 comments.</p>
        )}
      </div>

      <Section icon={PenLine} title="Drafts to review" count={t.drafts?.length} to="/drafts">
        {t.drafts?.length ? (
          <ul className="divide-y">
            {t.drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <Badge variant="secondary" className="shrink-0">{platformLabel(d.platform)}</Badge>
                <span className="truncate text-sm text-foreground">{d.title || d.body?.slice(0, 80) || "Untitled draft"}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{d.status}</span>
              </li>
            ))}
          </ul>
        ) : <Empty text="No drafts waiting. Repurpose an idea to get started." />}
      </Section>

      <Section icon={Inbox} title="Triage inbox" count={t.triage?.length} to="/inbox">
        {t.triage?.length ? (
          <ul className="divide-y">
            {t.triage.map((i) => (
              <li key={i.id} className="py-2">
                <Link to={`/inbox/${i.id}`} className="text-sm text-foreground hover:text-primary">
                  {i.title || i.source_url}
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty text="Inbox zero. Nice." />}
      </Section>

      <Section icon={Radio} title="Fresh listening angles" count={t.angles?.length} to="/topics">
        {t.angles?.length ? (
          <ul className="divide-y">
            {t.angles.map((a, idx) => (
              <li key={idx} className="py-2">
                <p className="text-sm text-foreground">{a.angle}</p>
                <p className="text-xs text-muted-foreground">{a.headline}</p>
              </li>
            ))}
          </ul>
        ) : <Empty text="No new angles yet. Run a listening topic." />}
      </Section>

      <Section icon={CalendarDays} title="Scheduled today" count={t.scheduled?.length} to="/calendar">
        {t.scheduled?.length ? (
          <ul className="divide-y">
            {t.scheduled.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <Badge variant="secondary" className="shrink-0">{platformLabel(p.target_platform)}</Badge>
                <span className="truncate text-sm text-foreground">{p.notes || "Planned post"}</span>
                <CheckCircle2 className={`ml-auto h-4 w-4 ${p.status === "posted" ? "text-green-600" : "text-muted-foreground/30"}`} />
              </li>
            ))}
          </ul>
        ) : <Empty text="Nothing scheduled today." />}
      </Section>

      {/* Targets dialog */}
      <TargetsDialog open={targetsOpen} onOpenChange={setTargetsOpen} current={targets} onSaved={load} />

      {/* Batch repurpose */}
      <BatchRepurposeDialog open={batchOpen} onOpenChange={setBatchOpen} onDone={load} />
    </div>
  );
}

function Section({ icon: Icon, title, count, to, children }) {
  return (
    <div className="mb-5 rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {count > 0 && <Badge className="h-5 px-1.5 text-[10px]">{count}</Badge>}
        </div>
        <Link to={to} className="flex items-center gap-1 text-xs text-primary hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>;
}

function TargetsDialog({ open, onOpenChange, current, onSaved }) {
  const { showToast } = useToast();
  const [posts, setPosts] = useState(current?.posts ?? 2);
  const [comments, setComments] = useState(current?.comments ?? 10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setPosts(current?.posts ?? 2); setComments(current?.comments ?? 10); }
  }, [open, current]);

  const save = async () => {
    setSaving(true);
    try {
      await setTargets(posts, comments);
      showToast("Targets saved.", "success");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Daily targets</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tp">Posts / day</Label>
            <Input id="tp" type="number" min="0" value={posts} onChange={(e) => setPosts(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tc">Comments / day</Label>
            <Input id="tc" type="number" min="0" value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save targets"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
