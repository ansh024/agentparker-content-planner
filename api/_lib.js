import { createClient } from "@supabase/supabase-js";
import { logger } from "./_logger.js";

const log = logger("api-lib");

export function getServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error("Missing Supabase env vars for service client");
    throw new Error("Server configuration error — please check environment variables.");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiError(message, status = 400, detail = null) {
  if (detail) {
    log.warn("API error response", { status, message, detail });
  }
  return json({ error: message }, status);
}
