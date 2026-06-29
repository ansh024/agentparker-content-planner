import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { generateJson } from "../_ai.js";
import { ingestDocument } from "../_kb.js";
import { logger } from "../_logger.js";

const log = logger("voice-bootstrap");

// Distill (1 LLM call) + embed up to 15 samples — allow headroom over the
// default ~10s function limit (Eng review: bulk embed can exceed it).
export const config = { maxDuration: 60 };

// POST /api/voice/bootstrap
// Body: { samples: [string], known_for?, defendable_take?, never_say?, platform? }
// Mandatory M1 onboarding: distill 5-10 best posts into voice_profile and
// store each as a past_post KB document (voice ground truth + grounding corpus).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return res.json({ error: "AI is not configured on the server." }, 500);
  }

  const body = await req.json();
  const samples = (Array.isArray(body.samples) ? body.samples : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 15);
  if (samples.length === 0) {
    return res.json({ error: "Paste at least one of your posts to learn your voice." }, 400);
  }
  const platform = String(body.platform || "linkedin").toLowerCase();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1) Distill the voice profile in one LLM call.
  let distilled;
  try {
    distilled = await generateJson(buildPrompt(samples, body), { maxTokens: 1200 });
  } catch (err) {
    log.error("Voice distill failed", { error: err.message });
    return res.json({ error: "Could not analyze your voice. Try again." }, 500);
  }

  const profileRow = {
    user_id: userId,
    summary: distilled.summary || null,
    tone_descriptors: arr(distilled.tone_descriptors),
    do_rules: arr(distilled.do_rules),
    dont_rules: arr(distilled.dont_rules),
    signature_moves: arr(distilled.signature_moves),
    sample_count: samples.length,
    raw: { distilled, inputs: { known_for: body.known_for, defendable_take: body.defendable_take, never_say: body.never_say } },
    updated_at: new Date().toISOString(),
  };

  const { data: profile, error: upsertError } = await supabase
    .from("voice_profile")
    .upsert(profileRow, { onConflict: "user_id" })
    .select()
    .single();
  if (upsertError) {
    log.error("voice_profile upsert failed", { error: upsertError.message });
    return res.json({ error: "Voice analyzed, but couldn't be saved." }, 500);
  }

  // 2) Store each sample as a past_post KB document (best-effort; profile is
  //    the important artifact, so embedding failures don't fail onboarding).
  let stored = 0;
  if (process.env.OPENAI_API_KEY) {
    for (const sample of samples) {
      try {
        await ingestDocument(supabase, userId, {
          kind: "past_post",
          body: sample,
          platform,
          metadata: { source: "voice_bootstrap" },
        });
        stored += 1;
      } catch (err) {
        log.warn("Sample ingest failed", { error: err.message });
      }
    }
  }

  return res.json({ profile, samples_stored: stored }, 201);
}

function arr(v) {
  return Array.isArray(v) ? v.filter(Boolean).map(String) : null;
}

function buildPrompt(samples, body) {
  const numbered = samples.map((s, i) => `--- Sample ${i + 1} ---\n${s}`).join("\n\n");
  return `You are a writing-voice analyst. Below are ${samples.length} posts written by one creator.
Analyze how this person writes — their distinctive voice, not generic best practices.

${body.known_for ? `They're known for: ${body.known_for}\n` : ""}${body.defendable_take ? `A take they'll defend: ${body.defendable_take}\n` : ""}${body.never_say ? `Words/phrases they'd never use: ${body.never_say}\n` : ""}
${numbered}

Return JSON with:
- summary: one paragraph describing how this person writes (rhythm, structure, attitude)
- tone_descriptors: array of 4-6 single-word/short tone tags (e.g. "direct", "no-fluff")
- do_rules: array of 4-6 concrete things they DO when writing (specific to these samples)
- dont_rules: array of 3-5 things they avoid (infer from the samples + any provided)
- signature_moves: array of 2-4 recurring patterns that read as uniquely them
Base every item on evidence in the samples. Return only valid JSON.`;
}
