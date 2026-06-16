import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return res.json({ error: "Please log in to continue." }, 401);

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return res.json({ error: "Session expired." }, 401);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const { data, error } = await supabase.from("listening_topics").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) return res.json({ error: "Couldn't load topics." }, 500);
    return res.json(data);
  }

  if (req.method === "POST") {
    const body = await req.json();
    if (!body.name || !body.keywords?.length) return res.json({ error: "Name and keywords required." }, 400);

    const { data, error } = await supabase.from("listening_topics").insert({
      user_id: user.id, name: body.name, keywords: body.keywords,
      frequency: body.frequency || "daily",
      platforms: body.platforms || ["reddit", "hackernews", "youtube"],
      active: true,
    }).select().single();

    if (error) return res.json({ error: "Couldn't create topic." }, 500);
    return res.json(data, 201);
  }

  return res.json({ error: "Method not allowed" }, 405);
}
