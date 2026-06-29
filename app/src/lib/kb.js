import { supabase } from "./supabase";

/** Authed fetch against our serverless API (Bearer token from the session). */
async function authedFetch(path, options = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// ── Knowledgebase document kinds ────────────────────────────────
export const KB_KINDS = [
  { value: "expertise", label: "Expertise", hint: "Topics you can speak on with authority" },
  { value: "belief", label: "Belief / Take", hint: "Strong opinions and contrarian views" },
  { value: "framework", label: "Framework", hint: "Mental models, methods, your IP" },
  { value: "story", label: "Story", hint: "Anecdotes, case studies, results, numbers" },
  { value: "swipe", label: "Swipe", hint: "Posts/hooks/formats you admire" },
  { value: "reference", label: "Reference", hint: "Source material, research, links" },
  { value: "past_post", label: "Past post", hint: "Your own published content" },
];

export function kindLabel(value) {
  return KB_KINDS.find((k) => k.value === value)?.label || value;
}

// ── KB API ──────────────────────────────────────────────────────
export async function listKbDocuments(kind) {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const { documents } = await authedFetch(`/api/kb${q}`);
  return documents;
}

export async function createKbDocument(doc) {
  const { document } = await authedFetch("/api/kb", {
    method: "POST",
    body: JSON.stringify(doc),
  });
  return document;
}

export async function updateKbDocument(id, patch) {
  const { document } = await authedFetch(`/api/kb/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return document;
}

export async function deleteKbDocument(id) {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(`/api/kb/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not delete.");
  }
}

export async function promoteIdea(ideaId, kind) {
  const { document } = await authedFetch("/api/kb/promote", {
    method: "POST",
    body: JSON.stringify({ idea_id: ideaId, kind }),
  });
  return document;
}

export async function searchKb(query, k = 8) {
  const { results } = await authedFetch("/api/kb/search", {
    method: "POST",
    body: JSON.stringify({ query, k }),
  });
  return results;
}

// ── Voice API ───────────────────────────────────────────────────
export async function getVoiceProfile() {
  const { profile } = await authedFetch("/api/voice");
  return profile;
}

export async function updateVoiceProfile(patch) {
  const { profile } = await authedFetch("/api/voice", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return profile;
}

export async function bootstrapVoice(payload) {
  return authedFetch("/api/voice/bootstrap", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
