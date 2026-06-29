const KEYS = { token: "cp_token", apiBase: "cp_api_base" };
const $ = (id) => document.getElementById(id);

function setStatus(msg, ok) {
  const el = $("status");
  el.textContent = msg;
  el.className = `status ${ok ? "ok" : "err"}`;
}

async function load() {
  const v = await chrome.storage.local.get([KEYS.token, KEYS.apiBase]);
  if (v[KEYS.apiBase]) $("apiBase").value = v[KEYS.apiBase];
  if (v[KEYS.token]) {
    $("token").placeholder = "•••••• (connected)";
    setStatus("Connected.", true);
  }
}

$("save").addEventListener("click", async () => {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  if (!apiBase) return setStatus("Enter your ContentPlanner URL.", false);
  const patch = { [KEYS.apiBase]: apiBase };
  if (token) patch[KEYS.token] = token;
  await chrome.storage.local.set(patch);

  const resp = await chrome.runtime.sendMessage({ type: "getStatus" });
  if (resp?.connected) setStatus("Connected.", true);
  else setStatus("Saved URL — paste a token to finish connecting.", false);
});

$("capture").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return setStatus("No active tab.", false);
  setStatus("Saving…", true);
  const resp = await chrome.runtime.sendMessage({
    type: "capture",
    payload: { url: tab.url, title: tab.title || "" },
  });
  if (resp?.ok) setStatus("Saved to your Inbox.", true);
  else setStatus(resp?.error || "Could not save.", false);
});

load();
