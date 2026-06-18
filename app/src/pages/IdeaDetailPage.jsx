import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { getIdeaMedia, getIdeaNotes, getImportStatus, getImportWarnings } from "../lib/ideaImport";
import { ArrowLeft, ExternalLink, Calendar, Trash2, Edit3, Save, Sparkles, Lightbulb, FileText, Loader2, RefreshCw } from "lucide-react";

const log = logger("IdeaDetail");

const STATUSES = ["new", "planned", "drafting", "published", "archived"];
const STATUS_COLORS = {
  new: "bg-blue-100 text-blue-800",
  planned: "bg-purple-100 text-purple-800",
  drafting: "bg-amber-100 text-amber-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
};

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
      showToast(`Status changed to ${status}.`, "success");
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    const metadata = {
      ...(idea.metadata || {}),
      import: {
        ...(idea.metadata?.import || {}),
        notes,
      },
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
      <div className="p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="h-48 bg-gray-200 rounded-xl" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-1/2 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!idea) return null;

  const media = getIdeaMedia(idea);
  const importStatus = getImportStatus(idea);
  const importWarnings = getImportWarnings(idea);
  const aiOutputs = idea.metadata?.ai || {};

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {media.mediaUrl ? (
          media.mediaContentType.startsWith("video/") ? (
            <video
              src={media.mediaUrl}
              poster={media.previewUrl || undefined}
              controls
              className="w-full h-64 object-cover bg-gray-950"
            />
          ) : (
            <img src={media.mediaUrl} alt="" className="w-full h-56 object-cover bg-gray-100" />
          )
        ) : media.previewUrl ? (
          <img src={media.previewUrl} alt="" className="w-full h-56 object-cover bg-gray-100" />
        ) : null}

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${STATUS_COLORS[idea.status]}`}>
              {idea.status}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
              {idea.source_platform || "manual"}
            </span>
            {importStatus !== "ready" && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${
                importStatus === "import_failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
              }`}>
                {importStatus === "import_failed" ? "Import failed" : "Importing"}
              </span>
            )}
            {idea.source_author && (
              <span className="text-xs text-gray-500">by {idea.source_author}</span>
            )}
          </div>

          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            {idea.title || idea.ai_summary || "Untitled idea"}
          </h1>

          {/* Source link */}
          <a
            href={idea.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline mb-4"
          >
            {getDomain(idea.source_url)}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          {importStatus === "importing" && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              Import is still running. Media and metadata will update when the source finishes processing.
            </div>
          )}

          {importStatus === "import_failed" && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              The link was saved, but the media import did not complete cleanly. You can still use the saved caption and source link.
            </div>
          )}

          {importWarnings.length > 0 && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
              {importWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Source Caption</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {idea.context_text || "No source caption was captured for this item."}
            </p>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Notes</span>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                  <Edit3 className="h-3 w-3" />
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveNotes}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setNotes(getIdeaNotes(idea)); setEditing(false); }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {getIdeaNotes(idea) || "No notes yet. Add context about why you saved this idea."}
              </p>
            )}
          </div>

          {/* AI summary */}
          {idea.ai_summary && (
            <div className="mt-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
              <span className="text-xs font-medium text-purple-600 uppercase">AI Summary</span>
              <p className="mt-1 text-sm text-purple-900">{idea.ai_summary}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => generateAi("brief")}
              disabled={aiLoading !== ""}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {aiLoading === "brief" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate brief
            </button>
            <button
              onClick={() => generateAi("hooks")}
              disabled={aiLoading !== ""}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {aiLoading === "hooks" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
              Generate hooks
            </button>
            <button
              onClick={() => generateAi("script")}
              disabled={aiLoading !== ""}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              {aiLoading === "script" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Draft script
            </button>
          </div>

          {aiOutputs.brief && (
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-medium uppercase text-gray-500">Brief</p>
              <p className="mt-1 text-sm text-gray-800">{aiOutputs.brief.summary}</p>
              {Array.isArray(aiOutputs.brief.why_it_works) && aiOutputs.brief.why_it_works.length > 0 && (
                <div className="mt-2 space-y-1">
                  {aiOutputs.brief.why_it_works.map((item) => (
                    <p key={item} className="text-xs text-gray-600">• {item}</p>
                  ))}
                </div>
              )}
              {Array.isArray(aiOutputs.brief.creator_angles) && aiOutputs.brief.creator_angles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {aiOutputs.brief.creator_angles.map((item) => (
                    <span key={item} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">{item}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {aiOutputs.hooks?.hooks?.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-medium uppercase text-gray-500">Hooks</p>
              <div className="mt-2 space-y-1.5">
                {aiOutputs.hooks.hooks.map((hook) => (
                  <p key={hook} className="text-sm text-gray-800">{hook}</p>
                ))}
              </div>
            </div>
          )}

          {aiOutputs.script && (
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-medium uppercase text-gray-500">Script Draft</p>
              {aiOutputs.script.title && <p className="mt-1 text-sm font-medium text-gray-900">{aiOutputs.script.title}</p>}
              {aiOutputs.script.hook && <p className="mt-2 text-sm text-gray-800">{aiOutputs.script.hook}</p>}
              {Array.isArray(aiOutputs.script.beats) && aiOutputs.script.beats.length > 0 && (
                <div className="mt-2 space-y-1">
                  {aiOutputs.script.beats.map((beat, index) => (
                    <p key={`${index}-${beat}`} className="text-xs text-gray-600">{index + 1}. {beat}</p>
                  ))}
                </div>
              )}
              {aiOutputs.script.caption_draft && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {aiOutputs.script.caption_draft}
                </div>
              )}
              {aiOutputs.script.cta && <p className="mt-2 text-xs font-medium text-brand-700">{aiOutputs.script.cta}</p>}
            </div>
          )}

          {/* Metadata */}
          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>
              <span className="text-gray-400">Created</span>
              <p>{new Date(idea.created_at).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-400">Updated</span>
              <p>{new Date(idea.updated_at).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t p-4 flex items-center gap-2 flex-wrap">
          <select
            value={idea.status}
            onChange={(e) => updateStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={scheduleIdea}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
          >
            <Calendar className="h-4 w-4" />
            Schedule for today
          </button>
          <button
            onClick={fetchIdea}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <div className="flex-1" />
          <button
            onClick={deleteIdea}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
