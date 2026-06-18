import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";
import { detectPlatform, resolveSharePayload } from "../lib/shareTarget";

const log = logger("SharePage");
const PENDING_SHARE_KEY = "pendingShare";

function getPendingShare() {
  try {
    const raw = sessionStorage.getItem(PENDING_SHARE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setPendingShare(payload) {
  sessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(payload));
}

function clearPendingShare() {
  sessionStorage.removeItem(PENDING_SHARE_KEY);
}

export default function SharePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Saving shared link...");
  const saveStarted = useRef(false);

  const sharedPayload = useMemo(() => {
    const resolved = resolveSharePayload(searchParams);
    const pending = getPendingShare();
    return resolved.url ? resolved : { url: pending?.url || "", title: pending?.title || "", text: pending?.text || "" };
  }, [searchParams]);

  useEffect(() => {
    if (authLoading || saveStarted.current) return;

    if (!sharedPayload.url) {
      setStatus("no-url");
      setMessage("No link found. Share a URL to save it.");
      return;
    }

    if (!user) {
      setPendingShare(sharedPayload);
      navigate("/login?next=/share", { replace: true });
      return;
    }

    saveStarted.current = true;

    async function saveShare() {
      clearPendingShare();
      setStatus("loading");
      setMessage("Importing shared post...");
      log.info("Importing shared link", { url: sharedPayload.url });

      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          url: sharedPayload.url,
          platform: detectPlatform(sharedPayload.url),
          shared_title: sharedPayload.title,
          shared_text: sharedPayload.text,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        log.error("Failed to import shared link", payload);
        setStatus("error");
        setMessage(payload.error || "Couldn't import this shared link.");
        return;
      }

      setStatus("saved");
      setMessage(
        payload.import_status === "import_failed"
          ? "Saved to your inbox, but media import needs attention."
          : "Imported to your inbox.",
      );
      window.setTimeout(() => navigate("/inbox", { replace: true }), 1500);
    }

    saveShare();
  }, [authLoading, navigate, sharedPayload, user]);

  const icon =
    status === "saved" ? (
      <CheckCircle2 className="h-10 w-10 text-green-600" />
    ) : status === "error" || status === "no-url" ? (
      <AlertCircle className="h-10 w-10 text-amber-600" />
    ) : (
      <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          {icon}
        </div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {status === "saved" ? "Saved!" : status === "no-url" ? "No link found" : status === "error" ? "Couldn't save" : "Saving..."}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
      </div>
    </div>
  );
}
