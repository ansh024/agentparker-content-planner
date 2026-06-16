/**
 * Structured Logger — Frontend
 *
 * Levels: debug | info | warn | error
 * In production (VITE_ENV=production), debug logs are suppressed.
 * All logs include timestamp, level, and component context.
 *
 * Usage:
 *   import { logger } from '../lib/logger';
 *   const log = logger('ComponentName');
 *   log.info('User clicked save', { ideaId: 'abc' });
 *   log.error('Save failed', { error, ideaId: 'abc' });
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = import.meta.env.VITE_LOG_LEVEL || (import.meta.env.PROD ? "warn" : "debug");
const MIN_LEVEL = LEVELS[CURRENT_LEVEL] ?? LEVELS.debug;

function shouldLog(level) {
  return LEVELS[level] >= MIN_LEVEL;
}

function formatTime() {
  return new Date().toISOString();
}

function formatData(data) {
  if (!data) return "";
  if (data instanceof Error) {
    return JSON.stringify({ message: data.message, stack: data.stack?.split("\n").slice(0, 3) });
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

const colors = {
  debug: "color: #9ca3af",
  info: "color: #3b82f6",
  warn: "color: #f59e0b; font-weight: bold",
  error: "color: #ef4444; font-weight: bold",
};

export function logger(component) {
  return {
    debug(msg, data) {
      if (!shouldLog("debug")) return;
      console.debug(
        `%c[${formatTime()}] DEBUG [${component}] ${msg}`,
        colors.debug,
        data ? formatData(data) : ""
      );
    },
    info(msg, data) {
      if (!shouldLog("info")) return;
      console.info(
        `%c[${formatTime()}] INFO [${component}] ${msg}`,
        colors.info,
        data ? formatData(data) : ""
      );
    },
    warn(msg, data) {
      if (!shouldLog("warn")) return;
      console.warn(
        `%c[${formatTime()}] WARN [${component}] ${msg}`,
        colors.warn,
        data ? formatData(data) : ""
      );
    },
    error(msg, data) {
      if (!shouldLog("error")) return;
      console.error(
        `%c[${formatTime()}] ERROR [${component}] ${msg}`,
        colors.error,
        data ? formatData(data) : ""
      );
    },
  };
}

export { LEVELS };
