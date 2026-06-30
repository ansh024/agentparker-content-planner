const KEYS = { token: "cp_token", apiBase: "cp_api_base" };
const $ = (id) => document.getElementById(id);

function setStatus(id, msg, ok) {
  const el = $(id);
  el.textContent = msg || "";
  el.className = `status ${msg ? (ok ? "ok" : "err") : ""}`;
}

function setConn(connected) {
  const el = $("conn");
  el.textContent = connected ? "Connected" : "Not connected";
  el.className = `pill ${connected ? "ok" : ""}`;
}

async function refreshStatus() {
  const resp = await chrome.runtime.sendMessage({ type: "getStatus" });
  setConn(Boolean(resp?.connected));
  // Auto-expand settings when not connected so it's the first thing seen.
  if (!resp?.connected) $("settings").open = true;
  return resp;
}

async function load() {
  const v = await chrome.storage.local.get([KEYS.token, KEYS.apiBase]);
  if (v[KEYS.apiBase]) $("apiBase").value = v[KEYS.apiBase];
  if (v[KEYS.token]) $("token").placeholder = "•••••• (connected)";
  await refreshStatus();
}

// --- Connect ---
$("save").addEventListener("click", async () => {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  if (!apiBase) return setStatus("saveStatus", "Enter your ContentPlanner URL.", false);
  const patch = { [KEYS.apiBase]: apiBase };
  if (token) patch[KEYS.token] = token;
  await chrome.storage.local.set(patch);

  const resp = await refreshStatus();
  if (resp?.connected) {
    setStatus("saveStatus", "Connected.", true);
    $("token").value = "";
    $("token").placeholder = "•••••• (connected)";
  } else {
    setStatus("saveStatus", "Saved URL — paste a token to finish connecting.", false);
  }
});

// --- Quick capture ---
$("capture").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return setStatus("capStatus", "No active tab.", false);
  setStatus("capStatus", "Saving…", true);
  const resp = await chrome.runtime.sendMessage({
    type: "capture",
    payload: { url: tab.url, title: tab.title || "" },
  });
  if (resp?.ok) setStatus("capStatus", "Saved to your Inbox.", true);
  else setStatus("capStatus", resp?.error || "Could not save.", false);
});

// --- Find a post on the page (pick mode in the content script) ---
$("find").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/www\.linkedin\.com\//.test(tab.url || "")) {
    return setStatus("findStatus", "Open a LinkedIn feed tab first.", false);
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "enterPickMode" });
    setStatus("findStatus", "Click the post you want on the page…", true);
  } catch {
    setStatus("findStatus", "Reload the LinkedIn tab, then try again.", false);
  }
});

// Content script reports the picked post back to the panel.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "postPicked") {
    if (!msg.ok) {
      setStatus("findStatus", "Couldn't read that post — try another.", false);
      return;
    }
    $("postText").value = msg.payload.postText || "";
    $("authorName").value = msg.payload.authorName || "";
    $("authorHeadline").value = msg.payload.authorHeadline || "";
    setStatus("findStatus", "Post captured — review and generate.", true);
  } else if (msg?.type === "postPickCancelled") {
    setStatus("findStatus", "", true);
  }
});

// --- Generate comments ---
$("generate").addEventListener("click", async () => {
  const postText = $("postText").value.trim();
  if (!postText) return setStatus("genStatus", "Paste a post first.", false);

  const btn = $("generate");
  btn.disabled = true;
  btn.textContent = "Thinking…";
  setStatus("genStatus", "", true);
  $("options").innerHTML = "";
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "generateComment",
      payload: {
        postText,
        authorName: $("authorName").value.trim(),
        authorHeadline: $("authorHeadline").value.trim(),
      },
    });
    if (!resp?.ok) throw new Error(resp?.error || "Failed.");
    renderOptions(resp.data.comments || []);
  } catch (err) {
    setStatus("genStatus", err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate comments";
  }
});

function renderOptions(comments) {
  const wrap = $("options");
  wrap.innerHTML = "";
  if (comments.length === 0) {
    setStatus("genStatus", "No comment generated.", false);
    return;
  }
  for (const c of comments) {
    const row = document.createElement("div");
    row.className = "option";
    const p = document.createElement("p");
    p.textContent = c;
    const copy = document.createElement("button");
    copy.className = "secondary";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(c);
      copy.textContent = "Copied!";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    });
    row.append(p, copy);
    wrap.appendChild(row);
  }
}

load();
