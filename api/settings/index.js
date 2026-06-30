import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

// Keys that users can manage from the UI.
// Values are stored in Supabase and injected into the worker at run time.
const ALLOWED_KEYS = [
  "OPENROUTER_API_KEY",
  "FIRECRAWL_API_KEY",
  "ANTHROPIC_API_KEY",
  "SCRAPECREATORS_API_KEY",
];

async function currentUser(authHeader) {
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
  return user;
}

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return res.json({ error: "Please log in." }, 401);

  const user = await currentUser(authHeader);
  if (!user) return res.json({ error: "Session expired." }, 401);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // GET — return settings with key values masked after the first 8 chars
  if (req.method === "GET") {
    const { data } = await supabase
      .from("user_settings")
      .select("settings, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const raw = data?.settings || {};
    const masked = {};
    for (const key of ALLOWED_KEYS) {
      const val = raw[key] || "";
      masked[key] = val.length > 8 ? val.slice(0, 8) + "•".repeat(Math.min(val.length - 8, 24)) : val;
    }

    return res.json({
      ok: true,
      settings: masked,
      updatedAt: data?.updated_at || null,
      // Which keys are set (non-empty) — used by the UI to show status indicators
      keyStatus: Object.fromEntries(ALLOWED_KEYS.map((k) => [k, !!(raw[k])])),
    });
  }

  // PUT — save settings
  if (req.method === "PUT") {
    const body = await req.json();
    const incoming = body.settings || {};

    // Fetch existing so we can merge (partial updates should not wipe other keys)
    const { data: existing } = await supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();

    const current = existing?.settings || {};
    const merged = { ...current };

    for (const key of ALLOWED_KEYS) {
      if (key in incoming) {
        const val = incoming[key];
        if (val === "" || val === null) {
          delete merged[key]; // clearing a key removes it
        } else if (!val.includes("•")) {
          // Only overwrite if the value is not a masked placeholder
          merged[key] = val;
        }
      }
    }

    await supabase.from("user_settings").upsert(
      { user_id: user.id, settings: merged },
      { onConflict: "user_id" }
    );

    return res.json({ ok: true });
  }

  return res.json({ error: "Method not allowed" }, 405);
}
