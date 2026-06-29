/**
 * CORS for credentialed extension endpoints (Eng review critical #3).
 *
 * The existing api/_w.js setCors() uses a wildcard "*", which is unsafe for
 * endpoints the Chrome extension calls with a Bearer token. This helper pins
 * the allowed origin to the extension's own id (chrome-extension://<id>),
 * supplied via EXTENSION_ORIGIN. Requests from any other origin get no CORS
 * headers and are blocked by the browser.
 *
 * The token lives ONLY in the extension service worker — never in a content
 * script or page context.
 *
 * Usage:
 *   import { applyExtensionCors, isPreflight } from "../_cors.js";
 *   if (!applyExtensionCors(req, nodeRes)) return res.json({ error: "Forbidden" }, 403);
 *   if (isPreflight(req)) return res.empty(204);
 */

function allowedOrigins() {
  // Comma-separated list so dev + prod extension ids can both be allowed.
  return (process.env.EXTENSION_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Sets pinned CORS headers if the request origin is an allowed extension origin.
 * Returns true if the origin is allowed (or if no origin header — same-origin/
 * server-to-server), false if it should be rejected.
 */
export function applyExtensionCors(req, nodeRes) {
  const origin = req.headers.get("origin");
  const allowed = allowedOrigins();

  // No Origin header → not a browser CORS request (e.g. curl/tests). Allow.
  if (!origin) return true;

  if (!allowed.includes(origin)) return false;

  nodeRes.setHeader("Access-Control-Allow-Origin", origin);
  nodeRes.setHeader("Vary", "Origin");
  nodeRes.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  nodeRes.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  nodeRes.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

export function isPreflight(req) {
  return req.method === "OPTIONS";
}
