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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.json({ error: "AI analysis isn't configured. Add ANTHROPIC_API_KEY." }, 500);

  const body = await req.json();
  const { topicId, topicName } = body;
  if (!topicId) return res.json({ error: "Topic ID required." }, 400);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: hits, error: hitsError } = await supabase
    .from("listening_hits").select("title, snippet, platform, source_url")
    .eq("topic_id", topicId).eq("user_id", user.id)
    .order("engagement_score", { ascending: false }).limit(30);

  if (hitsError) return res.json({ error: "Couldn't load results." }, 500);
  if (!hits?.length) return res.json({ error: "No results found yet. Run a search first." }, 400);

  const hitsSummary = hits.map((h, i) =>
    `${i + 1}. [${h.platform}] ${h.title || "Untitled"}${h.snippet ? ` — ${h.snippet.slice(0, 150)}` : ""}`
  ).join("\n");

  const prompt = `You are a content strategist. Here are ${hits.length} results from monitoring discussions about "${topicName || "this topic"}":

${hitsSummary}

Based on these discussions, return a JSON object with:
- "themes": array of 3-4 short strings describing the main topics/pain points being discussed
- "ideas": array of 4-5 content ideas, each with:
  - "title": specific, compelling content title
  - "angle": one sentence on the unique angle or hook
  - "why": one sentence on why this resonates with the audience based on the results
  - "platform": best platform ("instagram", "youtube", "twitter", "blog", or "newsletter")

Return only valid JSON, no markdown fences.`;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!parsed?.ideas?.length) return res.json({ error: "AI couldn't generate ideas. Try again." }, 500);
    return res.json({ themes: parsed.themes || [], ideas: parsed.ideas });
  } catch (e) {
    return res.json({ error: "AI analysis failed. Try again." }, 500);
  }
}
