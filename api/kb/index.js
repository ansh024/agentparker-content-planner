import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { ingestDocument, KB_KINDS } from "../_kb.js";
import { logger } from "../_logger.js";

const log = logger("kb-index");

// Embedding on create can exceed the default ~10s for large documents.
export const config = { maxDuration: 60 };

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const kind = url.searchParams.get("kind");
    let query = supabase
      .from("kb_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (kind && KB_KINDS.has(kind)) query = query.eq("kind", kind);

    const { data, error } = await query;
    if (error) return res.json({ error: "Could not load your knowledgebase." }, 500);
    return res.json({ documents: data });
  }

  if (req.method === "POST") {
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ error: "Embeddings are not configured on the server." }, 500);
    }
    const body = await req.json();
    const kind = String(body.kind || "").toLowerCase();
    if (!KB_KINDS.has(kind)) return res.json({ error: "Unsupported KB kind." }, 400);
    if (!body.body?.trim()) return res.json({ error: "Document body is required." }, 400);
    if (String(body.body).length > 50000) {
      return res.json({ error: "Document is too long (max ~50k characters)." }, 400);
    }

    try {
      const document = await ingestDocument(supabase, userId, {
        kind,
        title: body.title,
        body: body.body,
        source_url: body.source_url,
        platform: body.platform,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
      });
      return res.json({ document }, 201);
    } catch (err) {
      log.error("KB create failed", { error: err.message });
      return res.json({ error: "Could not save this document." }, 500);
    }
  }

  return res.json({ error: "Method not allowed" }, 405);
}
