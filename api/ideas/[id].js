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
  const url = new URL(req.url, "http://localhost");
  const id = url.pathname.split("/").pop();

  if (req.method === "GET") {
    const { data, error } = await supabase.from("ideas").select("*").eq("id", id).eq("user_id", user.id).single();
    if (error) return res.json({ error: "This idea could not be found." }, 404);
    return res.json(data);
  }
  if (req.method === "PATCH") {
    const body = await req.json();
    const { data, error } = await supabase.from("ideas").update(body).eq("id", id).eq("user_id", user.id).select().single();
    if (error) return res.json({ error: "Couldn't update this idea." }, 500);
    return res.json(data);
  }
  if (req.method === "DELETE") {
    const { error } = await supabase.from("ideas").delete().eq("id", id).eq("user_id", user.id);
    if (error) return res.json({ error: "Couldn't delete this idea." }, 500);
    return res.json({ success: true });
  }
  return res.json({ error: "Method not allowed" }, 405);
}
