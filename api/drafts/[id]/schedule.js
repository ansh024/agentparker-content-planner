import { createClient } from "@supabase/supabase-js";
import { w } from "../../_w.js";
import { requireUser } from "../../_auth.js";

// POST /api/drafts/[id]/schedule  body: { date: "YYYY-MM-DD" }
// Creates a content_plans row for the draft (calendar uses the existing schema).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const url = new URL(req.url, "http://localhost");
  const draftId = url.pathname.split("/").slice(-2, -1)[0];
  const body = await req.json();
  const date = String(body.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.json({ error: "A valid date is required." }, 400);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: draft } = await supabase
    .from("content_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!draft) return res.json({ error: "Draft not found." }, 404);

  const { data: plan, error } = await supabase
    .from("content_plans")
    .insert({
      user_id: userId,
      idea_id: draft.idea_id,
      scheduled_date: date,
      target_platform: draft.platform,
      status: "planned",
      notes: draft.title || (draft.body || "").slice(0, 120),
    })
    .select()
    .single();
  if (error) return res.json({ error: "Could not schedule this draft." }, 500);

  await supabase
    .from("content_drafts")
    .update({ status: "scheduled", updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("user_id", userId);

  return res.json({ plan }, 201);
}
