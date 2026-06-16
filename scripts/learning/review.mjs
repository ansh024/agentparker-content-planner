#!/usr/bin/env node

/**
 * Learning Loop — Weekly Review
 *
 * Gathers all journal entries from the past 7 days,
 * groups learnings by category, flags recurring problems,
 * and generates a weekly summary.
 *
 * Usage:
 *   npm run learn review
 *   node scripts/learning/review.mjs
 */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const JOURNAL_DIR = join(REPO_ROOT, "docs", "journal");
const DECISION_CANDIDATES_FILE = join(JOURNAL_DIR, "decision-candidates.md");
const APPLIED_DIR = join(JOURNAL_DIR, "applied");

const TAG_CATEGORIES = {
  "#tech-stack": "Technology Choices",
  "#api": "API & Integrations",
  "#ux": "User Experience",
  "#product": "Product Decisions",
  "#process": "Process & Workflow",
  "#architecture": "Architecture",
  "#bug": "Bugs Discovered",
  "#documentation": "Documentation",
  "#cost": "Cost & Pricing",
  "#user-research": "User Research",
  "#taste": "Code Preferences",
  "#uncategorized": "Uncategorized",
};

function parseEntry(content) {
  const lines = content.split("\n");
  const entry = { sections: {}, tags: [], actionItems: [], mood: null, phase: null };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("**Date:**")) {
      entry.date = line.replace("**Date:**", "").trim();
    }
    if (line.startsWith("**Session type:**")) {
      entry.type = line.replace("**Session type:**", "").trim();
    }
    if (line.startsWith("**Phase:**")) {
      entry.phase = line.replace("**Phase:**", "").trim();
    }
    if (line.startsWith("**Mood:**")) {
      entry.mood = line.replace("**Mood:**", "").trim();
    }

    // Capture action items
    if (line.trim().startsWith("[ ]")) {
      entry.actionItems.push(line.trim().replace("[ ]", "").trim());
    }

    // Capture tags
    if (line.startsWith("## Tags")) {
      const tagLine = lines[i + 2] || "";
      entry.tags = tagLine
        .split(" ")
        .filter((t) => t.startsWith("#"))
        .map((t) => t.trim());
    }
  }

  return entry;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function getSunday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

