import { getClient, getModel } from "./lib/commandcode.mjs";

const prompt = process.argv.slice(2).join(" ") || "Say hello in one sentence.";
const client = getClient();
const model = getModel();

const completion = await client.chat.completions.create({
  model,
  messages: [{ role: "user", content: prompt }],
});

console.log(completion.choices[0]?.message?.content ?? "(no content)");
console.error(`\nmodel: ${model}`);
