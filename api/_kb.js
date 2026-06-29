/**
 * KB ingest helpers — chunk a document, embed the chunks, persist both.
 * Shared by POST /api/kb, /api/kb/promote, and PATCH (re-embed on body change).
 *
 * All writes go through the service-role client but are scoped to the
 * token-derived userId (see api/_auth.js) — kb_chunks.user_id is always the
 * owner so match_kb_chunks stays tenant-safe.
 */

import { chunkText, embed } from "./_ai.js";
import { logger } from "./_logger.js";

const log = logger("api-kb");

/**
 * Insert a kb_documents row, then chunk+embed its body into kb_chunks.
 * Returns the created document. Embedding happens in one batched call.
 */
export async function ingestDocument(serviceClient, userId, doc) {
  const { data: document, error } = await serviceClient
    .from("kb_documents")
    .insert({
      user_id: userId,
      kind: doc.kind,
      title: doc.title || null,
      body: doc.body,
      source_url: doc.source_url || null,
      source_idea_id: doc.source_idea_id || null,
      platform: doc.platform || null,
      tags: doc.tags || null,
      metadata: doc.metadata || null,
    })
    .select()
    .single();

  if (error || !document) throw error || new Error("Failed to create KB document");

  await embedDocumentChunks(serviceClient, userId, document.id, doc.body);
  return document;
}

/**
 * (Re)build the chunks for a document: delete existing, chunk, embed, insert.
 * Used on create and on body edits (stale-embedding fix from the plan).
 */
export async function embedDocumentChunks(serviceClient, userId, documentId, body) {
  const chunks = chunkText(body);
  if (!chunks.length) return;

  // Replace any existing chunks (PATCH re-embed path).
  await serviceClient.from("kb_chunks").delete().eq("document_id", documentId);

  const vectors = await embed(chunks.map((c) => c.content));
  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    user_id: userId,
    content: c.content,
    embedding: vectors[i],
    token_count: c.token_count,
  }));

  const { error } = await serviceClient.from("kb_chunks").insert(rows);
  if (error) {
    log.error("Failed to insert kb_chunks", { documentId, error: error.message });
    throw error;
  }
  log.info("Embedded document", { documentId, chunks: rows.length });
}

export const KB_KINDS = new Set([
  "expertise", "belief", "framework", "story", "swipe", "reference", "past_post",
]);
