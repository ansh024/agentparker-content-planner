/**
 * Social Listening — runs real-time search for a topic via Firecrawl REST API.
 * Stores new hits in listening_hits, deduplicating by source_url.
 *
 * POST /api/listening/run
 * Body: { topicId, keywords: string[], platforms?: string[] }
 */

import { createClient } from "@supabase/supabase-js";
import { logger } from "../_logger.js";

const log = logger("listening-run");

const PLATFORM_FILTERS = {
  reddit: "reddit.com",
  hackernews: "news.ycombinator.com",
  youtube: "youtube.com",
};

async function searchWeb(query, apiKey) {
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: 8,
      lang: "en",
      scrapeOptions: { formats: ["markdown"], timeout: 10000 },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json?.data || json?.results || [];
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Please log in to continue." }, { status: 401 });
  }
  const token = authHeader.replace("Bearer ", "");

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) {
    return Response.json({ error: "Session expired. Please log in again." }, { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const body = await req.json();
  const { topicId, keywords, platforms = ["reddit", "web"] } = body;

  if (!topicId || !keywords?.length) {
    return Response.json({ error: "Topic name and keywords are required." }, { status: 400 });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return Response.json(
      { error: "Listening isn't configured yet. Add FIRECRAWL_API_KEY to enable it." },
      { status: 500 }
    );
  }

  log.info("Starting listening search", { topicId, keywords, platforms, userId: user.id });

  let totalNew = 0;
  const allResults = [];

  for (const keyword of keywords) {
    for (const platform of platforms) {
      const domain = PLATFORM_FILTERS[platform];
      const query = domain ? `${keyword} site:${domain}` : keyword;

      log.debug("Searching", { keyword, platform, query });

      try {
        const hits = await searchWeb(query, firecrawlKey);

        for (const hit of hits) {
          const sourceUrl = hit.url || hit.link;
          if (!sourceUrl) continue;

          // Deduplicate
          const { data: existing } = await supabase
            .from("listening_hits")
            .select("id")
            .eq("topic_id", topicId)
            .eq("source_url", sourceUrl)
            .maybeSingle();

          if (existing) continue;

          const { error: insertErr } = await supabase.from("listening_hits").insert({
            topic_id: topicId,
            user_id: user.id,
            source_url: sourceUrl,
            platform,
            title: hit.title || "",
            snippet: hit.description || hit.markdown?.slice(0, 300) || "",
            author: hit.author || "",
            engagement_score: hit.score || 0,
            published_at: hit.publishedDate ? new Date(hit.publishedDate).toISOString() : null,
          });

          if (!insertErr) {
            totalNew++;
            allResults.push({ title: hit.title, url: sourceUrl, platform, description: hit.description });
          }
        }
      } catch (err) {
        log.warn(`Search failed for "${keyword}" on ${platform}`, { error: err.message });
      }
    }
  }

  // Update last_run_at
  await supabase
    .from("listening_topics")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", topicId);

  log.info("Listening run complete", { topicId, totalNew });

  return Response.json({
    ok: true,
    totalNew,
    results: allResults.slice(0, 20),
    message:
      totalNew > 0
        ? `Found ${totalNew} new results across ${platforms.join(", ")}.`
        : `No new results found for "${keywords.join(", ")}". Try broader keywords.`,
  });
}
