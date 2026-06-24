// Shared helpers for the Listening feature — citation parsing, CSV parsing, and
// the "save to inbox" action factories. Extracted from TopicsPage so the list
// and detail pages reuse identical payloads. Each action takes the runtime
// dependencies ({ supabase, user, showToast }) so it stays framework-agnostic.

export function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function firstCitation(source) {
  const citations =
    source?.evidence ||
    source?.source_citations ||
    source?.metadata?.source_urls ||
    [];
  return Array.isArray(citations)
    ? citations.find((item) => item?.url || typeof item === "string")
    : null;
}

export function citationUrl(citation) {
  if (!citation) return "";
  return typeof citation === "string" ? citation : citation.url;
}

export async function captureAsIdea({ supabase, user, showToast, hit }) {
  const { error } = await supabase.from("ideas").insert({
    user_id: user.id,
    source_url: hit.source_url,
    source_platform: hit.platform || "listening",
    context_text: hit.snippet || hit.title || "",
    title: hit.title || "Listening idea",
    status: "new",
    metadata: { listening_hit_id: hit.id, run_id: hit.run_id, cluster_id: hit.cluster_id },
  });
  if (error) showToast("Couldn't save as idea.", "error");
  else showToast("Idea saved from listening.", "success");
}

export async function saveClusterIdea({ supabase, user, showToast, topic, cluster, angle = null }) {
  const citation = firstCitation(angle || cluster);
  const { error } = await supabase.from("ideas").insert({
    user_id: user.id,
    source_url: citationUrl(citation) || `last30days://cluster/${cluster.id}`,
    source_platform: "listening",
    context_text: angle?.angle || cluster.summary || cluster.title,
    title: angle?.title || cluster.title,
    status: "new",
    metadata: {
      topic_id: topic.id,
      cluster_id: cluster.id,
      run_id: cluster.run_id,
      evidence: angle?.evidence || [],
    },
  });
  if (error) showToast("Couldn't save idea.", "error");
  else showToast("Idea saved to inbox.", "success");
}

export async function createScriptOutline({ supabase, user, showToast, topic, angle, brief }) {
  const { error } = await supabase.from("ideas").insert({
    user_id: user.id,
    source_url:
      citationUrl(firstCitation(angle)) ||
      `last30days://brief/${brief?.id || topic.id}`,
    source_platform: "listening",
    title: `Script: ${angle.title}`,
    context_text: `${angle.angle}\n\nHook: ${angle.title}\nWhy: ${angle.why || ""}`,
    status: "new",
    metadata: { topic_id: topic.id, type: "script_outline", evidence: angle.evidence || [] },
  });
  if (error) showToast("Couldn't create script outline.", "error");
  else showToast("Script outline saved to inbox.", "success");
}

export async function markClusterIrrelevant({ supabase, showToast, cluster, onHidden }) {
  const metadata = { ...(cluster.metadata || {}), dismissed: true };
  const { error } = await supabase
    .from("listening_clusters")
    .update({ metadata })
    .eq("id", cluster.id);
  if (error) {
    showToast("Couldn't mark cluster irrelevant.", "error");
  } else {
    onHidden?.(cluster);
    showToast("Cluster hidden.", "success");
  }
}

// Queue a research run for a topic via the worker API. Returns the parsed
// result; the caller handles toasts/refetch so it can update its own UI state.
export async function queueResearchRun({ supabase, topicId, deep = false }) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Please log in to continue.");
  const res = await fetch("/api/listening/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ topicId, deep }),
  });
  const result = await res.json();
  return { ok: res.ok && result.ok, result };
}
