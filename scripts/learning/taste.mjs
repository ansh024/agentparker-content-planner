#!/usr/bin/env node

/**
 * Learning Loop — Taste
 *
 * Adds a code preference / taste entry that AI agents will follow
 * when working on this project. Writes to .commandcode/taste/taste.md
 *
 * Usage:
 *   npm run learn taste "Always use const instead of let"
 *   npm run learn taste "Use Tailwind utility classes over custom CSS" --category=frontend --confidence=0.9
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const TASTE_FILE = join(REPO_ROOT, ".commandcode", "taste", "taste.md");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { learning: "", category: "workflow", confidence: "0.70" };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--category" || arg === "-c") {
      result.category = args[++i] || "workflow";
    } else if (arg === "--confidence") {
      result.confidence = args[++i] || "0.70";
    } else if (!arg.startsWith("--")) {
      result.learning += (result.learning ? " " : "") + arg;
    }
    i++;
  }

  return result;
}

async function addTaste() {
  const { learning, category, confidence } = parseArgs();

  if (!learning) {
    console.log("Usage: npm run learn taste \"Your code preference here\" [--category=frontend] [--confidence=0.9]");
    console.log("\nCategories:");
    console.log("  workflow    Project workflow conventions");
    console.log("  frontend    React, CSS, component patterns");
    console.log("  backend     API routes, server patterns");
    console.log("  database    Supabase, SQL, migrations");
    console.log("  testing     Test conventions");
    console.log("  architecture System design decisions");
    console.log("  methodology How we build (dogfood, iterate, etc.)");
    return;
  }

  // Read existing taste file
  let content = "";
  try {
    content = await readFile(TASTE_FILE, "utf-8");
  } catch {
    content = "# Taste (Continuously Learned by [CommandCode][cmd])\n\n[cmd]: https://commandcode.ai/\n\n";
    await mkdir(join(REPO_ROOT, ".commandcode", "taste"), { recursive: true });
  }

  // Map user-friendly category names to taste file headings
  const categoryMap = {
    workflow: "workflow",
    frontend: "frontend",
    backend: "backend",
    database: "database",
    testing: "testing",
    architecture: "architecture",
    methodology: "methodology",
  };

  const heading = categoryMap[category] || category;

  // Find or create the category section
  const headingLine = `# ${heading}`;
  const learningLine = `- ${learning}. Confidence: ${confidence}`;

  if (content.includes(headingLine)) {
    // Add under existing heading
    const lines = content.split("\n");
    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === headingLine) {
        insertIdx = i + 1;
        break;
      }
    }
    if (insertIdx > -1) {
      // Find the next heading or end
      let endIdx = lines.length;
      for (let i = insertIdx; i < lines.length; i++) {
        if (lines[i].startsWith("# ")) {
          endIdx = i;
          break;
        }
      }
      lines.splice(endIdx, 0, learningLine);
      content = lines.join("\n");
    }
  } else {
    // Add new heading at the end
    content += `\n${headingLine}\n${learningLine}\n`;
  }

  await writeFile(TASTE_FILE, content, "utf-8");

  console.log(`\n✅  Taste added: "${learning}"`);
  console.log(`    Category: ${heading} | Confidence: ${confidence}`);
  console.log(`    Written to: .commandcode/taste/taste.md\n`);
}

addTaste().catch((err) => {
  console.error("Failed to add taste:", err.message);
  process.exit(1);
});
