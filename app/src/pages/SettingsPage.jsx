import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { Moon, Sun } from "lucide-react";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const isInstalled =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(display-mode: standalone)").matches;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Appearance */}
        <section className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Dark mode</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Switch between light and dark themes</p>
            </div>
            <button
              onClick={toggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                theme === "dark" ? "bg-brand-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-white transition-transform ${
                  theme === "dark" ? "translate-x-6" : "translate-x-1"
                }`}
              >
                {theme === "dark" ? <Moon className="h-2.5 w-2.5 text-brand-600" /> : <Sun className="h-2.5 w-2.5 text-amber-500" />}
              </span>
            </button>
          </div>
        </section>

        {/* Capture */}
        <section className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Capture</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Save links to your inbox from any app on your phone — no bot, no setup.
          </p>

          {!isInstalled && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                You're in a browser tab. Install ContentPlanner to your home screen to enable sharing from other apps.
              </p>
            </div>
          )}

          {/* Step 1 — install */}
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
                <span className="text-lg">📲</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">1. Install on your phone</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Open this site in your mobile browser, tap <strong>Share</strong> / <strong>⋯</strong>, then{" "}
                  <strong>Add to Home Screen</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Step 2 — share */}
          <div className="mt-3 rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
                <span className="text-lg">🔗</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">2. Share to your inbox</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  From any app (Instagram, YouTube, TikTok, your browser), tap{" "}
                  <strong>Share → ContentPlanner</strong> to save a link straight to your inbox.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Account</h2>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
            <p className="text-sm text-gray-900 dark:text-white font-medium">{user?.email}</p>
          </div>
        </section>

        {/* Keyboard shortcuts */}
        <section className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Keyboard Shortcuts</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["N", "New idea"],
              ["1–5", "Filter by status"],
              ["Esc", "Close / deselect"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-mono text-gray-600 dark:text-gray-400 border dark:border-gray-600">
                  {key}
                </kbd>
                <span className="text-gray-600 dark:text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
