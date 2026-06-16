import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

const PLATFORM_FILTERS = { reddit: "reddit.com", hackernews: "news.ycombinator.com", youtube: "youtube.com" };

async function searchWeb(query, apiKey) {
  const resp = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit: 8, lang: "en", scrapeOptions: { formats: ["markdown"], timeout: 10000 } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Firecrawl HTTP ${resp.status}`);
  const j = await resp.json();
  return j?.data || j?.results || [];
}

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return res.json({ error: "Please log in to continue." }, 401);

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return res.json({ error: "Session expired." }, 401);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const body = await req.json();
  const { topicId, keywords, platforms = ["reddit", "web"] } = body;
  if (!topicId || !keywords?.length) return res.json({ error: "Topic name and keywords are required." }, 400);

  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) return res.json({ error: "Listening isn't configured. Add FIRECRAWL_API_KEY." }, 500);

  let totalNew = 0;
  for (const kw of keywords) {
    for (const platform of platforms) {
      const domain = PLATFORM_FILTERS[platform];
      const query = domain ? `${kw} site:${domain}` : kw;
      try {
        const hits = await searchWeb(query, fcKey);
        for (const hit of hits) {
          const url = hit.url || hit.link;
          if (!url) continue;
          const { data: existing } = await supabase.from("listening_hits")
            .select("id").eq("topic_id", topicId).eq("source_url", url).maybeSingle();
          if (existing) continue;
          const { error } = await supabase.from("listening_hits").insert({
            topic_id: topicId, user_id: user.id, source_url: url, platform,
            title: hit.title || "", snippet: hit.description || hit.markdown?.slice(0, 300) || "",
            author: hit.author || "", engagement_score: hit.score || 0,
            published_at: hit.publishedDate ? new Date(hit.publishedDate).toISOString() : null,
          });
          if (!error) totalNew++;
        }
      } catch (e) { /* skip failed platform */ }
    }
  }

  await supabase.from("listening_topics").update({ last_run_at: new Date().toISOString() }).eq("id", topicId);
  return res.json({ ok: true, totalNew, message: totalNew > 0 ? `Found ${totalNew} new results.` : `No new results for "${keywords.join(", ")}".` });
}
