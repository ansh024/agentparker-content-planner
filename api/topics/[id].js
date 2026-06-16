import { createClient } from "@supabase/supabase-js";
import { logger } from "./_logger.js";

const log = logger("topics-detail");

export default async function handler(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Please log in to continue." }, { status: 401 });
  }
  const token = authHeader.replace("Bearer ", "");

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(token);
  if (!user) return Response.json({ error: "Session expired. Please log in again." }, { status: 401 });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();

  switch (req.method) {
    case "GET": {
      // Return topic + its listening hits
      log.debug("Fetching topic with hits", { id, userId: user.id });
      const [topicRes, hitsRes] = await Promise.all([
        supabase.from("listening_topics").select("*").eq("id", id).eq("user_id", user.id).single(),
        supabase.from("listening_hits").select("*").eq("topic_id", id).order("engagement_score", { ascending: false }).limit(50),
      ]);

      if (topicRes.error) {
        log.warn("Topic not found", { id });
        return Response.json({ error: "This topic could not be found." }, { status: 404 });
      }
      return Response.json({ ...topicRes.data, hits: hitsRes.data || [] });
    }

    case "PATCH": {
      const body = await req.json();
      log.debug("Updating topic", { id, fields: Object.keys(body) });
      const { data, error } = await supabase
        .from("listening_topics").update(body).eq("id", id).eq("user_id", user.id).select().single();

      if (error) {
        log.error("Failed to update topic", { error, id });
        return Response.json({ error: "Couldn't update this topic. Try again." }, { status: 500 });
      }
      return Response.json(data);
    }

    case "DELETE": {
      log.info("Deleting topic", { id, userId: user.id });
      const { error } = await supabase
        .from("listening_topics").delete().eq("id", id).eq("user_id", user.id);

      if (error) {
        log.error("Failed to delete topic", { error, id });
        return Response.json({ error: "Couldn't delete this topic. Try again." }, { status: 500 });
      }
      return Response.json({ success: true });
    }

    default:
      return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
}
