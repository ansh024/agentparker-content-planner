/**
 * Learning event emitter — the durable spine the M5 learning layer builds on
 * (docs/plans/scaling-hub/04-learning-honcho.md).
 *
 * Forward-compatible by design: M2 already emits edit-diff events, but the
 * learning_events table doesn't land until M5. Until then this is a safe no-op
 * (a missing-table error is swallowed). When the M5 migration runs, events
 * start persisting with zero caller changes.
 *
 * This is ALWAYS best-effort and off the user's critical path — callers should
 * fire-and-forget and never await it in a way that can fail their request.
 * Honcho is never touched here; that's the M5 nightly job downstream of these
 * rows.
 */

import { logger } from "./_logger.js";

const log = logger("learn");

// "Table doesn't exist yet" can surface as a Postgres SQLSTATE (42P01) or a
// PostgREST schema-cache code (PGRST205), depending on the path. Treat any of
// these as a clean no-op until the M5 migration lands.
function isMissingTable(error) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = `${error.message || ""}`.toLowerCase();
  return msg.includes("learning_events") && (msg.includes("does not exist") || msg.includes("could not find"));
}

export async function emitLearningEvent(serviceClient, e) {
  const row = {
    user_id: e.userId,
    kind: e.kind,
    surface: e.surface || null,
    platform: e.platform || null,
    ref_type: e.refType || null,
    ref_id: e.refId || null,
    generated_text: e.generatedText ?? null,
    final_text: e.finalText ?? null,
    signal: e.signal || null,
  };

  const { error } = await serviceClient.from("learning_events").insert(row);
  if (error) {
    if (isMissingTable(error)) {
      log.debug("learning_events not present yet (pre-M5) — skipping");
      return { stored: false };
    }
    throw error;
  }
  return { stored: true };
}
