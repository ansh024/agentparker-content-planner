import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const body = await req.json();
  const text = body?.message?.text || body?.text || "";
  const senderId = body?.sender?.id || body?.from?.id;
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return res.json({ ok: true, action: "skipped" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let userId = null;
  if (senderId) {
    const { data: p } = await supabase.from("profiles").select("id").eq("instagram_business_id", senderId).maybeSingle();
    userId = p?.id;
  }
  if (!userId) return res.json({ ok: true, action: "skipped", reason: "unknown_user" });

  const { error } = await supabase.from("ideas").insert({
    user_id: userId, source_url: urlMatch[0], source_platform: "instagram",
    context_text: text.replace(urlMatch[0], "").trim() || null, status: "new",
  });
  return res.json({ ok: !error, action: error ? "error" : "created" });
}
