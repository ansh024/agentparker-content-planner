import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../lib/logger";
import { friendlyError } from "../lib/errors";
import { Eye, EyeOff } from "lucide-react";

const log = logger("LoginPage");

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState("password"); // "password" | "magic" | "signup"
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const { user, signIn, signInWithPassword, signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawNextPath = searchParams.get("next") || "/inbox";
  const nextPath = rawNextPath.startsWith("/") && !rawNextPath.startsWith("//") ? rawNextPath : "/inbox";

  useEffect(() => {
    if (user) navigate(nextPath, { replace: true });
  }, [navigate, nextPath, user]);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(friendlyError("FORM_INCOMPLETE"));
      return;
    }
    setLoading(true);
    log.info("Password login attempt", { email: email.trim() });

    const { error: err } = await signInWithPassword(email.trim(), password);
    if (err) {
      log.error("Password login failed", { error: err });
      if (err.message?.includes("Invalid login")) {
        setError("Invalid email or password. Try again or use magic link instead.");
      } else if (err.message?.includes("Email not confirmed")) {
        setError("Please check your email and confirm your account first.");
      } else {
        setError("Login failed. Check your credentials and try again.");
      }
    }
    setLoading(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(friendlyError("FORM_INCOMPLETE"));
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    log.info("Sign-up attempt", { email: email.trim() });

    const { error: err } = await signUp(email.trim(), password, nextPath);
    if (err) {
      log.error("Sign-up failed", { error: err });
      if (err.message?.includes("already registered")) {
        setError("An account with this email already exists. Try logging in instead.");
      } else {
        setError("Couldn't create your account. Try a different email.");
      }
    } else {
      log.info("Sign-up successful");
      setSent(true);
    }
    setLoading(false);
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError(friendlyError("AUTH_NO_EMAIL")); return; }
    setLoading(true);
    log.info("Magic link attempt", { email: email.trim() });
    const { error: err } = await signIn(email.trim(), nextPath);
    if (err) {
      log.error("Magic link failed", { error: err });
      setError("Couldn't send the login link. Try password login instead.");
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M10 22V10l12 6-12 6z" fill="white" /></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">ContentPlanner</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Never lose an idea again</p>
        </div>

        {sent && mode === "magic" ? (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-5 text-center">
            <div className="mb-2 text-2xl">📧</div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-200">We've sent you a login link</p>
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">Can't find it? Check spam or try password login.</p>
            <button onClick={() => { setSent(false); setMode("password"); }} className="mt-3 text-xs text-green-700 dark:text-green-300 underline">Use password instead</button>
          </div>
        ) : sent && mode === "signup" ? (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-5 text-center">
            <div className="mb-2 text-2xl">✅</div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-200">Account created!</p>
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">Check your email to confirm, then log in.</p>
            <button onClick={() => { setSent(false); setMode("password"); }} className="mt-3 text-xs text-green-700 dark:text-green-300 underline">Go to login</button>
          </div>
        ) : (
          <form onSubmit={mode === "signup" ? handleSignUp : mode === "magic" ? handleMagicLink : handlePasswordLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email address</label>
              <input id="email" type="email" required value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                placeholder="you@gmail.com" inputMode="email" autoComplete="email" autoFocus
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-4 py-3 text-base shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>

            {(mode === "password" || mode === "signup") && (
              <div className="relative">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <input id="password" type={showPassword ? "text" : "password"} required value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-4 py-3 pr-12 text-base shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 min-w-[32px] min-h-[32px]">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading || !email.trim() || ((mode === "password" || mode === "signup") && !password)}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-50 min-h-[48px]">
              {loading ? "Please wait..." : mode === "signup" ? "Create account" : mode === "magic" ? "Send magic link" : "Sign in"}
            </button>

            {/* Mode toggles */}
            <div className="flex flex-col gap-2 pt-2 text-center text-xs">
              {mode === "password" && (
                <>
                  <button type="button" onClick={() => setMode("magic")} className="text-gray-500 dark:text-gray-400 hover:text-brand-600 hover:underline">Sign in with magic link instead</button>
                  <button type="button" onClick={() => setMode("signup")} className="text-gray-500 dark:text-gray-400 hover:text-brand-600 hover:underline">Don't have an account? Sign up</button>
                </>
              )}
              {mode === "magic" && (
                <button type="button" onClick={() => setMode("password")} className="text-gray-500 dark:text-gray-400 hover:text-brand-600 hover:underline">Sign in with password instead</button>
              )}
              {mode === "signup" && (
                <button type="button" onClick={() => setMode("password")} className="text-gray-500 dark:text-gray-400 hover:text-brand-600 hover:underline">Already have an account? Sign in</button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
