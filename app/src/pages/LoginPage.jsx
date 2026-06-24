import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../lib/logger";
import { friendlyError } from "../lib/errors";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    if (!email.trim() || !password) { setError(friendlyError("FORM_INCOMPLETE")); return; }
    setLoading(true);
    log.info("Password login attempt", { email: email.trim() });
    const { error: err } = await signInWithPassword(email.trim(), password);
    if (err) {
      log.error("Password login failed", { error: err });
      if (err.message?.includes("Invalid login")) setError("Invalid email or password. Try again or use magic link instead.");
      else if (err.message?.includes("Email not confirmed")) setError("Please check your email and confirm your account first.");
      else setError("Login failed. Check your credentials and try again.");
    }
    setLoading(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError(friendlyError("FORM_INCOMPLETE")); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    log.info("Sign-up attempt", { email: email.trim() });
    const { error: err } = await signUp(email.trim(), password, nextPath);
    if (err) {
      log.error("Sign-up failed", { error: err });
      if (err.message?.includes("already registered")) setError("An account with this email already exists. Try logging in instead.");
      else setError("Couldn't create your account. Try a different email.");
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

  const linkBtn = "text-muted-foreground transition-colors hover:text-primary hover:underline";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M10 22V10l12 6-12 6z" fill="white" /></svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">ContentPlanner</h1>
          <p className="mt-1 text-sm text-muted-foreground">Never lose an idea again</p>
        </div>

        {sent && (mode === "magic" || mode === "signup") ? (
          <Alert variant="info" className="text-center">
            <AlertDescription>
              <div className="mb-2 text-2xl">{mode === "magic" ? "📧" : "✅"}</div>
              <p className="text-sm font-semibold text-foreground">
                {mode === "magic" ? "We've sent you a login link" : "Account created!"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {mode === "magic" ? "Can't find it? Check spam or try password login." : "Check your email to confirm, then log in."}
              </p>
              <Button variant="link" size="sm" className="mt-2" onClick={() => { setSent(false); setMode("password"); }}>
                {mode === "magic" ? "Use password instead" : "Go to login"}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={mode === "signup" ? handleSignUp : mode === "magic" ? handleMagicLink : handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" type="email" required value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                    placeholder="you@gmail.com" inputMode="email" autoComplete="email" autoFocus className="h-12" />
                </div>

                {(mode === "password" || mode === "signup") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} required value={password}
                        onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                        placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        className="h-12 pr-12" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="h-12 w-full text-base"
                  disabled={loading || !email.trim() || ((mode === "password" || mode === "signup") && !password)}>
                  {loading ? "Please wait…" : mode === "signup" ? "Create account" : mode === "magic" ? "Send magic link" : "Sign in"}
                </Button>

                <div className="flex flex-col gap-2 pt-1 text-center text-xs">
                  {mode === "password" && (
                    <>
                      <button type="button" onClick={() => setMode("magic")} className={linkBtn}>Sign in with magic link instead</button>
                      <button type="button" onClick={() => setMode("signup")} className={linkBtn}>Don't have an account? Sign up</button>
                    </>
                  )}
                  {mode === "magic" && (
                    <button type="button" onClick={() => setMode("password")} className={linkBtn}>Sign in with password instead</button>
                  )}
                  {mode === "signup" && (
                    <button type="button" onClick={() => setMode("password")} className={linkBtn}>Already have an account? Sign in</button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
