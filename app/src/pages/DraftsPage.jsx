import { useState, useEffect, useCallback } from "react";
import { PenLine } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { listDrafts, REPURPOSE_PLATFORMS } from "../lib/drafts";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import DraftCard from "@/components/drafts/DraftCard";

const STATUSES = ["draft", "generating", "ready", "edited", "scheduled", "posted", "failed"];

export default function DraftsPage() {
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (status !== "all") filters.status = status;
      if (platform !== "all") filters.platform = platform;
      setDrafts(await listDrafts(filters));
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [status, platform, showToast]);

  useEffect(() => { load(); }, [load]);

  const onChange = (d) =>
    setDrafts((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  const onRemove = (id) =>
    setDrafts((prev) => prev.filter((x) => x.id !== id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHeader
        title="Drafts"
        subtitle="Every platform draft in flight — edit, copy, and schedule."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {REPURPOSE_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No drafts yet"
          description="Open an idea and hit Repurpose to generate platform-native drafts grounded in your knowledgebase and voice."
        />
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} onChange={onChange} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
