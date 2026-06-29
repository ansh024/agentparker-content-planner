import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { retrieveContext } from "../_ai.js";

// Semantic KB search. Internal helper for M2/M3 + a KB search UI.
// userId is always the token-derived id — match_user is never client-supplied.
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ error: "Embeddings are not configured on the server." }, 500);
  }

  const body = await req.json();
  const query = String(body.query || "").trim();
  if (!query) return res.json({ error: "A search query is required." }, 400);
  const k = Math.min(Math.max(parseInt(body.k, 10) || 8, 1), 20);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { chunks } = await retrieveContext(supabase, userId, query, k);
  return res.json({ results: chunks });
}
