/**
 * Structured Logger — API (Vercel Serverless)
 *
 * Uses structured JSON logging for server-side.
 * In production, debug logs are suppressed. Include request context.
 *
 * Usage:
 *   import { logger } from './_logger.js';
 *   const log = logger('ideas-handler');
 *   log.info('Idea created', { ideaId: data.id, userId: user.id });
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
const MIN_LEVEL = LEVELS[CURRENT_LEVEL] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= MIN_LEVEL;
}

function formatLog(level, component, msg, data) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    msg,
  };

  if (data) {
    if (data instanceof Error) {
      entry.error = { message: data.message, stack: data.stack?.split("\n").slice(0, 5) };
    } else {
      entry.data = data;
    }
  }

  return JSON.stringify(entry);
}

export function logger(component) {
  return {
    debug(msg, data) {
      if (shouldLog("debug")) console.debug(formatLog("debug", component, msg, data));
    },
    info(msg, data) {
      if (shouldLog("info")) console.info(formatLog("info", component, msg, data));
    },
    warn(msg, data) {
      if (shouldLog("warn")) console.warn(formatLog("warn", component, msg, data));
    },
    error(msg, data) {
      if (shouldLog("error")) console.error(formatLog("error", component, msg, data));
    },
  };
}
