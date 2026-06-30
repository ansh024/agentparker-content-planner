import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";

// GET /api/ops/today
// One aggregated "today" view: triage inbox, drafts to review, today's schedule,
// fresh listening angles, daily targets + progress. Read-only orchestration over
// existing tables — no comment queue (engagement is 1-at-a-time via the extension).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "GET") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = `${today}T00:00:00.000Z`;

  const [triage, drafts, scheduled, briefs, profile, postedToday] = await Promise.all([
    supabase.from("ideas").select("id,title,source_url,created_at")
      .eq("user_id", userId).eq("status", "new").order("created_at", { ascending: false }).limit(8),
    supabase.from("content_drafts").select("id,platform,title,body,status,updated_at")
      .eq("user_id", userId).in("status", ["ready", "edited", "draft"]).order("updated_at", { ascending: false }).limit(10),
    supabase.from("content_plans").select("id,target_platform,notes,status")
      .eq("user_id", userId).eq("scheduled_date", today).limit(20),
    supabase.from("listening_briefs").select("id,headline,content_angles,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    supabase.from("profiles").select("daily_targets").eq("id", userId).maybeSingle(),
    supabase.from("content_drafts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "posted").gte("updated_at", startOfDay),
  ]);

  // Flatten the freshest listening angles into a simple actionable list.
  const angles = [];
  for (const b of briefs.data || []) {
    const list = Array.isArray(b.content_angles) ? b.content_angles : [];
    for (const a of list.slice(0, 3)) {
      angles.push({ brief_id: b.id, headline: b.headline, angle: typeof a === "string" ? a : (a.angle || a.title || JSON.stringify(a)) });
    }
  }

  return res.json({
    date: today,
    targets: profile.data?.daily_targets || null,
    progress: { posted: postedToday.count || 0 },
    triage: triage.data || [],
    drafts: drafts.data || [],
    scheduled: scheduled.data || [],
    angles: angles.slice(0, 6),
  });
}
