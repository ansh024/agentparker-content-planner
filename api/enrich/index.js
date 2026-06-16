// Receives enriched metadata for a URL
// Called by the background enrichment worker or client-side trigger
// Uses OpenRouter with Claude Haiku for fast, cheap summaries

import { logger } from "../_logger.js";

const log = logger("enrich-handler");

export default async function handler(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await req.json();
  const { url } = body;

  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;

  // Fetch OpenGraph metadata from the URL
  let ogData = {};
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ContentPlanner/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();

    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
    const title = html.match(/<title>([^<]+)<\/title>/i);

    ogData = {
      title: ogTitle?.[1] || title?.[1] || null,
      image: ogImage?.[1] || null,
      description: ogDesc?.[1] || null,
    };
  } catch (e) {
    console.error("Failed to fetch URL metadata:", e.message);
  }

  // Generate AI summary if we have content and an API key
  let summary = null;
  if (openRouterKey && ogData.description) {
    try {
      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3.5-haiku",
          messages: [
            {
              role: "user",
              content: `Summarize this content in 2 concise sentences for a content creator to reference later. Focus on what makes it interesting or useful:\n\nTitle: ${ogData.title}\nDescription: ${ogData.description}`,
            },
          ],
          max_tokens: 100,
        }),
      });

      const aiJson = await aiRes.json();
      summary = aiJson.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.error("AI enrichment failed:", e.message);
    }
  }

  return Response.json({
    url,
    og_title: ogData.title,
    og_image: ogData.image,
    og_description: ogData.description,
    ai_summary: summary,
  });
}
