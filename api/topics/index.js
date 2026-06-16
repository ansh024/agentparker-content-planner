import { createClient } from "@supabase/supabase-js";
import { logger } from "./_logger.js";

const log = logger("topics-handler");

export default async function handler(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Please log in to continue." }, { status: 401 });
  }
  const token = authHeader.replace("Bearer ", "");

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(token);
  if (!user) return Response.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  switch (req.method) {
    case "GET": {
      log.debug("Fetching topics", { userId: user.id });
      const { data, error } = await supabase
        .from("listening_topics")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        log.error("Failed to fetch topics", { error, userId: user.id });
        return Response.json({ error: "We couldn't load your listening topics. Try refreshing the page." }, { status: 500 });
      }
      return Response.json(data);
    }

    case "POST": {
      const body = await req.json();
      const { name, keywords, frequency, platforms } = body;

      if (!name || !keywords || !keywords.length) {
        return Response.json({ error: "Please provide a topic name and at least one keyword." }, { status: 400 });
      }

      log.info("Creating topic", { name, userId: user.id });

      const { data, error } = await supabase
        .from("listening_topics")
        .insert({
          user_id: user.id,
          name,
          keywords,
          frequency: frequency || "daily",
          platforms: platforms || ["reddit", "hackernews", "youtube"],
          active: true,
        })
        .select()
        .single();

      if (error) {
        log.error("Failed to create topic", { error, userId: user.id });
        return Response.json({ error: "Couldn't create this topic. Please try again." }, { status: 500 });
      }
      return Response.json(data, { status: 201 });
    }

    default:
      return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
}
