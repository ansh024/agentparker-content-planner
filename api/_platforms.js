/**
 * Platform playbooks — declarative config so adding a platform is a config
 * entry, not a rebuild (docs/plans/scaling-hub/02-repurposing-engine.md).
 *
 * M2 ships LinkedIn ONLY (`enabled: true`). YouTube stays here as the next
 * fast-follow reference but is gated off until the LinkedIn loop proves out.
 * Each playbook defines: how to write for the platform (guidance), the JSON
 * fields the model must return (schemaHint), and how to assemble the editable
 * body from those fields (assembleBody) for one-click copy.
 */

export const PLATFORMS = {
  linkedin: {
    label: "LinkedIn",
    enabled: true,
    formats: ["post"],
    guidance: `Write a LinkedIn post. Professional but human — never corporate.
- The feed truncates around 210 characters: the first line must earn the "see more". No "I'm excited to announce".
- Short paragraphs, generous line breaks, one idea per line.
- A concrete story, number, or result beats abstraction.
- End with a reflective question or soft CTA — NOT "Agree? 👇 follow me" engagement-bait.
- At most ~3 tasteful hashtags, or none.`,
    schemaHint: `- hook: the scroll-stopping first line (under 210 chars)
- body: the post body (the story/insight), with line breaks as \\n
- takeaway: the one-line lesson or reflection
- soft_cta: a genuine question or low-key call to action
- hashtags: array of 0-3 hashtags (without the # symbol)`,
    assembleBody(s = {}) {
      const tags = (s.hashtags || []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
      return [s.hook, s.body, s.takeaway, s.soft_cta, tags]
        .map((x) => (x || "").trim())
        .filter(Boolean)
        .join("\n\n");
    },
  },

  // ── Fast-follows (disabled for M2) ────────────────────────────
  youtube: {
    label: "YouTube",
    enabled: false,
    formats: ["long_form", "short"],
    guidance: `Plan a video, not a paragraph. Title must be curiosity- or benefit-driven.
Script = hook (first 15s earns the watch), then beats with retention turns.
Provide a description with keywords and timestamps/chapters.`,
    schemaHint: `- title_options: array of 3 title options
- hook: first 15 seconds
- script_beats: array of ordered beats
- description: with keywords
- chapters: array of {time, label}
- tags: array of keyword tags`,
    assembleBody(s = {}) {
      const titles = (s.title_options || []).map((t, i) => `${i + 1}. ${t}`).join("\n");
      const beats = (s.script_beats || []).map((b) => `- ${b}`).join("\n");
      const chapters = (s.chapters || []).map((c) => `${c.time || ""} ${c.label || ""}`.trim()).join("\n");
      return [
        titles && `TITLE OPTIONS\n${titles}`,
        s.hook && `HOOK\n${s.hook}`,
        beats && `SCRIPT BEATS\n${beats}`,
        s.description && `DESCRIPTION\n${s.description}`,
        chapters && `CHAPTERS\n${chapters}`,
      ].filter(Boolean).join("\n\n");
    },
  },
};

export function getPlaybook(platform) {
  return PLATFORMS[platform] || null;
}

export function enabledPlatforms() {
  return Object.entries(PLATFORMS)
    .filter(([, p]) => p.enabled)
    .map(([key, p]) => ({ key, label: p.label, formats: p.formats }));
}
