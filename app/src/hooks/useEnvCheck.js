/**
 * Environment validation hook.
 * Warns the user in dev mode if critical env vars are missing.
 */
import { useEffect } from "react";
import { useToast } from "./ToastContext";

const CRITICAL_VARS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

export function useEnvCheck() {
  const { showToast } = useToast();

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const missing = CRITICAL_VARS.filter((key) => !import.meta.env[key]);
    if (missing.length > 0) {
      showToast(
        `Missing env vars: ${missing.join(", ")}. Copy app/.env.example to app/.env and fill in your Supabase keys.`,
        "warning",
        10000
      );
    }
  }, []);
}
