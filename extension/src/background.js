/**
 * Service worker — the ONLY place the access token lives (Eng critical #3).
 *
 * Content scripts and the page never see the token; they message the worker,
 * which attaches the Bearer header and talks to the ContentPlanner API. The
 * API pins CORS to this extension's origin (chrome-extension://<id>).
 */

const KEYS = { token: "cp_token", apiBase: "cp_api_base" };

async function getConfig() {
  const v = await chrome.storage.local.get([KEYS.token, KEYS.apiBase]);
  return { token: v[KEYS.token] || "", apiBase: (v[KEYS.apiBase] || "").replace(/\/$/, "") };
}

async function apiPost(path, payload) {
  const { token, apiBase } = await getConfig();
  if (!apiBase) throw new Error("Set your ContentPlanner URL in the extension popup.");
  if (!token) throw new Error("Connect your account in the extension popup.");

  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Session expired — reconnect in the popup.");
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "generateComment") {
        const data = await apiPost("/api/extension/comment", msg.payload);
        sendResponse({ ok: true, data });
      } else if (msg.type === "capture") {
        const data = await apiPost("/api/extension/capture", msg.payload);
        sendResponse({ ok: true, data });
      } else if (msg.type === "getStatus") {
        const { token, apiBase } = await getConfig();
        sendResponse({ ok: true, connected: Boolean(token && apiBase), apiBase });
      } else {
        sendResponse({ ok: false, error: "Unknown message." });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep the message channel open for the async response
});
