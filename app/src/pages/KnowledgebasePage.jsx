import { useState, useEffect, useCallback } from "react";
import { BookOpen, Plus, Trash2, Pencil } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import {
  KB_KINDS, kindLabel, listKbDocuments, createKbDocument,
  updateKbDocument, deleteKbDocument,
} from "../lib/kb";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import SearchInput from "@/components/common/SearchInput";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const EMPTY_FORM = { kind: "expertise", title: "", body: "", tags: "" };

export default function KnowledgebasePage() {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState("all");
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // doc being edited, or null for new
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await listKbDocuments(filterKind === "all" ? undefined : filterKind);
      setDocuments(docs);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [filterKind, showToast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEdit = (doc) => {
    setEditing(doc);
    setForm({
      kind: doc.kind,
      title: doc.title || "",
      body: doc.body || "",
      tags: (doc.tags || []).join(", "),
    });
    setEditorOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.body.trim()) return;
    setSaving(true);
    const payload = {
      kind: form.kind,
      title: form.title.trim() || null,
      body: form.body.trim(),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (editing) {
        await updateKbDocument(editing.id, payload);
        showToast("Document updated.", "success");
      } else {
        await createKbDocument(payload);
        showToast("Added to your knowledgebase.", "success");
      }
      setEditorOpen(false);
      load();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await deleteKbDocument(confirmDelete.id);
      setDocuments((d) => d.filter((x) => x.id !== confirmDelete.id));
      showToast("Document deleted.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setConfirmDelete(null);
    }
  };

  const visible = documents.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (d.title || "").toLowerCase().includes(q) || (d.body || "").toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader
        title="Knowledgebase"
        subtitle="What you know and believe — the facts every draft is grounded in."
        actions={
          <Button onClick={openNew} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search your knowledgebase…" className="flex-1" />
        <Select value={filterKind} onValueChange={setFilterKind}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {KB_KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={documents.length === 0 ? "Your knowledgebase is empty" : "No matches"}
          description={
            documents.length === 0
              ? "Add your expertise, beliefs, frameworks and stories so every generated draft is factually yours — not generic."
              : "Try a different search or filter."
          }
          actionLabel={documents.length === 0 ? "Add your first entry" : undefined}
          onAction={documents.length === 0 ? openNew : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((doc) => (
            <div key={doc.id} className="group rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{kindLabel(doc.kind)}</Badge>
                    {doc.platform && <span className="text-xs text-muted-foreground">{doc.platform}</span>}
                  </div>
                  {doc.title && <h3 className="mt-2 font-semibold text-foreground">{doc.title}</h3>}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-4">{doc.body}</p>
                  {doc.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {doc.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(doc)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(doc)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit document" : "Add to knowledgebase"}</DialogTitle>
            <DialogDescription>
              {KB_KINDS.find((k) => k.value === form.kind)?.hint}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KB_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-title">Title <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="kb-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="A short label" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-body">Content</Label>
              <Textarea id="kb-body" required rows={7} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Write the expertise, belief, framework, story…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-tags">Tags <span className="text-muted-foreground">(comma-separated)</span></Label>
              <Input id="kb-tags" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="growth, b2b, hiring" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !form.body.trim()} className="w-full">
                {saving ? "Saving…" : editing ? "Save changes" : "Add to knowledgebase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete this document?"
        description="It will be removed from your knowledgebase and can no longer ground your drafts."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
