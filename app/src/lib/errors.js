/**
 * User-facing error messages.
 *
 * Every error the user sees must go through this map.
 * Raw system errors (Supabase codes, network errors, etc.) 
 * get mapped to readable, actionable messages.
 *
 * Usage:
 *   import { friendlyError } from '../lib/errors';
 *   throw new Error(friendlyError('SAVE_FAILED'));
 *   // or with context:
 *   throw new Error(friendlyError('SAVE_FAILED', { reason: 'URL already exists' }));
 */

const ERROR_MAP = {
  // Auth
  AUTH_INVALID_EMAIL: "That email address doesn't look right. Check and try again.",
  AUTH_LINK_EXPIRED: "Your login link has expired. Request a new one below.",
  AUTH_LINK_SENT: "We've sent a login link to your email. Check your inbox!",
  AUTH_FAILED: "We couldn't log you in right now. Please try again.",
  AUTH_NO_EMAIL: "Please enter your email address to sign in.",
  AUTH_EMAIL_NOT_CONFIRMED: "Please confirm your email address before logging in. Check your inbox.",

  // Ideas
  IDEA_SAVE_FAILED: "Couldn't save your idea. Check your connection and try again.",
  IDEA_DELETE_FAILED: "Couldn't delete this idea. It may have already been removed.",
  IDEA_UPDATE_FAILED: "Couldn't update the idea. Try refreshing the page.",
  IDEA_LOAD_FAILED: "We had trouble loading your ideas. Try refreshing the page.",
  IDEA_INVALID_URL: "Please enter a valid URL (starting with http:// or https://).",

  // Calendar
  PLAN_SCHEDULE_FAILED: "Couldn't schedule this to the calendar. Try dragging it again.",
  PLAN_MOVE_FAILED: "Couldn't move this item. Try refreshing the calendar.",
  PLAN_DELETE_FAILED: "Couldn't remove this from the calendar. Try again.",
  PLAN_LOAD_FAILED: "We couldn't load your calendar. Try refreshing the page.",

  // Listening
  TOPIC_CREATE_FAILED: "Couldn't create this topic. Make sure you've entered a name and keywords.",
  TOPIC_DELETE_FAILED: "Couldn't delete this topic. Try again.",
  TOPIC_UPDATE_FAILED: "Couldn't update this topic. Try refreshing the page.",
  TOPIC_LOAD_FAILED: "We couldn't load your topics. Try refreshing the page.",
  TOPIC_NOT_LISTENING_YET: "This topic is set up but hasn't run yet. The worker checks for new content daily.",

  // Network
  NETWORK_OFFLINE: "You appear to be offline. Check your internet connection and try again.",
  NETWORK_TIMEOUT: "The request timed out. Our servers might be busy — try again in a moment.",
  NETWORK_SERVER_ERROR: "Something went wrong on our end. We're looking into it — try again soon.",

  // Generic
  UNEXPECTED_ERROR: "Something unexpected happened. Please try again or refresh the page.",
  FORM_INCOMPLETE: "Please fill in all required fields before submitting.",
  NOT_AUTHENTICATED: "Please log in to continue.",
  PERMISSION_DENIED: "You don't have permission to do that. Try logging in again.",
};

/**
 * Returns a user-friendly error message.
 * @param {string} code — error code from ERROR_MAP
 * @param {object} context — optional context for interpolation or logging
 * @returns {string}
 */
export function friendlyError(code, context = {}) {
  const message = ERROR_MAP[code];
  if (!message) {
    // Unknown code: use the code itself as the message is better than nothing
    // but log it so we can add it to the map
    if (import.meta.env.DEV) {
      console.warn(`[errors] Unknown error code: ${code}. Add it to ERROR_MAP.`);
    }
    return ERROR_MAP.UNEXPECTED_ERROR;
  }
  return message;
}

/**
 * Maps common Supabase error to a friendly error code.
 * @param {object} error — the error from supabase.from().select() etc.
 * @returns {string} error code
 */
export function mapSupabaseError(error, operation) {
  if (!error) return null;

  const code = error?.code;
  const message = error?.message || "";

  // Auth errors
  if (code === "otp_expired" || message.includes("expired")) return "AUTH_LINK_EXPIRED";
  if (code === "invalid_credentials" || message.includes("Invalid login")) return "AUTH_FAILED";
  if (message.includes("Email not confirmed")) return "AUTH_EMAIL_NOT_CONFIRMED";

  // Network errors
  if (message.includes("fetch") || message.includes("network") || message.includes("timeout")) {
    return "NETWORK_OFFLINE";
  }

  // Permission errors
  if (code === "42501" || message.includes("policy") || message.includes("permission")) {
    return "PERMISSION_DENIED";
  }

  // Map by operation
  if (operation === "save-idea") return "IDEA_SAVE_FAILED";
  if (operation === "load-ideas") return "IDEA_LOAD_FAILED";
  if (operation === "delete-idea") return "IDEA_DELETE_FAILED";
  if (operation === "update-idea") return "IDEA_UPDATE_FAILED";
  if (operation === "schedule-plan") return "PLAN_SCHEDULE_FAILED";
  if (operation === "load-plans") return "PLAN_LOAD_FAILED";
  if (operation === "delete-plan") return "PLAN_DELETE_FAILED";
  if (operation === "create-topic") return "TOPIC_CREATE_FAILED";
  if (operation === "load-topics") return "TOPIC_LOAD_FAILED";
  if (operation === "delete-topic") return "TOPIC_DELETE_FAILED";

  return "UNEXPECTED_ERROR";
}

export { ERROR_MAP };
