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
