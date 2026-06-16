import { getClient } from "./lib/commandcode.mjs";

const client = getClient();
const models = await client.models.list();

const deepseek = models.data
  .map((m) => m.id)
  .filter((id) => id.includes("deepseek"))
  .sort();

console.log("DeepSeek models available via Command Code:\n");
for (const id of deepseek) console.log(`  ${id}`);

if (deepseek.length === 0) {
  console.log("  (none found — check your API key and plan)");
}
