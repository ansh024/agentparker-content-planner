import { createClient } from "@supabase/supabase-js";
import { logger } from "./_logger.js";

const log = logger("ideas-handler");

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Please log in to continue." }, { status: 401 });
  }
  const token = authHeader.replace("Bearer ", "");

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    log.warn("Unauthorized access attempt");
    return Response.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }

  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  switch (req.method) {
    case "GET": {
      const url = new URL(req.url);
      const status = url.searchParams.get("status");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      log.debug("Fetching ideas", { userId: user.id, status, limit, offset });

      let query = serviceClient
        .from("ideas")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) {
        log.error("Failed to fetch ideas", { error, userId: user.id });
        return Response.json(
          { error: "We had trouble loading your ideas. Try refreshing the page." },
          { status: 500 }
        );
      }

      log.info(`Returned ${data?.length || 0} ideas`);
      return Response.json(data);
    }

    case "POST": {
      const body = await req.json();
      const { source_url, source_platform, context_text, tags } = body;

      if (!source_url) {
        return Response.json(
          { error: "Please provide a URL to save." },
          { status: 400 }
        );
      }

      log.info("Creating idea", { userId: user.id, platform: source_platform || "manual" });

      const { data, error } = await serviceClient
        .from("ideas")
        .insert({
          user_id: user.id,
          source_url,
          source_platform: source_platform || "manual",
          context_text: context_text || null,
          tags: tags || [],
          status: "new",
        })
        .select()
        .single();

      if (error) {
        log.error("Failed to create idea", { error, userId: user.id });
        return Response.json(
          { error: "Couldn't save your idea. Check your connection and try again." },
          { status: 500 }
        );
      }

      log.info("Idea created", { ideaId: data.id });
      return Response.json(data, { status: 201 });
    }

    default:
      return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
}
