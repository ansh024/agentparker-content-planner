import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { friendlyError, mapSupabaseError } from "../lib/errors";
import { ArrowLeft, ExternalLink, Calendar, Trash2, Edit3, Save } from "lucide-react";

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
  const [contextText, setContextText] = useState("");
  const [saving, setSaving] = useState(false);

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
    setContextText(data.context_text || "");
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
    const { error } = await supabase.from("ideas").update({ context_text: contextText }).eq("id", id);
    if (error) {
      showToast(friendlyError(mapSupabaseError(error, "update-idea")), "error");
    } else {
      setIdea((prev) => ({ ...prev, context_text: contextText }));
      setEditing(false);
      showToast("Notes saved.", "success");
    }
    setSaving(false);
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

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {/* OG image */}
        {idea.og_image_url && (
          <img src={idea.og_image_url} alt="" className="w-full h-48 object-cover bg-gray-100" />
        )}

        <div className="p-4 sm:p-5">
          {/* Status + platform */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${STATUS_COLORS[idea.status]}`}>
              {idea.status}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
              {idea.source_platform || "manual"}
            </span>
            {idea.source_author && (
              <span className="text-xs text-gray-500">by {idea.source_author}</span>
            )}
          </div>

          {/* Title / summary */}
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

          {/* Notes */}
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
                  value={contextText}
                  onChange={(e) => setContextText(e.target.value)}
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
                    onClick={() => { setContextText(idea.context_text || ""); setEditing(false); }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {idea.context_text || "No notes yet. Add context about why you saved this idea."}
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
