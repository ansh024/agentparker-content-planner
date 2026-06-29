/**
 * Shared AI module — the cross-cutting foundation for M1+ (see
 * docs/plans/scaling-hub/00-overview.md §7).
 *
 * Everything that grounds a generation lives here so the repurposing engine
 * (M2) and the extension (M3) reuse one implementation:
 *   - embed()           batch embeddings (text-embedding-3-small)
 *   - chunkText()       deterministic ~500-token chunking with overlap
 *   - retrieveContext() top-K KB chunks for a query, tenant-scoped
 *   - voiceBrief()      compact "write like this" block from voice_profile
 *   - buildContext()    { kbBlock, voiceBlock } consumed by every generator
 *   - generateJson()    OpenAI-primary / Anthropic-fallback JSON generation
 *
 * The OpenAI/Anthropic provider logic mirrors api/ideas/[id]/ai.js so the two
 * stay consistent; ai.js will migrate to call generateJson() here.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./_logger.js";

const log = logger("api-ai");

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

// ── Embeddings ──────────────────────────────────────────────────

/**
 * Embed an array of strings in one batched OpenAI call.
 * Returns an array of vectors aligned to the input order.
 */
export async function embed(texts) {
  const inputs = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || "").slice(0, 8000));
  if (inputs.length === 0) return [];
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for embeddings.");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
  return res.data.map((d) => d.embedding);
}

// ── Chunking ────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;            // rough heuristic, good enough for slicing
const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 60;

/**
 * Split text into ~500-token chunks with ~60-token overlap, breaking on
 * paragraph/sentence boundaries where possible. Deterministic (no model call).
 */
export function chunkText(text) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const maxChars = CHUNK_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;
  if (clean.length <= maxChars) {
    return [{ content: clean, token_count: estimateTokens(clean) }];
  }

  // Prefer to cut on paragraph boundaries; fall back to hard slices.
  const paras = clean.split(/\n\s*\n/);
  const chunks = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };

  for (const para of paras) {
    if ((buf + "\n\n" + para).length > maxChars) {
      flush();
      if (para.length > maxChars) {
        // Single oversized paragraph: hard-slice with overlap.
        for (let i = 0; i < para.length; i += maxChars - overlapChars) {
          chunks.push(para.slice(i, i + maxChars).trim());
        }
      } else {
        buf = para;
      }
    } else {
      buf = buf ? `${buf}\n\n${para}` : para;
    }
  }
  flush();

  return chunks.filter(Boolean).map((content) => ({
    content,
    token_count: estimateTokens(content),
  }));
}

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / CHARS_PER_TOKEN);
}

// ── Retrieval ───────────────────────────────────────────────────

/**
 * Semantic KB retrieval, tenant-scoped. `userId` MUST come from the Bearer
 * token (see api/_auth.js) — never from the request body.
 * Returns { chunks: [{content, kind, similarity}], block: string }.
 */
export async function retrieveContext(serviceClient, userId, query, k = 8) {
  if (!query?.trim()) return { chunks: [], block: "" };
  const [queryEmbedding] = await embed([query]);
  const { data, error } = await serviceClient.rpc("match_kb_chunks", {
    query_embedding: queryEmbedding,
    match_user: userId,
    match_count: k,
  });
  if (error) {
    log.warn("match_kb_chunks failed", { error: error.message });
    return { chunks: [], block: "" };
  }
  const chunks = data || [];
  return { chunks, block: formatKbBlock(chunks) };
}

function formatKbBlock(chunks) {
  if (!chunks.length) return "";
  return chunks
    .map((c, i) => `[${i + 1}] (${c.kind}) ${c.content}`)
    .join("\n\n");
}

// ── Voice ───────────────────────────────────────────────────────

/**
 * Compact "write like this" block from the structured voice_profile row.
 * In M5 this is where a cached Honcho hint is appended — never a hot-path call.
 */
export async function voiceBrief(serviceClient, userId) {
  const { data: vp } = await serviceClient
    .from("voice_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!vp) return "";
  return formatVoiceBlock(vp);
}

export function formatVoiceBlock(vp) {
  if (!vp) return "";
  const lines = [];
  if (vp.summary) lines.push(`Voice: ${vp.summary}`);
  if (vp.tone_descriptors?.length) lines.push(`Tone: ${vp.tone_descriptors.join(", ")}`);
  if (vp.do_rules?.length) lines.push(`Do:\n${vp.do_rules.map((r) => `- ${r}`).join("\n")}`);
  if (vp.dont_rules?.length) lines.push(`Don't:\n${vp.dont_rules.map((r) => `- ${r}`).join("\n")}`);
  if (vp.signature_moves?.length) lines.push(`Signature moves:\n${vp.signature_moves.map((r) => `- ${r}`).join("\n")}`);
  return lines.join("\n");
}

/**
 * The one call every generator uses: assembles grounding facts + voice.
 * Returns { kbBlock, voiceBlock, chunks }.
 */
export async function buildContext(serviceClient, { userId, query, k = 8 }) {
  // Resolve independently so a failure in one (e.g. embeddings unavailable on an
  // Anthropic-only setup) never wipes out the other (voice needs no embeddings).
  const [retrieval, voiceBlock] = await Promise.all([
    retrieveContext(serviceClient, userId, query, k).catch((e) => {
      log.warn("retrieveContext failed", { error: e.message });
      return { chunks: [], block: "" };
    }),
    voiceBrief(serviceClient, userId).catch((e) => {
      log.warn("voiceBrief failed", { error: e.message });
      return "";
    }),
  ]);
  return { kbBlock: retrieval.block, voiceBlock, chunks: retrieval.chunks };
}

// ── Generation (OpenAI-primary / Anthropic-fallback) ────────────

/**
 * Run a prompt and parse a JSON object out of the result.
 * Mirrors api/ideas/[id]/ai.js provider selection so behavior is consistent.
 */
export async function generateJson(prompt, { maxTokens = 1200 } = {}) {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("AI is not configured on the server.");
  }
  const text = process.env.OPENAI_API_KEY
    ? await generateWithOpenAI(prompt)
    : await generateWithAnthropic(prompt, maxTokens);
  return parseJson(text);
}

async function generateWithOpenAI(prompt) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({ model: "gpt-4.1-mini", input: prompt });
  return response.output_text || "";
}

async function generateWithAnthropic(prompt, maxTokens) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content?.[0]?.text || "";
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON returned");
    return JSON.parse(match[0]);
  }
}
