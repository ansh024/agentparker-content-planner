import { logger } from "./_logger.js";

const log = logger("instagram-webhook");

export default async function handler(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await req.json();
  log.info("Instagram webhook received", { payloadSize: JSON.stringify(body).length });

  const messageText = body?.message?.text || body?.text || "";
  const senderId = body?.sender?.id || body?.from?.id;

  const urlMatch = messageText.match(/https?:\/\/[^\s]+/);
  const url = urlMatch ? urlMatch[0] : null;

  if (!url) {
    log.debug("No URL in Instagram message — skipping");
    return Response.json({ ok: true, action: "skipped", reason: "no_url" });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let userId = null;
  if (senderId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("instagram_business_id", senderId)
      .single();
    userId = profile?.id;
  }

  if (!userId) {
    log.warn("No linked user for Instagram sender", { senderId });
    return Response.json({ ok: true, action: "skipped", reason: "unknown_user" });
  }

  const contextText = messageText.replace(url, "").trim() || null;

  log.info("Saving Instagram idea", { userId, url: url.slice(0, 80) });
  const { error } = await supabase.from("ideas").insert({
    user_id: userId,
    source_url: url,
    source_platform: "instagram",
    context_text: contextText,
    status: "new",
  });

  if (error) {
    log.error("Failed to save Instagram idea", { error, userId });
    return Response.json({ error: "Couldn't save the idea from Instagram. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true, action: "created" });
}
