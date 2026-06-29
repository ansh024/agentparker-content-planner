/**
 * Draft generation — fill one content_drafts row for one platform, grounded in
 * the user's KB + voice (buildContext) and shaped by the platform playbook.
 *
 * Called per-draft by /api/drafts/[id]/generate-one (client fan-out), so each
 * platform generation is its own short request — never a server-side async loop
 * after the response (Eng review critical #1).
 */

import { buildContext, generateJson } from "./_ai.js";
import { getPlaybook } from "./_platforms.js";

/**
 * Generate structured content for a draft and return the column patch.
 * @param serviceClient supabase service-role client
 * @param userId        token-derived user id
 * @param draft         the content_drafts row (with idea fields if any)
 * @param idea          the source idea row, or null for net-new
 */
export async function generateDraftContent(serviceClient, userId, draft, idea) {
  const playbook = getPlaybook(draft.platform);
  if (!playbook || !playbook.enabled) {
    throw new Error(`Platform "${draft.platform}" is not available yet.`);
  }

  // The seed: the idea, or (net-new) whatever was stored in ai_meta.prompt.
  const seed = idea
    ? [idea.title, idea.context_text, idea.ai_summary].filter(Boolean).join("\n\n")
    : draft.ai_meta?.prompt || draft.title || "";
  if (!seed.trim()) throw new Error("Nothing to generate from yet.");

  const { kbBlock, voiceBlock, chunks } = await buildContext(serviceClient, {
    userId,
    query: seed.slice(0, 1000),
  });

  const prompt = buildPrompt({ playbook, seed, kbBlock, voiceBlock, idea });
  const structured = await generateJson(prompt, { maxTokens: 1400 });
  const body = playbook.assembleBody(structured);

  return {
    title: idea?.title || structured.hook || null,
    body,
    structured,
    status: "ready",
    ai_meta: {
      ...(draft.ai_meta || {}),
      model: process.env.OPENAI_API_KEY ? "gpt-4.1-mini" : "claude-haiku-4-5",
      kb_docs_used: chunks.map((c) => c.document_id),
      grounded: chunks.length > 0,
      on_voice: Boolean(voiceBlock),
      generated_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
}

function buildPrompt({ playbook, seed, kbBlock, voiceBlock, idea }) {
  return `You are helping a creator turn an idea into an original, platform-native ${playbook.label} draft.
Write FOR ${playbook.label} — not a generic post reflowed. This must read like the creator wrote it.

${voiceBlock ? `THE CREATOR'S VOICE — match it precisely:\n${voiceBlock}\n` : ""}
${kbBlock ? `GROUND IN THESE FACTS FROM THE CREATOR'S KNOWLEDGEBASE (use them; do not invent specifics):\n${kbBlock}\n` : ""}
THE IDEA / SOURCE:
${seed}
${idea?.source_url ? `\nSource link: ${idea.source_url}` : ""}

${playbook.guidance}

Return ONLY valid JSON with these fields:
${playbook.schemaHint}

Be specific and original. No generic filler, no slop. Return only the JSON object.`;
}
