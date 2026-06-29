import { supabase } from "./supabase";

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

// Platforms available for repurposing in M2 (LinkedIn only; more are fast-follows).
export const REPURPOSE_PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
];

export function platformLabel(value) {
  return REPURPOSE_PLATFORMS.find((p) => p.value === value)?.label || value;
}

export async function listDrafts(filters = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v)
  ).toString();
  const { drafts } = await authedFetch(`/api/drafts${qs ? `?${qs}` : ""}`);
  return drafts;
}

/**
 * Repurpose an idea: create one draft row per platform, then fan out a
 * generate-one call per draft from the CLIENT (Eng review critical #1 — the
 * server never generates async after responding). `onDraft` is called with each
 * finished/failed draft as it completes so the UI can stream results in.
 */
export async function repurposeIdea(ideaId, platforms, onDraft) {
  const { drafts } = await authedFetch(`/api/ideas/${ideaId}/repurpose`, {
    method: "POST",
    body: JSON.stringify({ platforms }),
  });

  // Surface the placeholder rows immediately, then generate them in parallel.
  drafts.forEach((d) => onDraft?.(d));

  await Promise.all(
    drafts.map(async (d) => {
      try {
        const { draft } = await generateOne(d.id);
        onDraft?.(draft);
      } catch (err) {
        onDraft?.({ ...d, status: "failed", _error: err.message });
      }
    })
  );

  return drafts.map((d) => d.id);
}

export async function generateOne(draftId) {
  return authedFetch(`/api/drafts/${draftId}/generate-one`, { method: "POST" });
}

export async function updateDraft(id, patch) {
  const { draft } = await authedFetch(`/api/drafts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return draft;
}

export async function deleteDraft(id) {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(`/api/drafts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not delete.");
  }
}

export async function scheduleDraft(id, date) {
  const { plan } = await authedFetch(`/api/drafts/${id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ date }),
  });
  return plan;
}
