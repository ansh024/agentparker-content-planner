/**
 * Auth helper — the single source of the authenticated user id.
 *
 * Every handler derives the user from the Bearer token here. Downstream code
 * (KB ingest, match_kb_chunks, voice) must use the returned `user.id` and never
 * trust a user id from the request body (Eng review critical #2 — prevents
 * cross-tenant reads through the service-role client).
 *
 * Usage:
 *   import { requireUser } from '../_auth.js';
 *   const auth = await requireUser(req);
 *   if (!auth.ok) return res.json({ error: auth.error }, auth.status);
 *   const userId = auth.user.id;
 */

import { createClient } from "@supabase/supabase-js";

export async function requireUser(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Please log in to continue." };
  }

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await anonClient.auth.getUser(token);
  if (!user) return { ok: false, status: 401, error: "Session expired." };

  return { ok: true, user };
}
