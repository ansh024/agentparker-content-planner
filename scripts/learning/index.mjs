#!/usr/bin/env node

/**
 * Learning Loop CLI
 *
 * Entry point for all learning commands.
 *
 * Usage:
 *   npm run learn capture    Capture session learnings
 *   npm run learn review     Weekly review
 *   npm run learn adapt      Resolve decision candidates
 *   npm run learn taste      Add a code preference
 */

import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = {
  capture: "capture.mjs",
  review: "review.mjs",
  adapt: "adapt.mjs",
  taste: "taste.mjs",
};

const cmd = process.argv[2];

if (!cmd || !commands[cmd]) {
  console.log(`
🧠  ContentPlanner Learning Loops

Usage: npm run learn <command>

Commands:
  capture    Record what you learned from a coding session
  review     Weekly review — spot patterns across sessions
  adapt      Turn decision candidates into concrete changes
  taste      Add a code preference for AI agents

Examples:
  npm run learn capture
  npm run learn review
  npm run learn adapt
  npm run learn taste "Use const instead of let"
`);
  process.exit(0);
}

const scriptPath = join(__dirname, commands[cmd]);
const args = process.argv.slice(3);

const child = spawn("node", [scriptPath, ...args], {
  stdio: "inherit",
  cwd: process.cwd(),
});

child.on("close", (code) => {
  process.exit(code || 0);
});
