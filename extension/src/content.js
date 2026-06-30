/**
 * Content script — injects a "✦ Comment" button onto LinkedIn posts. On click
 * it scrapes the post text + author (via selectors.js), asks the service worker
 * to generate on-voice comment options, and shows them with one-click copy.
 *
 * No token, no API base here — all network access goes through the worker.
 * Draft-only: we copy to the clipboard; the user pastes & posts themselves.
 */

const BTN_FLAG = "cp-injected";

function injectButtons() {
  for (const sel of window.CP_SELECTORS.post) {
    document.querySelectorAll(sel).forEach((post) => {
      if (post.dataset[BTN_FLAG]) return;
      const bar = window.CP_pick(post, window.CP_SELECTORS.actionBar);
      if (!bar) return;
      post.dataset[BTN_FLAG] = "1";

      const btn = document.createElement("button");
      btn.className = "cp-comment-btn";
      btn.type = "button";
      btn.textContent = "✦ Comment";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleClick(post, btn);
      });
      bar.appendChild(btn);
    });
  }
}

async function handleClick(post, btn) {
  const postText = window.CP_text(post, window.CP_SELECTORS.postText);
  if (!postText) {
    flash(btn, "No post text found");
    return;
  }
  const payload = {
    postText,
    authorName: window.CP_text(post, window.CP_SELECTORS.authorName),
    authorHeadline: window.CP_text(post, window.CP_SELECTORS.authorHeadline),
  };

  btn.disabled = true;
  btn.textContent = "✦ Thinking…";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "generateComment", payload });
    if (!resp?.ok) throw new Error(resp?.error || "Failed.");
    showPanel(post, resp.data.comments || []);
  } catch (err) {
    flash(btn, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Comment";
  }
}

function showPanel(post, comments) {
  post.querySelector(".cp-panel")?.remove();
  const panel = document.createElement("div");
  panel.className = "cp-panel";

  if (comments.length === 0) {
    panel.innerHTML = `<p class="cp-empty">No comment generated.</p>`;
  } else {
    comments.forEach((c) => {
      const row = document.createElement("div");
      row.className = "cp-option";
      const p = document.createElement("p");
      p.textContent = c;
      const copy = document.createElement("button");
      copy.className = "cp-copy";
      copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(c);
        copy.textContent = "Copied!";
        setTimeout(() => (copy.textContent = "Copy"), 1500);
      });
      row.append(p, copy);
      panel.appendChild(row);
    });
  }

  const close = document.createElement("button");
  close.className = "cp-close";
  close.textContent = "✕";
  close.addEventListener("click", () => panel.remove());
  panel.appendChild(close);

  post.appendChild(panel);
}

function flash(btn, msg) {
  const original = btn.textContent;
  btn.textContent = msg.slice(0, 40);
  setTimeout(() => (btn.textContent = original), 2500);
}

// LinkedIn is a SPA with infinite scroll — re-scan as new posts mount.
const observer = new MutationObserver(() => injectButtons());
observer.observe(document.body, { childList: true, subtree: true });
injectButtons();

/* ---------------------------------------------------------------------------
 * Pick mode — the side panel's "Find a post" button puts the feed into a
 * hover-to-highlight, click-to-capture state. Clicking a post scrapes its
 * text + author and ships it back to the panel (no network here).
 * ------------------------------------------------------------------------- */

let pickActive = false;
let pickHover = null;

function postUnder(target) {
  for (const sel of window.CP_SELECTORS.post) {
    const el = target.closest(sel);
    if (el) return el;
  }
  return null;
}

function onPickMove(e) {
  const post = postUnder(e.target);
  if (post === pickHover) return;
  pickHover?.classList.remove("cp-pick-hover");
  pickHover = post;
  pickHover?.classList.add("cp-pick-hover");
}

function onPickClick(e) {
  const post = postUnder(e.target);
  if (!post) return;
  e.preventDefault();
  e.stopPropagation();

  const payload = {
    postText: window.CP_text(post, window.CP_SELECTORS.postText),
    authorName: window.CP_text(post, window.CP_SELECTORS.authorName),
    authorHeadline: window.CP_text(post, window.CP_SELECTORS.authorHeadline),
  };
  exitPickMode();
  chrome.runtime.sendMessage({
    type: "postPicked",
    payload,
    ok: Boolean(payload.postText),
  });
}

function enterPickMode() {
  if (pickActive) return;
  pickActive = true;
  document.body.classList.add("cp-picking");
  if (!document.querySelector(".cp-pick-banner")) {
    const banner = document.createElement("div");
    banner.className = "cp-pick-banner";
    banner.textContent = "Click a post to draft a comment · Esc to cancel";
    document.body.appendChild(banner);
  }
  document.addEventListener("mousemove", onPickMove, true);
  document.addEventListener("click", onPickClick, true);
  document.addEventListener("keydown", onPickKey, true);
}

function exitPickMode() {
  pickActive = false;
  document.body.classList.remove("cp-picking");
  pickHover?.classList.remove("cp-pick-hover");
  pickHover = null;
  document.querySelector(".cp-pick-banner")?.remove();
  document.removeEventListener("mousemove", onPickMove, true);
  document.removeEventListener("click", onPickClick, true);
  document.removeEventListener("keydown", onPickKey, true);
}

function onPickKey(e) {
  if (e.key === "Escape") {
    exitPickMode();
    chrome.runtime.sendMessage({ type: "postPickCancelled" });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "enterPickMode") {
    enterPickMode();
    sendResponse({ ok: true });
  } else if (msg?.type === "exitPickMode") {
    exitPickMode();
    sendResponse({ ok: true });
  }
  return true;
});
