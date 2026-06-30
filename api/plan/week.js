import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { generateJson } from "../_ai.js";
import { logger } from "../_logger.js";

const log = logger("plan-week");

export const config = { maxDuration: 30 };

// POST /api/plan/week  body: { days?: 5, platform?: 'linkedin' }
// Proposes a balanced week of posts from the user's KB + listening + inbox and
// writes content_plans rows (you accept/swap/edit them in the calendar).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return res.json({ error: "AI is not configured on the server." }, 500);
  }

  const body = await req.json();
  const days = Math.min(Math.max(parseInt(body.days, 10) || 5, 1), 7);
  const platform = String(body.platform || "linkedin").toLowerCase();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Gather lightweight context (titles only — keep the prompt cheap).
  const [ideas, briefs, kb] = await Promise.all([
    supabase.from("ideas").select("id,title,ai_summary").eq("user_id", userId).eq("status", "new").order("created_at", { ascending: false }).limit(12),
    supabase.from("listening_briefs").select("headline,content_angles").eq("user_id", userId).order("created_at", { ascending: false }).limit(4),
    supabase.from("kb_documents").select("title,kind").eq("user_id", userId).in("kind", ["expertise", "belief", "framework"]).limit(15),
  ]);

  const angles = (briefs.data || []).flatMap((b) =>
    (Array.isArray(b.content_angles) ? b.content_angles : []).slice(0, 3)
      .map((a) => (typeof a === "string" ? a : a.angle || a.title)).filter(Boolean)
  );

  const prompt = buildPrompt({
    days,
    ideas: (ideas.data || []).map((i) => i.title || i.ai_summary).filter(Boolean),
    angles,
    expertise: (kb.data || []).map((d) => `${d.kind}: ${d.title}`).filter(Boolean),
  });

  let proposed;
  try {
    const out = await generateJson(prompt, { maxTokens: 1200 });
    proposed = Array.isArray(out.posts) ? out.posts.slice(0, days) : [];
  } catch (err) {
    log.error("Week plan generation failed", { error: err.message });
    return res.json({ error: "Could not propose a plan. Try again." }, 500);
  }
  if (proposed.length === 0) return res.json({ error: "No plan was proposed. Add some ideas or KB entries first." }, 422);

  // Map proposals onto the next `days` dates and write content_plans rows.
  const base = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const rows = proposed.map((p, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      user_id: userId,
      scheduled_date: d.toISOString().slice(0, 10),
      target_platform: platform,
      status: "planned",
      notes: [p.title, p.angle].filter(Boolean).join(" — ").slice(0, 500),
    };
  });

  const { data: plans, error } = await supabase.from("content_plans").insert(rows).select();
  if (error) {
    log.error("content_plans insert failed", { error: error.message });
    return res.json({ error: "Plan proposed but could not be saved." }, 500);
  }
  return res.json({ plans, proposed }, 201);
}

function buildPrompt({ days, ideas, angles, expertise }) {
  return `Propose a balanced ${days}-day LinkedIn content plan for a creator. One post per day.
Use their material below — don't invent topics unrelated to it. Vary the angle (story, contrarian take, how-to, observation) across the week. No generic filler.

THEIR EXPERTISE / BELIEFS:
${expertise.length ? expertise.map((e) => `- ${e}`).join("\n") : "- (none provided)"}

FRESH LISTENING ANGLES (trending in their space):
${angles.length ? angles.map((a) => `- ${a}`).join("\n") : "- (none)"}

UNUSED IDEAS IN THEIR INBOX:
${ideas.length ? ideas.map((i) => `- ${i}`).join("\n") : "- (none)"}

Return ONLY valid JSON: { "posts": [ { "title": "working title", "angle": "the specific angle/approach" } ] }
Exactly ${days} posts, ordered Monday-first. Return only the JSON object.`;
}
