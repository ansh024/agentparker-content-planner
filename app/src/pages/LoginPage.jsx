import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../lib/logger";
import { friendlyError } from "../lib/errors";

const log = logger("LoginPage");

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(friendlyError("AUTH_NO_EMAIL"));
      return;
    }

    setLoading(true);
    log.info("Sign-in attempt", { email: email.trim() });

    const { error: err } = await signIn(email.trim());

    if (err) {
      log.error("Sign-in failed", { error: err });
      if (err.message?.includes("Email not confirmed")) {
        setError(friendlyError("AUTH_EMAIL_NOT_CONFIRMED"));
      } else if (err.message?.includes("Invalid")) {
        setError(friendlyError("AUTH_INVALID_EMAIL"));
      } else {
        setError(friendlyError("AUTH_FAILED"));
      }
    } else {
      log.info("Magic link sent successfully");
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M10 22V10l12 6-12 6z" fill="white" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">ContentPlanner</h1>
          <p className="mt-1 text-sm text-gray-500">Never lose an idea again</p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-center">
            <div className="mb-2 text-2xl">📧</div>
            <p className="text-sm font-semibold text-green-800">{friendlyError("AUTH_LINK_SENT")}</p>
            <p className="mt-2 text-xs text-green-600">
              Can't find it? Check spam, or try a different email.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-3 text-xs text-green-700 underline hover:no-underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="you@gmail.com"
                inputMode="email"
                autoComplete="email"
                autoFocus
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
                {error.includes("Auth") && (
                  <p className="mt-1 text-xs text-red-500">
                    Make sure email sign-in is enabled in your Supabase dashboard → Authentication → Providers → Email.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-50 min-h-[48px]"
            >
              {loading ? "Sending link..." : "Send magic link"}
            </button>

            <p className="text-center text-xs text-gray-400">
              No password needed. We'll email you a login link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
