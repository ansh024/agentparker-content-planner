import { useEffect, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import {
  Moon, Sun, Copy, Puzzle, Eye, EyeOff, Check, Loader2, KeyRound, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/common/PageHeader";
import { getSettings, saveSettings } from "@/lib/settings";

const KEY_META = [
  {
    key: "OPENROUTER_API_KEY",
    label: "OpenRouter API Key",
    description: "Enables Deep Research (~$0.90/run via Perplexity sonar-deep-research).",
    placeholder: "sk-or-v1-…",
    link: "https://openrouter.ai/keys",
    linkLabel: "Get key →",
  },
  {
    key: "FIRECRAWL_API_KEY",
    label: "Firecrawl API Key",
    description: "Web search & scraping for listening runs.",
    placeholder: "fc-…",
    link: "https://firecrawl.dev",
    linkLabel: "Get key →",
  },
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API Key",
    description: "AI enrichment and listening analysis (falls back to Claude subscription).",
    placeholder: "sk-ant-…",
    link: "https://console.anthropic.com/keys",
    linkLabel: "Get key →",
  },
  {
    key: "SCRAPECREATORS_API_KEY",
    label: "ScrapeCreators API Key",
    description: "Enables TikTok, Instagram, and Threads sources in listening runs.",
    placeholder: "sc-…",
    link: "https://scrapecreators.com",
    linkLabel: "Get key →",
  },
];

function ApiKeyField({ meta, value, onChange, revealed, onToggleReveal }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={meta.key} className="text-sm font-medium">
          {meta.label}
        </Label>
        {meta.link && (
          <a
            href={meta.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary hover:underline"
          >
            {meta.linkLabel}
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{meta.description}</p>
      <div className="relative">
        <Input
          id={meta.key}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta.placeholder}
          className="pr-10 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={onToggleReveal}
          aria-label={revealed ? "Hide key" : "Show key"}
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function ApiKeysCard() {
  const [values, setValues] = useState(Object.fromEntries(KEY_META.map((m) => [m.key, ""])));
  const [revealed, setRevealed] = useState(Object.fromEntries(KEY_META.map((m) => [m.key, false])));
  const [keyStatus, setKeyStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSettings()
      .then(({ settings, keyStatus: ks }) => {
        setValues(Object.fromEntries(KEY_META.map((m) => [m.key, settings[m.key] || ""])));
        setKeyStatus(ks || {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSettings(values);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Reload to get fresh masked values + keyStatus
      const fresh = await getSettings();
      setValues(Object.fromEntries(KEY_META.map((m) => [m.key, fresh.settings[m.key] || ""])));
      setKeyStatus(fresh.keyStatus || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">API Keys</CardTitle>
        </div>
        <CardDescription>
          Keys are stored securely in your account and injected into research runs.
          Leave a field blank to use the server default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {KEY_META.map((meta) => (
                <div key={meta.key} className="space-y-1.5">
                  <ApiKeyField
                    meta={meta}
                    value={values[meta.key]}
                    onChange={(v) => setValues((prev) => ({ ...prev, [meta.key]: v }))}
                    revealed={revealed[meta.key]}
                    onToggleReveal={() =>
                      setRevealed((prev) => ({ ...prev, [meta.key]: !prev[meta.key] }))
                    }
                  />
                  {keyStatus[meta.key] && (
                    <p className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                      <Check className="h-3 w-3" /> Key saved
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full gap-2"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : saved ? (
                <><Check className="h-4 w-4" /> Saved</>
              ) : (
                "Save API keys"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [copying, setCopying] = useState(false);

  const copyToken = async () => {
    setCopying(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("No active session.");
      await navigator.clipboard.writeText(token);
      showToast("Token copied — paste it into the extension popup.", "success");
    } catch (err) {
      showToast(err.message || "Could not copy token.", "error");
    } finally {
      setCopying(false);
    }
  };

  const isInstalled =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(display-mode: standalone)").matches;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader title="Settings" subtitle="Manage your API keys, appearance, and one-tap capture." />

      <div className="space-y-6">
        {/* API Keys */}
        <ApiKeysCard />

        {/* Appearance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Dark mode</p>
                <p className="text-xs text-muted-foreground">Switch between light and dark themes</p>
              </div>
              <div className="flex items-center gap-2">
                {theme === "dark"
                  ? <Moon className="h-4 w-4 text-muted-foreground" />
                  : <Sun className="h-4 w-4 text-amber-500" />}
                <Switch checked={theme === "dark"} onCheckedChange={toggle} aria-label="Toggle dark mode" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Capture */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Capture</CardTitle>
            <CardDescription>Save links to your inbox from any app on your phone — no bot, no setup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isInstalled && (
              <Alert variant="warning">
                <AlertDescription>
                  You're in a browser tab. Install ContentPlanner to your home screen to enable sharing from other apps.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-lg">📲</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">1. Install on your phone</p>
                  <p className="text-xs text-muted-foreground">
                    Open this site in your mobile browser, tap <strong>Share</strong> / <strong>⋯</strong>, then <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-lg">🔗</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">2. Share to your inbox</p>
                  <p className="text-xs text-muted-foreground">
                    From any app (Instagram, YouTube, TikTok, your browser), tap <strong>Share → ContentPlanner</strong> to save a link straight to your inbox.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="text-sm font-medium text-foreground">{user?.email}</p>
          </CardContent>
        </Card>

        {/* Connect extension */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Puzzle className="h-4 w-4" /> Connect extension
            </CardTitle>
            <CardDescription>
              The ContentPlanner Chrome extension drafts on-voice LinkedIn comments. Copy your token and paste it into the extension popup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" onClick={copyToken} disabled={copying}>
              <Copy className="mr-1.5 h-4 w-4" /> {copying ? "Copying…" : "Copy access token"}
            </Button>
            <p className="text-xs text-muted-foreground">
              The token is tied to your current session and stays only in the extension. Re-copy it if your session changes.
            </p>
          </CardContent>
        </Card>

        {/* Keyboard shortcuts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Keyboard shortcuts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["N", "New idea"],
                ["1–5", "Filter by status"],
                ["Esc", "Close / deselect"],
                ["?", "Toggle shortcuts"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-2">
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{key}</kbd>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
