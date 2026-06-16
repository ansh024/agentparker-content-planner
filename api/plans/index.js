import { createClient } from "@supabase/supabase-js";
import { logger } from "./_logger.js";

const log = logger("plans-handler");

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

  switch (req.method) {
    case "GET": {
      const url = new URL(req.url);
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");

      log.debug("Fetching plans", { userId: user.id, start, end });

      let query = supabase
        .from("content_plans")
        .select("*, ideas(*)")
        .eq("user_id", user.id)
        .order("scheduled_date", { ascending: true });

      if (start) query = query.gte("scheduled_date", start);
      if (end) query = query.lte("scheduled_date", end);

      const { data, error } = await query;
      if (error) {
        log.error("Failed to fetch plans", { error, userId: user.id });
        return Response.json({ error: "We couldn't load your calendar. Try refreshing the page." }, { status: 500 });
      }
      return Response.json(data);
    }

    case "POST": {
      const body = await req.json();
      const { idea_id, scheduled_date, target_platform, notes } = body;

      if (!scheduled_date) {
        return Response.json({ error: "Please select a date to schedule this." }, { status: 400 });
      }

      log.info("Creating plan entry", { userId: user.id, date: scheduled_date });

      const { data, error } = await supabase
        .from("content_plans")
        .insert({
          user_id: user.id,
          idea_id: idea_id || null,
          scheduled_date,
          target_platform: target_platform || "instagram",
          notes: notes || null,
        })
        .select()
        .single();

      if (error) {
        log.error("Failed to create plan", { error, userId: user.id });
        return Response.json({ error: "Couldn't schedule this to the calendar. Try again." }, { status: 500 });
      }
      return Response.json(data, { status: 201 });
    }

    default:
      return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
}
