import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";

// GET  /api/voice          → read the current voice_profile
// PATCH /api/voice         → user edits to do/dont rules etc. (manual override)
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const { data } = await supabase
      .from("voice_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return res.json({ profile: data || null });
  }

  if (req.method === "PATCH") {
    const body = await req.json();
    const patch = { updated_at: new Date().toISOString() };
    for (const f of ["summary"]) if (f in body) patch[f] = body[f];
    for (const f of ["tone_descriptors", "do_rules", "dont_rules", "signature_moves"]) {
      if (f in body) patch[f] = Array.isArray(body[f]) ? body[f] : null;
    }
    const { data, error } = await supabase
      .from("voice_profile")
      .update(patch)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.json({ error: "Could not save voice changes." }, 500);
    return res.json({ profile: data });
  }

  return res.json({ error: "Method not allowed" }, 405);
}