async function review() {
  console.log("\n📊  Weekly Learning Review\n");

  await mkdir(JOURNAL_DIR, { recursive: true });
  await mkdir(APPLIED_DIR, { recursive: true });

  let files;
  try {
    files = await readdir(JOURNAL_DIR);
  } catch {
    console.log("No journal directory found. Nothing to review.");
    return;
  }

  // Only process journal entries (not weekly summaries, not decision candidates)
  const entryFiles = files.filter(
    (f) =>
      f.endsWith(".md") &&
      !f.startsWith("weekly-") &&
      !f.startsWith("decision-") &&
      f !== "templates"
  );

  if (entryFiles.length === 0) {
    console.log("No journal entries found. Start capturing after each session!");
    return;
  }

  // Read all entries
  const entries = [];
  for (const file of entryFiles) {
    const content = await readFile(join(JOURNAL_DIR, file), "utf-8");
    const entry = parseEntry(content);
    entry.filename = file;
    entries.push(entry);
  }

  // Filter to last 7 days
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const weekStart = getMonday(today);
  const weekEnd = getSunday(today);

  const recentEntries = entries.filter((e) => {
    if (!e.date) return true; // include entries without dates
    const entryDate = new Date(e.date);
    return entryDate >= sevenDaysAgo;
  });

  // Group by category
  const categorized = {};
  for (const entry of recentEntries) {
    for (const tag of entry.tags) {
      const category = TAG_CATEGORIES[tag] || "Uncategorized";
      if (!categorized[category]) categorized[category] = [];
      categorized[category].push(entry);
    }
    if (entry.tags.length === 0) {
      if (!categorized["Uncategorized"]) categorized["Uncategorized"] = [];
      categorized["Uncategorized"].push(entry);
    }
  }

  // Count moods
  const moods = {};
  for (const entry of recentEntries) {
    if (entry.mood) {
      moods[entry.mood] = (moods[entry.mood] || 0) + 1;
    }
  }

  // Count phases
  const phases = {};
  for (const entry of recentEntries) {
    if (entry.phase) {
      phases[entry.phase] = (phases[entry.phase] || 0) + 1;
    }
  }

  // Find recurring insights (entries with common tags across days)
  const recurring = [];
  const tagCounts = {};
  for (const entry of recentEntries) {
    for (const tag of entry.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  for (const [tag, count] of Object.entries(tagCounts)) {
    if (count >= 2) {
      recurring.push({ tag, count });
    }
  }

  // Collect all action items
  const allActions = recentEntries
    .map((e) => e.actionItems.map((a) => ({ action: a, entry: e.filename })))
    .flat();

  // Build weekly summary
  const weeklyDate = weekEnd;
  const summary = `# Weekly Review — ${weekStart} to ${weekEnd}

**Generated:** ${new Date().toISOString().split("T")[0]}
**Entries reviewed:** ${recentEntries.length}

---

## Overview

| Metric | Count |
|---|---|
| Total entries | ${recentEntries.length} |
| This week | ${recentEntries.filter((e) => e.date >= weekStart).length} |
| Categories touched | ${Object.keys(categorized).length} |

## Mood This Week

${Object.entries(moods)
  .sort((a, b) => b[1] - a[1])
  .map(([mood, count]) => `- ${mood}: ${count} session(s)`)
  .join("\n") || "- No mood data"}

## Phase Distribution

${Object.entries(phases)
  .sort()
  .map(([phase, count]) => `- Phase ${phase}: ${count} session(s)`)
  .join("\n") || "- No phase data"}

## Learnings by Category

${Object.entries(categorized)
  .sort((a, b) => b[1].length - a[1].length)
  .map(
    ([cat, catEntries]) =>
      `### ${cat} (${catEntries.length})

${catEntries
  .map(
    (e) =>
      `- *${e.date || "unknown date"}* — ${e.filename.replace(".md", "")}`
  )
  .join("\n")}`
  )
  .join("\n\n")}

---

## Recurring Themes

${
  recurring.length
    ? recurring
        .sort((a, b) => b.count - a.count)
        .map((r) => `- **${r.tag}** appeared ${r.count} times — consider documenting or resolving`)
        .join("\n")
    : "- No recurring themes detected"
}

---

## Outstanding Action Items (${allActions.length})

${
  allActions.length
    ? allActions
        .map((a) => `- [ ] ${a.action} (from ${a.entry})`)
        .join("\n")
    : "- No outstanding action items"
}

---

## Decision Candidates

Review the above and add strong candidates to \`decision-candidates.md\`.

To generate decision candidate suggestions:
\`\`\`
npm run learn adapt
\`\`\`

---

*This review was auto-generated by the learning loop system. Review and annotate manually.*
`;

  const summaryFile = join(JOURNAL_DIR, `weekly-${weeklyDate}.md`);
  await writeFile(summaryFile, summary, "utf-8");

  // Update or create decision candidates file with suggestions
  let existingCandidates = "";
  try {
    existingCandidates = await readFile(DECISION_CANDIDATES_FILE, "utf-8");
  } catch {
    existingCandidates =
      "# Decision Candidates\n\n> These are learnings that suggest a concrete change. Review weekly.\n\n";
  }

  // Add suggestions from recurring themes
  const newCandidates = [];
  for (const { tag, count } of recurring) {
    if (count >= 3) {
      newCandidates.push(
        `### Candidate: Address recurring ${tag} issues\n\n` +
          `**Source:** Weekly review ${weeklyDate}\n` +
          `**Category:** ${TAG_CATEGORIES[tag] || "other"}\n` +
          `**Status:** proposed\n\n` +
          `**What change?**\n` +
          `Address the ${tag} issue that appeared ${count} times this week.\n\n` +
          `**Why?**\n` +
          `Recurring ${count} times in one week across multiple sessions.\n\n` +
          `**Decision:** pending\n\n---\n\n`
      );
    }
  }

  if (newCandidates.length) {
    const updatedCandidates = existingCandidates + "\n" + newCandidates.join("");
    await writeFile(DECISION_CANDIDATES_FILE, updatedCandidates, "utf-8");
    console.log(`Added ${newCandidates.length} new decision candidates.`);
  }

  console.log(`\n✅  Weekly review saved: docs/journal/weekly-${weeklyDate}.md`);
  console.log(`    📁 ${recentEntries.length} entries | ${Object.keys(categorized).length} categories | ${allActions.length} action items`);
  if (newCandidates.length) {
    console.log(`    ⚡ ${newCandidates.length} new decision candidates generated`);
  }
  console.log("");
}

review().catch((err) => {
  console.error("Review failed:", err.message);
  process.exit(1);
});
