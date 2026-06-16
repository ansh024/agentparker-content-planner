import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  if (req.method === "OPTIONS") {
    res.setCors();
    return res.empty(204);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return res.json({ error: "Please log in to continue." }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.json({ error: "Your session has expired. Please log in again." }, 401);
  }

  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const queryUrl = new URL(req.url, "http://localhost");
    const status = queryUrl.searchParams.get("status");
    const limit = parseInt(queryUrl.searchParams.get("limit") || "50");
    const offset = parseInt(queryUrl.searchParams.get("offset") || "0");

    let query = serviceClient.from("ideas").select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return res.json({ error: "Couldn't load your ideas. Try refreshing." }, 500);
    return res.json(data);
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { source_url, source_platform, context_text, tags } = body;

    if (!source_url) {
      return res.json({ error: "Please provide a URL to save." }, 400);
    }

    const { data, error } = await serviceClient.from("ideas").insert({
      user_id: user.id, source_url,
      source_platform: source_platform || "manual",
      context_text: context_text || null,
      tags: tags || [], status: "new",
    }).select().single();

    if (error) return res.json({ error: "Couldn't save your idea. Try again." }, 500);
    return res.json(data, 201);
  }

  return res.json({ error: "Method not allowed" }, 405);
}
