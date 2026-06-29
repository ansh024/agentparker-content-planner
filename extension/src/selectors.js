/**
 * LinkedIn DOM selectors — kept in ONE place because LinkedIn changes its
 * markup often (plan risk note). If comment-injection breaks, update here.
 * Each entry is a list tried in order so we can add fallbacks without code edits.
 */
window.CP_SELECTORS = {
  // A feed post container.
  post: [
    "div.feed-shared-update-v2",
    "div.fie-impression-container",
    "[data-urn^='urn:li:activity']",
  ],
  // The post's text body within a post container.
  postText: [
    ".update-components-text",
    ".feed-shared-update-v2__description",
    ".update-components-update-v2__commentary",
  ],
  // The post author's name.
  authorName: [
    ".update-components-actor__title span[aria-hidden='true']",
    ".update-components-actor__name span[aria-hidden='true']",
    ".update-components-actor__title",
  ],
  // The author's headline/subtitle.
  authorHeadline: [
    ".update-components-actor__description",
  ],
  // The social action bar where we add our button.
  actionBar: [
    ".feed-shared-social-action-bar",
    ".social-actions-button",
    ".feed-shared-social-actions",
  ],
};

window.CP_pick = function pick(root, names) {
  for (const sel of names) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
};

window.CP_text = function text(root, names) {
  const el = window.CP_pick(root, names);
  return el ? el.innerText.trim() : "";
};
