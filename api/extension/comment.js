import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { applyExtensionCors, isPreflight } from "../_cors.js";
import { buildContext, generateJson } from "../_ai.js";
import { logger } from "../_logger.js";

const log = logger("ext-comment");

export const config = { maxDuration: 30 };

// POST /api/extension/comment
// Body: { postText, authorName?, authorHeadline? }
// Returns 1-3 thoughtful, on-voice comment options grounded in the user's KB.
// Draft-only — the extension copies to clipboard; we never auto-post.
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  // Pinned CORS (Eng critical #3) — reject any non-extension browser origin.
  if (!applyExtensionCors(req, nodeRes)) return res.json({ error: "Forbidden origin." }, 403);
  if (isPreflight(req)) return res.empty(204);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return res.json({ error: "AI is not configured on the server." }, 500);
  }

  const body = await req.json();
  const postText = String(body.postText || "").trim().slice(0, 4000);
  if (!postText) return res.json({ error: "No post content to comment on." }, 400);
  const authorName = String(body.authorName || "").trim().slice(0, 120);
  const authorHeadline = String(body.authorHeadline || "").trim().slice(0, 200);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Ground on the user's OWN expertise/beliefs that relate to the post topic.
    const { kbBlock, voiceBlock } = await buildContext(supabase, { userId, query: postText, k: 6 });
    const prompt = buildPrompt({ postText, authorName, authorHeadline, kbBlock, voiceBlock });
    const out = await generateJson(prompt, { maxTokens: 700 });
    const comments = Array.isArray(out.comments) ? out.comments.filter(Boolean).slice(0, 3) : [];
    if (comments.length === 0) return res.json({ error: "Could not draft a comment. Try again." }, 502);
    return res.json({ comments });
  } catch (err) {
    log.error("Comment generation failed", { error: err.message });
    return res.json({ error: "Comment generation failed. Try again." }, 500);
  }
}

function buildPrompt({ postText, authorName, authorHeadline, kbBlock, voiceBlock }) {
  return `You are helping a creator write a genuinely thoughtful LinkedIn comment on someone else's post.
This must add value and sound like the creator — NEVER generic praise ("Great post!", "So true!", "Thanks for sharing"), no emojis spam, no sycophancy.

${voiceBlock ? `THE CREATOR'S VOICE — write in it:\n${voiceBlock}\n` : ""}
${kbBlock ? `THE CREATOR'S RELEVANT EXPERTISE / TAKES (draw on these to add a real perspective):\n${kbBlock}\n` : ""}
THE POST${authorName ? ` by ${authorName}` : ""}${authorHeadline ? ` (${authorHeadline})` : ""}:
"""
${postText}
"""

Write comments that do at least one of: add a specific insight or example, respectfully extend or challenge the point, or ask a sharp question. Reference the post's actual substance. 2-4 sentences each.

Return ONLY valid JSON: { "comments": ["option 1", "option 2"] }  (2-3 distinct options). Return only the JSON object.`;
}
