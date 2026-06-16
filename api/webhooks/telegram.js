import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const body = await req.json();
  const token = req.headers.get("x-telegram-bot-api-secret-token");
  if (token !== process.env.TELEGRAM_BOT_SECRET) return res.json({ error: "Unauthorized" }, 401);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const message = body?.message || body?.channel_post;
  if (!message?.text) return res.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text;

  const { data: profile } = await supabase.from("profiles").select("id").eq("telegram_chat_id", chatId).maybeSingle();
  if (!profile) {
    await sendTelegram(chatId, "👋 Welcome to ContentPlanner!\n\nLink your account: go to Settings → Connect Telegram in your ContentPlanner dashboard.");
    return res.json({ ok: true });
  }

  if (text.startsWith("/start")) {
    await supabase.from("profiles").update({ telegram_chat_id: chatId }).eq("id", profile.id);
    await sendTelegram(chatId, "✅ Linked! Send me any link and I'll save it to your inbox.");
    return res.json({ ok: true });
  }
  if (text.startsWith("/help")) {
    await sendTelegram(chatId, "📌 Send me any link to save it to your ContentPlanner inbox.\n\nCommands:\n/ideas — Recent ideas\n/help — Show this");
    return res.json({ ok: true });
  }
  if (text.startsWith("/ideas")) {
    const { data: ideas } = await supabase.from("ideas").select("source_url,context_text").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(5);
    if (!ideas?.length) { await sendTelegram(chatId, "No ideas yet."); return res.json({ ok: true }); }
    const list = ideas.map((d, i) => `${i + 1}. ${d.source_url}\n   ${d.context_text || ""}`).join("\n\n");
    await sendTelegram(chatId, `📋 Your latest ideas:\n\n${list}`);
    return res.json({ ok: true });
  }

  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) { await sendTelegram(chatId, "Send me a link to save it."); return res.json({ ok: true }); }

  const url = urlMatch[0];
  const ctx = text.replace(url, "").trim() || null;
  let plat = "web";
  if (url.includes("instagram.com")) plat = "instagram";
  else if (url.includes("youtube.com") || url.includes("youtu.be")) plat = "youtube";
  else if (url.includes("twitter.com") || url.includes("x.com")) plat = "twitter";
  else if (url.includes("reddit.com")) plat = "reddit";
  else if (url.includes("tiktok.com")) plat = "tiktok";

  const { error } = await supabase.from("ideas").insert({ user_id: profile.id, source_url: url, source_platform: plat, context_text: ctx, status: "new" });
  const emoji = { instagram: "📸", youtube: "▶️", twitter: "🐦", reddit: "🤖", tiktok: "🎵", web: "🌐" };
  await sendTelegram(chatId, error ? "❌ Couldn't save your idea." : `${emoji[plat]} Saved!${ctx ? ` Note: ${ctx}` : ""}`);
  return res.json({ ok: true });
}

async function sendTelegram(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (e) { /* ignore */ }
}
