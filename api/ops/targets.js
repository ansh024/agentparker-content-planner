import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";

// POST /api/ops/targets  body: { posts, comments }
// Set the user's soft daily targets (personal accountability, not gamification).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const body = await req.json();
  const targets = {
    posts: clampInt(body.posts, 0, 50),
    comments: clampInt(body.comments, 0, 200),
  };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from("profiles")
    .update({ daily_targets: targets, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return res.json({ error: "Could not save targets." }, 500);
  return res.json({ targets });
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
