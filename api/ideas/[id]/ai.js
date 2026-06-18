import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { w } from "../../_w.js";

const ACTIONS = new Set(["brief", "hooks", "script"]);

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return res.json({ error: "Please log in to continue." }, 401);

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await anonClient.auth.getUser(token);
  if (!user) return res.json({ error: "Session expired." }, 401);

  const url = new URL(req.url, "http://localhost");
  const ideaId = url.pathname.split("/").slice(-2, -1)[0];
  const body = await req.json();
  const action = String(body.action || "").toLowerCase();
  if (!ACTIONS.has(action)) return res.json({ error: "Unsupported AI action." }, 400);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: idea, error } = await supabase.from("ideas").select("*").eq("id", ideaId).eq("user_id", user.id).single();
  if (error || !idea) return res.json({ error: "This idea could not be found." }, 404);

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return res.json({ error: "AI is not configured on the server." }, 500);
  }

  try {
    const output = await generateIdeaOutput(action, idea);
    const metadata = {
      ...(idea.metadata || {}),
      ai: {
        ...(idea.metadata?.ai || {}),
        [action]: {
          ...output,
          generated_at: new Date().toISOString(),
        },
      },
    };

    const patch = { metadata };
    if (action === "brief" && output.summary) patch.ai_summary = output.summary;

    const { data: updatedIdea, error: updateError } = await supabase
      .from("ideas")
      .update(patch)
      .eq("id", ideaId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError || !updatedIdea) {
      return res.json({ error: "AI output was generated, but couldn't be saved." }, 500);
    }

    return res.json({ action, output, idea: updatedIdea });
  } catch (aiError) {
    return res.json({ error: "AI generation failed. Try again." }, 500);
  }
}

function sourceContext(idea) {
  return {
    title: idea.title || "",
    caption: idea.context_text || "",
    author: idea.source_author || idea.metadata?.import?.creator_handle || "",
    platform: idea.source_platform || "",
    mediaType: idea.metadata?.import?.media_type || "link",
    transcript: idea.metadata?.import?.transcript_excerpt || "",
    notes: idea.metadata?.import?.notes || "",
    sourceUrl: idea.source_url || "",
  };
}

function promptForAction(action, idea) {
  const ctx = sourceContext(idea);
  const base = `You are helping a creator turn saved inspiration into original content ideas.

Platform: ${ctx.platform}
Media type: ${ctx.mediaType}
Source author: ${ctx.author || "Unknown"}
Source URL: ${ctx.sourceUrl}
Source title: ${ctx.title || "Untitled"}
Source caption/body:
${ctx.caption || "None"}

Transcript excerpt:
${ctx.transcript || "None"}

User notes:
${ctx.notes || "None"}
`;

  if (action === "brief") {
    return `${base}
Return JSON with:
- summary: 2 concise sentences on what this post is doing
- why_it_works: array of 3 short bullets
- creator_angles: array of 3 short original angles this creator could explore next
Return only valid JSON.`;
  }

  if (action === "hooks") {
    return `${base}
Return JSON with:
- hooks: array of 6 short hook lines for original social posts inspired by this source
Return only valid JSON.`;
  }

  return `${base}
Return JSON with:
- title: short working title
- hook: 1 strong opening line
- beats: array of 5 short script beats in order
- caption_draft: one draft caption paragraph
- cta: one short call to action
The script must be original and inspired by the source, not a paraphrase.
Return only valid JSON.`;
}

async function generateIdeaOutput(action, idea) {
  const prompt = promptForAction(action, idea);
  const text = process.env.OPENAI_API_KEY
    ? await generateWithOpenAI(prompt)
    : await generateWithAnthropic(prompt);
  return parseJson(text);
}

async function generateWithOpenAI(prompt) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });
  return response.output_text || "";
}

async function generateWithAnthropic(prompt) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content?.[0]?.text || "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON returned");
    return JSON.parse(match[0]);
  }
}
