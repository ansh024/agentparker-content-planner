#!/usr/bin/env node

/**
 * Learning Loop — Capture
 *
 * After every coding session, capture what you learned.
 * Prompts interactively, saves a timestamped journal entry.
 *
 * Usage:
 *   npm run learn capture
 *   node scripts/learning/capture.mjs
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const JOURNAL_DIR = join(REPO_ROOT, "docs", "journal");

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

const PHASES = ["0 — Foundation", "1 — Dogfood", "2 — Capture", "3 — Listening", "4 — Polish"];
const MOODS = [
  "😤 frustrated",
  "🤔 confused",
  "💡 enlightened",
  "😌 smooth",
  "🔥 focused",
  "😐 meh",
];
const TYPES = ["coding", "debugging", "planning", "research", "review", "other"];
const TAGS = [
  "#tech-stack",
  "#api",
  "#ux",
  "#product",
  "#process",
  "#architecture",
  "#bug",
  "#documentation",
  "#cost",
  "#user-research",
  "#taste",
];

function pickFrom(options) {
  return options
    .map((opt, i) => `  ${i + 1}. ${opt}`)
    .join("\n");
}

async function capture() {
  console.log("\n🧠  Learning Capture — tell me what happened\n");
  console.log("(press Enter to skip any question)\n");

  const title = await ask("One-line insight: ");
  if (!title) {
    console.log("No insight given. Aborting capture.");
    rl.close();
    return;
  }

  console.log(`\nSession type:\n${pickFrom(TYPES)}\n`);
  const typeIdx = parseInt(await ask("Pick one [1-6]: ")) || 6;
  const sessionType = TYPES[typeIdx - 1] || "other";

  console.log(`\nPhase:\n${pickFrom(PHASES)}\n`);
  const phaseIdx = parseInt(await ask("Pick one [1-5]: ")) || 1;
  const phase = PHASES[phaseIdx - 1]?.split(" —")[0] || "0";

  console.log(`\nMood:\n${pickFrom(MOODS)}\n`);
  const moodIdx = parseInt(await ask("Pick one [1-6]: ")) || 6;
  const mood = MOODS[moodIdx - 1] || "😐 meh";

  const context = await ask("\nWhat were you trying to do? (1-2 sentences): ");
  const whatHappened = await ask("What went wrong or surprised you?: ");
  const learned = await ask("What did you learn? (actionable insight): ");
  const change1 = await ask("Action item 1: ");
  const change2 = await ask("Action item 2 (or Enter to skip): ");

  console.log(`\nTags (comma-separated, e.g. 'supabase, rls, api'):\n${pickFrom(TAGS)}\n`);
  const tagsInput = await ask("Your tags: ");

  const dateStr = new Date().toISOString().split("T")[0];
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

  const changeItems = [];
  if (change1) changeItems.push(`[ ] ${change1}`);
  if (change2) changeItems.push(`[ ] ${change2}`);

  const tagList = tagsInput
    ? tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith("#") ? t : `#${t}`))
    : [];

  const entry = `# ${title}

**Date:** ${dateStr}
**Session type:** ${sessionType}
**Phase:** ${phase}
**Mood:** ${mood}

---

## Context

${context || "(no context provided)"}

## What happened?

${whatHappened || "(not specified)"}

## What I learned

${learned || "(not specified)"}

## What should change?

${changeItems.length ? changeItems.join("\n") : "[ ] (no action items)"}

## Tags

${tagList.length ? tagList.join(" ") : "#uncategorized"}
`;

  const filename = `${dateStr}-${slug}.md`;
  const filepath = join(JOURNAL_DIR, filename);

  await mkdir(JOURNAL_DIR, { recursive: true });
  await writeFile(filepath, entry, "utf-8");

  console.log(`\n✅  Saved: docs/journal/${filename}`);
  console.log(`    Run 'npm run learn review' at end of week to synthesize.\n`);

  rl.close();
}

capture().catch((err) => {
  console.error("Capture failed:", err.message);
  rl.close();
  process.exit(1);
});
