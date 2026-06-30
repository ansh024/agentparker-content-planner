import { supabase } from "./supabase";
import { generateOne } from "./drafts";

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

export async function getToday() {
  return authedFetch("/api/ops/today");
}

export async function setTargets(posts, comments) {
  const { targets } = await authedFetch("/api/ops/targets", {
    method: "POST",
    body: JSON.stringify({ posts, comments }),
  });
  return targets;
}

/**
 * Batch repurpose: create draft rows for every idea×platform, then fan out
 * generate-one per draft from the client (same pattern as single repurpose).
 * onDraft streams each finished/failed draft back.
 */
export async function batchRepurpose(ideaIds, platforms, onDraft) {
  const { drafts } = await authedFetch("/api/repurpose/batch", {
    method: "POST",
    body: JSON.stringify({ idea_ids: ideaIds, platforms }),
  });
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
  return drafts.length;
}

export async function fillMyWeek(days = 5) {
  return authedFetch("/api/plan/week", {
    method: "POST",
    body: JSON.stringify({ days }),
  });
}
