import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return res.json({ error: "Please log in to continue." }, 401);
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return res.json({ error: "Session expired." }, 401);

  const body = await req.json();
  const url = body?.url;
  if (!url) return res.json({ error: "URL is required." }, 400);

  let ogData = {};
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "ContentPlanner/1.0" }, signal: AbortSignal.timeout(5000) });
    const html = await resp.text();
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
    const titleTag = html.match(/<title>([^<]+)<\/title>/i);
    ogData = { title: ogTitle?.[1] || titleTag?.[1] || null, image: ogImage?.[1] || null, description: ogDesc?.[1] || null };
  } catch (e) { /* ignore */ }

  let summary = null;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && (ogData.title || ogData.description)) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicKey });
      const msg = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 120,
        messages: [{ role: "user", content: `Summarize in 2 sentences for a content creator:\nTitle: ${ogData.title || ""}\nDescription: ${ogData.description || ""}` }],
      });
      summary = msg.content[0]?.text || null;
    } catch (e) { /* ignore */ }
  }

  return res.json({ url, og_title: ogData.title, og_image: ogData.image, og_description: ogData.description, ai_summary: summary });
}
