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
    const queryUrl = new URL(req.url, "http://localhost");
    const start = queryUrl.searchParams.get("start");
    const end = queryUrl.searchParams.get("end");

    let query = supabase.from("content_plans").select("*, ideas(*)")
      .eq("user_id", user.id).order("scheduled_date", { ascending: true });
    if (start) query = query.gte("scheduled_date", start);
    if (end) query = query.lte("scheduled_date", end);

    const { data, error } = await query;
    if (error) return res.json({ error: "Couldn't load your calendar." }, 500);
    return res.json(data);
  }

  if (req.method === "POST") {
    const body = await req.json();
    if (!body.scheduled_date) return res.json({ error: "Please select a date." }, 400);

    const { data, error } = await supabase.from("content_plans").insert({
      user_id: user.id, idea_id: body.idea_id || null,
      scheduled_date: body.scheduled_date,
      target_platform: body.target_platform || "instagram",
      notes: body.notes || null,
    }).select().single();

    if (error) return res.json({ error: "Couldn't schedule this." }, 500);
    return res.json(data, 201);
  }

  return res.json({ error: "Method not allowed" }, 405);
}
