import { w } from "../_w.js";

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

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
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey && ogData.description) {
    try {
      const ai = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${orKey}` },
        body: JSON.stringify({ model: "anthropic/claude-3.5-haiku", messages: [{ role: "user", content: `Summarize in 2 sentences for a content creator:\nTitle: ${ogData.title}\nDescription: ${ogData.description}` }], max_tokens: 100 }),
      });
      const j = await ai.json();
      summary = j.choices?.[0]?.message?.content || null;
    } catch (e) { /* ignore */ }
  }

  return res.json({ url, og_title: ogData.title, og_image: ogData.image, og_description: ogData.description, ai_summary: summary });
}
