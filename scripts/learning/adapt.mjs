#!/usr/bin/env node

/**
 * Learning Loop — Adapt
 *
 * Reads decision candidates, helps you resolve them into action.
 * Turns learnings into concrete changes: docs updates, GitHub issues,
 * architecture decisions, or taste preferences.
 *
 * Usage:
 *   npm run learn adapt
 *   node scripts/learning/adapt.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const DECISION_CANDIDATES_FILE = join(REPO_ROOT, "docs", "journal", "decision-candidates.md");
const DECISIONS_FILE = join(REPO_ROOT, "docs", "DECISIONS.md");
const APPLIED_DIR = join(REPO_ROOT, "docs", "journal", "applied");

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

async function adapt() {
  console.log("\n🔧  Learning Adaptation — turn insights into action\n");

  let content;
  try {
    content = await readFile(DECISION_CANDIDATES_FILE, "utf-8");
  } catch {
    console.log("No decision candidates file found. There's nothing to adapt from.");
    rl.close();
    return;
  }

  // Parse candidates from markdown
  const candidates = [];
  const sections = content.split("### Candidate:");
  if (sections.length <= 1) {
    console.log("No pending decision candidates found. All caught up!");
    rl.close();
    return;
  }

  let pendingCount = 0;
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const lines = section.trim().split("\n");

    const title = lines[0]?.trim() || "Untitled";
    let status = "proposed";
    for (const line of lines) {
      if (line.toLowerCase().includes("**status:**")) {
        status = line.split("**status:**")[1]?.trim() || "proposed";
      }
    }

    if (status === "proposed") {
      pendingCount++;
      candidates.push({ title, section: section.trim() });
    }
  }

  if (pendingCount === 0) {
    console.log("No pending decision candidates. All resolved!");
    rl.close();
    return;
  }

  console.log(`Found ${pendingCount} pending decision candidate(s):\n`);
  candidates.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.title} [proposed]`);
  });

  const choice = await ask(
    "\nWhich one to resolve? (1-{len} or Enter to skip): ".replace("{len}", candidates.length)
  );
  if (!choice) {
    console.log("Nothing resolved. Run again when ready.");
    rl.close();
    return;
  }

  const idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= candidates.length) {
    console.log("Invalid choice.");
    rl.close();
    return;
  }

  const candidate = candidates[idx];

  console.log(`\nResolving: ${candidate.title}\n`);
  console.log("Outcome options:");
  console.log("  1. Accept — apply the change (updates DECISIONS.md)");
  console.log("  2. Reject — document why not");
  console.log("  3. Defer — leave for next review");

  const outcome = await ask("Pick one [1-3]: ");

  let decision;
  if (outcome === "1") {
    decision = "accepted";
    const rationale = await ask("Why are you accepting this? (1 sentence): ");

    // Add to DECISIONS.md
    const decisionNumber = await getNextDecisionNumber();
    const decisionEntry = `\n---\n\n### DEC-${String(decisionNumber).padStart(3, "0")}: ${candidate.title}\n\n` +
      `**Date:** ${new Date().toISOString().split("T")[0]}\n` +
      `**Status:** decided\n` +
      `**Source:** Learning adaptation from decision candidates\n\n` +
      `**Context:**\n` +
      `Adapted from learning journal. ${rationale}\n\n` +
      `**Decision:**\n` +
      `Accepted based on learnings captured in the journal.\n\n` +
      `**Consequences:**\n` +
      `- ✅ Addressed recurring issue\n`;

    const decisions = await readFile(DECISIONS_FILE, "utf-8");
    // Insert before Superseded Decisions section
    const insertPoint = decisions.indexOf("## Superseded Decisions");
    const updated = insertPoint > -1
      ? decisions.slice(0, insertPoint) + decisionEntry + "\n" + decisions.slice(insertPoint)
      : decisions + decisionEntry;
    await writeFile(DECISIONS_FILE, updated, "utf-8");

    console.log(`\n✅  Added DEC-${String(decisionNumber).padStart(3, "0")} to docs/DECISIONS.md`);

  } else if (outcome === "2") {
    decision = "rejected";
    const reason = await ask("Why are you rejecting this?: ");
    console.log(`\n📝  Noted: rejected because "${reason}"`);
  } else {
    decision = "deferred";
    console.log("\n⏳  Deferred to next review.");
  }

  // Update decision-candidates.md
  const updatedContent = content.replace(
    `### Candidate:${candidate.section}`,
    `### Candidate:${candidate.section.replace("**Status:** proposed", `**Status:** ${decision}`)}`
  );
  await writeFile(DECISION_CANDIDATES_FILE, updatedContent, "utf-8");

  // If accepted, save to applied/
  if (decision === "accepted") {
    const dateStr = new Date().toISOString().split("T")[0];
    const slug = candidate.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60);
    const appliedContent = `# Applied: ${candidate.title}\n\n` +
      `**Date applied:** ${dateStr}\n` +
      `**Source:** Decision candidate\n\n` +
      `## What was changed\n\n` +
      `(document what actually changed here)\n\n` +
      `## Result\n\n` +
      `(document the outcome after some time)\n`;
    await writeFile(join(APPLIED_DIR, `${dateStr}-${slug}.md`), appliedContent, "utf-8");
    console.log(`   Applied record: docs/journal/applied/${dateStr}-${slug}.md`);
  }

  const remaining = pendingCount - 1;
  console.log(`\n${remaining} candidate(s) remaining. Run 'npm run learn adapt' again when ready.\n`);

  rl.close();
}

async function getNextDecisionNumber() {
  try {
    const content = await readFile(DECISIONS_FILE, "utf-8");
    const matches = content.matchAll(/### DEC-(\d+):/g);
    let max = 0;
    for (const match of matches) {
      const num = parseInt(match[1]);
      if (num > max) max = num;
    }
    return max + 1;
  } catch {
    return 1;
  }
}

adapt().catch((err) => {
  console.error("Adaptation failed:", err.message);
  rl.close();
  process.exit(1);
});
