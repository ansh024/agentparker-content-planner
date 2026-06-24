import { useCallback, useEffect, useState } from "react";

/**
 * Tracks a one-time dismissal in localStorage (e.g. first-run tips).
 * @param {string} key - stable storage key, e.g. "cp.tips.inbox"
 * @returns {[boolean, () => void]} [dismissed, dismiss]
 */
export function useDismissible(key) {
  const storageKey = `cp.dismissed.${key}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return [dismissed, dismiss];
}
