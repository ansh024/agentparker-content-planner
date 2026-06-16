import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

export function getClient() {
  const apiKey = process.env.CMD_API_KEY;
  if (!apiKey || apiKey === "your-command-code-api-key-here") {
    console.error(
      "Missing CMD_API_KEY. Copy .env.example to .env and add your Command Code API key."
    );
    console.error("Create a key at: https://commandcode.ai/studio");
    process.exit(1);
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://api.commandcode.ai/provider/v1",
  });
}

export function getModel() {
  return process.env.CMD_MODEL ?? "deepseek/deepseek-v4-pro";
}
