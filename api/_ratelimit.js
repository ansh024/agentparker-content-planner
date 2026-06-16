/**
 * Simple rate limiter for Vercel serverless functions.
 * In-memory store — resets when the function cold-starts (acceptable for free tier).
 *
 * Usage:
 *   import { rateLimit } from './_ratelimit.js';
 *   const limiter = rateLimit({ windowMs: 60000, max: 10 });
 *   const result = limiter(req);
 *   if (!result.ok) return Response.json({ error: result.message }, { status: 429 });
 */

const stores = new Map();

export function rateLimit({ windowMs = 60000, max = 10, keyFn } = {}) {
  const getKey = keyFn || ((req) => {
    const forwarded = req.headers.get("x-forwarded-for");
    return forwarded?.split(",")[0]?.trim() || "unknown";
  });

  return function check(req) {
    const key = getKey(req);
    const now = Date.now();

    if (!stores.has(key)) {
      stores.set(key, []);
    }

    const timestamps = stores.get(key);
    // Purge old entries
    while (timestamps.length && timestamps[0] < now - windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= max) {
      return { ok: false, message: "Too many requests. Please slow down and try again in a moment." };
    }

    timestamps.push(now);
    return { ok: true };
  };
}

// Periodic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of stores) {
    while (timestamps.length && timestamps[0] < now - 60000) {
      timestamps.shift();
    }
    if (timestamps.length === 0) stores.delete(key);
  }
}, 300000).unref?.();
