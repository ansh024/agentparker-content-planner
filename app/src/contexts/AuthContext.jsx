import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

const log = logger("AuthContext");
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    log.debug("Initializing auth session");

    supabase.auth.getSession().then(({ data: { session }, error: err }) => {
      if (err) {
        log.error("Failed to get session", { error: err });
        setError("Could not restore your session. Please log in again.");
      } else {
        log.info(session ? "Session restored" : "No active session");
      }
      setSession(session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      log.info("Auth state changed", { event });
      setSession(session);

      if (event === "SIGNED_OUT") {
        log.debug("User signed out — clearing state");
      }
      if (event === "TOKEN_REFRESHED") {
        log.debug("Auth token refreshed");
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email) => {
    log.debug("Initiating magic link sign-in");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + "/inbox",
      },
    });
    return { error };
  };

  const signOut = async () => {
    log.info("Signing out");
    const { error } = await supabase.auth.signOut();
    if (error) {
      log.error("Sign-out failed", { error });
    }
  };

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    error,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
