import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

const log = logger("AuthContext");
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    log.debug("Initializing auth session");
    supabase.auth.getSession().then(({ data: { session }, error: err }) => {
      if (err) log.error("Failed to get session", { error: err });
      else log.info(session ? "Session restored" : "No active session");
      setSession(session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      log.info("Auth state changed", { event });
      setSession(session);
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  const signInWithPassword = async (email, password) => {
    log.info("Password sign-in attempt", { email });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signUp = async (email, password) => {
    log.info("Sign-up attempt", { email });
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + "/inbox" },
    });
    return { data, error };
  };

  const signInWithMagicLink = async (email) => {
    log.debug("Magic link sign-in attempt");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/inbox" },
    });
    return { error };
  };

  const signOut = async () => {
    log.info("Signing out");
    await supabase.auth.signOut();
  };

  const value = {
    session, user: session?.user ?? null, loading,
    signIn: signInWithMagicLink,
    signInWithPassword,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
