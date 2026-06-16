import { createClient } from "@supabase/supabase-js";
import { logger } from "../_logger.js";

const log = logger("telegram-webhook");

export default async function handler(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await req.json();

  const token = req.headers.get("x-telegram-bot-api-secret-token");
  if (token !== process.env.TELEGRAM_BOT_SECRET) {
    log.warn("Telegram webhook rejected — invalid secret token");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const message = body?.message || body?.channel_post;
  if (!message || !message.text) {
    return Response.json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text;

  log.debug("Telegram message received", { chatId, textLength: text.length });

  // Look up user by telegram_chat_id
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .single();

  if (profileErr) {
    log.debug("No profile linked to this Telegram user", { chatId });
  }

  if (!profile) {
    await sendTelegramMessage(
      chatId,
      "👋 Welcome to ContentPlanner!\n\n" +
        "Link your account first: go to Settings → Connect Telegram in your ContentPlanner dashboard.\n\n" +
        "Once linked, forward any link here and I'll save it to your inbox."
    );
    return Response.json({ ok: true });
  }

  if (text.startsWith("/start")) {
    await supabase.from("profiles").update({ telegram_chat_id: chatId }).eq("id", profile.id);
    log.info("Telegram user linked", { userId: profile.id, chatId });
    await sendTelegramMessage(
      chatId,
      "✅ Linked! Send me any link and I'll save it to your inbox.\n\n" +
        "You can also add a note: just type text with your link."
    );
    return Response.json({ ok: true });
  }

  if (text.startsWith("/help")) {
    await sendTelegramMessage(
      chatId,
      "📌 Send me any link to save it to your ContentPlanner inbox.\n\n" +
        "Commands:\n" +
        "/ideas — Show your 5 most recent ideas\n" +
        "/help — Show this message"
    );
    return Response.json({ ok: true });
  }

  if (text.startsWith("/ideas")) {
    const { data: ideas, error: ideasErr } = await supabase
      .from("ideas")
      .select("source_url, context_text, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (ideasErr) {
      log.error("Failed to fetch ideas for Telegram", { error: ideasErr, userId: profile.id });
      await sendTelegramMessage(chatId, "❌ Couldn't load your ideas right now. Try again in a moment.");
      return Response.json({ ok: true });
    }

    if (!ideas?.length) {
      await sendTelegramMessage(chatId, "No ideas yet. Send me a link to get started!");
      return Response.json({ ok: true });
    }

    const list = ideas
      .map((idea, i) => `${i + 1}. ${idea.source_url}\n   ${idea.context_text || ""}`)
      .join("\n\n");

    await sendTelegramMessage(chatId, `📋 Your latest ideas:\n\n${list}`);
    return Response.json({ ok: true });
  }

  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const url = urlMatch ? urlMatch[0] : null;

  if (!url) {
    await sendTelegramMessage(
      chatId,
      "Send me a link and I'll save it to your inbox. You can also add a note alongside the link."
    );
    return Response.json({ ok: true });
  }

  const contextText = text.replace(url, "").trim() || null;

  let sourcePlatform = "web";
  if (url.includes("instagram.com")) sourcePlatform = "instagram";
  else if (url.includes("youtube.com") || url.includes("youtu.be")) sourcePlatform = "youtube";
  else if (url.includes("twitter.com") || url.includes("x.com")) sourcePlatform = "twitter";
  else if (url.includes("reddit.com")) sourcePlatform = "reddit";
  else if (url.includes("tiktok.com")) sourcePlatform = "tiktok";

  log.info("Saving idea from Telegram", { userId: profile.id, platform: sourcePlatform });

  const { error: insertErr } = await supabase.from("ideas").insert({
    user_id: profile.id,
    source_url: url,
    source_platform: sourcePlatform,
    context_text: contextText,
    status: "new",
  });

  if (insertErr) {
    log.error("Failed to save Telegram idea", { error: insertErr, userId: profile.id });
    await sendTelegramMessage(chatId, "❌ Couldn't save your idea right now. Please try again.");
  } else {
    const platformEmoji = {
      instagram: "📸", youtube: "▶️", twitter: "🐦", reddit: "🤖", tiktok: "🎵", web: "🌐",
    };
    await sendTelegramMessage(
      chatId,
      `${platformEmoji[sourcePlatform]} Saved to your inbox!\n${contextText ? `Note: ${contextText}` : ""}`
    );
  }

  return Response.json({ ok: true });
}

async function sendTelegramMessage(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    log.error("TELEGRAM_BOT_TOKEN not configured");
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    log.error("Failed to send Telegram message", { error: err, chatId });
  }
}
