import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { Moon, Sun, Link, Check, Copy } from "lucide-react";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [linkCode, setLinkCode] = useState("");

  const generateLinkCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setLinkCode(code);
    // Store code temporarily — user sends this to the bot
    showToast(`Your link code is ${code}. Send this to the Telegram bot to connect.`, "info", 8000);
  };

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

        {/* Connected Accounts */}
        <section className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Connected Accounts</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Connect accounts to capture ideas from different platforms.
          </p>

          {/* Telegram */}
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <span className="text-lg">✈️</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Telegram Bot</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Forward links to @contentplannerbot to save them instantly
                  </p>
                </div>
              </div>
              {telegramLinked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-800 dark:text-green-300">
                  <Check className="h-3 w-3" /> Connected
                </span>
              ) : (
                <button
                  onClick={generateLinkCode}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Connect
                </button>
              )}
            </div>

            {linkCode && (
              <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>Step 1:</strong> Open Telegram and send <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/start {linkCode}</code> to <strong>@contentplannerbot</strong>
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
                  <strong>Step 2:</strong> Once confirmed, click Verify below.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`/start ${linkCode}`);
                      showToast("Copied! Paste in Telegram.", "success");
                    }}
                    className="inline-flex items-center gap-1 rounded bg-blue-200 dark:bg-blue-800 px-2 py-1 text-xs text-blue-800 dark:text-blue-200 hover:bg-blue-300"
                  >
                    <Copy className="h-3 w-3" /> Copy code
                  </button>
                  <button
                    onClick={() => {
                      setTelegramLinked(true);
                      setLinkCode("");
                      showToast("Telegram bot connected!", "success");
                    }}
                    className="rounded bg-blue-200 dark:bg-blue-800 px-2 py-1 text-xs text-blue-800 dark:text-blue-200 hover:bg-blue-300"
                  >
                    I've sent the command
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Instagram placeholder */}
          <div className="mt-3 rounded-lg border dark:border-gray-700 p-4 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900/30">
                  <span className="text-lg">📸</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Instagram</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">DM reels to your connected business account (coming soon)</p>
                </div>
              </div>
              <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                Coming soon
              </span>
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
