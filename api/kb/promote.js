import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { ingestDocument, KB_KINDS } from "../_kb.js";
import { logger } from "../_logger.js";

const log = logger("kb-promote");

// Embedding the promoted document can exceed the default ~10s limit.
export const config = { maxDuration: 60 };

// Promote a captured idea into a KB document (one capture path, two uses).
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
  const ideaId = body.idea_id;
  const kind = String(body.kind || "").toLowerCase();
  if (!ideaId) return res.json({ error: "idea_id is required." }, 400);
  if (!KB_KINDS.has(kind)) return res.json({ error: "Unsupported KB kind." }, 400);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: idea } = await supabase
    .from("ideas")
    .select("*")
    .eq("id", ideaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!idea) return res.json({ error: "Idea not found." }, 404);

  const docBody = [idea.title, idea.context_text, idea.ai_summary]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!docBody) return res.json({ error: "This idea has no text to promote yet." }, 400);

  try {
    const document = await ingestDocument(supabase, userId, {
      kind,
      title: idea.title,
      body: docBody,
      source_url: idea.source_url,
      source_idea_id: idea.id,
      platform: idea.source_platform,
      tags: idea.tags,
      metadata: { promoted_from_idea: idea.id },
    });
    return res.json({ document }, 201);
  } catch (err) {
    log.error("KB promote failed", { ideaId, error: err.message });
    return res.json({ error: "Could not promote this idea." }, 500);
  }
}
