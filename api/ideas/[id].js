import { createClient } from "@supabase/supabase-js";
import { logger } from "../_logger.js";

const log = logger("ideas-detail");

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
      log.debug("Fetching idea", { id, userId: user.id });
      const { data, error } = await supabase
        .from("ideas").select("*").eq("id", id).eq("user_id", user.id).single();

      if (error) {
        log.warn("Idea not found", { id, userId: user.id });
        return Response.json({ error: "This idea could not be found. It may have been deleted." }, { status: 404 });
      }
      return Response.json(data);
    }

    case "PATCH": {
      const body = await req.json();
      log.debug("Updating idea", { id, userId: user.id, fields: Object.keys(body) });

      const { data, error } = await supabase
        .from("ideas").update(body).eq("id", id).eq("user_id", user.id).select().single();

      if (error) {
        log.error("Failed to update idea", { error, id });
        return Response.json({ error: "Couldn't update this idea. Try refreshing the page." }, { status: 500 });
      }
      return Response.json(data);
    }

    case "DELETE": {
      log.info("Deleting idea", { id, userId: user.id });
      const { error } = await supabase
        .from("ideas").delete().eq("id", id).eq("user_id", user.id);

      if (error) {
        log.error("Failed to delete idea", { error, id });
        return Response.json({ error: "Couldn't delete this idea. It may have already been removed." }, { status: 500 });
      }
      return Response.json({ success: true });
    }

    default:
      return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
}
