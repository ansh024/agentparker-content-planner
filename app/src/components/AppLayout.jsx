import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import {
  Inbox, CalendarDays, Radio, Settings, LogOut,
  Menu, X, Plus, LayoutGrid, Keyboard,
} from "lucide-react";

const log = logger("AppLayout");

const navItems = [
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/board", icon: LayoutGrid, label: "Board" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/topics", icon: Radio, label: "Listening" },
];

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [quickUrl, setQuickUrl] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [inboxCount, setInboxCount] = useState(null);
  const [boardCounts, setBoardCounts] = useState({});

  // Fetch new idea count for badge
  useEffect(() => {
    if (!user) return;
    const fetchCounts = async () => {
      const { count } = await supabase
        .from("ideas")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "new");
      setInboxCount(count);
    };
    fetchCounts();
    // Subscribe to changes
    const channel = supabase
      .channel("idea-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `user_id=eq.${user.id}` }, fetchCounts)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setShowQuickCapture(false); setShowShortcuts(false); }
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) { setShowQuickCapture(true); }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) { setShowShortcuts((p) => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const quickSave = async (e) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setQuickSaving(true);
    const { error } = await supabase.from("ideas").insert({
      user_id: user.id, source_url: quickUrl.trim(), source_platform: "manual",
      context_text: quickNote.trim() || null, status: "new",
    });
    if (error) showToast("Couldn't save idea.", "error");
    else { showToast("Idea saved!", "success"); setQuickUrl(""); setQuickNote(""); setShowQuickCapture(false); }
    setQuickSaving(false);
  };

  return (
    <div className="flex min-h-screen relative">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 z-50 h-screen w-64 border-r bg-white dark:bg-gray-900 dark:border-gray-800 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none"><path d="M10 22V10l12 6-12 6z" fill="white" /></svg>
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-white">ContentPlanner</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 text-gray-400"><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"}`}>
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {to === "/inbox" && inboxCount > 0 && (
                <span className="rounded-full bg-brand-100 dark:bg-brand-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-300 leading-none">{inboxCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t dark:border-gray-800 p-2">
          <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 dark:bg-brand-900/20 text-brand-700" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
            <Settings className="h-4 w-4" /> Settings
          </NavLink>
          <button onClick={() => setShowShortcuts(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Keyboard className="h-4 w-4" /> Shortcuts
          </button>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 min-h-screen pb-16 lg:pb-0">
        <div className="sticky top-0 z-30 flex items-center justify-between bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-4 py-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-gray-600 dark:text-gray-400 min-w-[44px] min-h-[44px] flex items-center"><Menu className="h-6 w-6" /></button>
          <span className="text-sm font-bold text-gray-900 dark:text-white">ContentPlanner</span>
          <button onClick={() => setShowQuickCapture(true)} className="p-2 -mr-2 text-brand-600 min-w-[44px] min-h-[44px] flex items-center"><Plus className="h-6 w-6" /></button>
        </div>
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t dark:border-gray-800 lg:hidden">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 4).map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname.startsWith(to);
            return (
              <NavLink key={to} to={to} className={`flex flex-col items-center py-2 px-3 text-xs font-medium ${isActive ? "text-brand-600" : "text-gray-500 dark:text-gray-400"}`}>
                <Icon className="h-5 w-5 mb-0.5" />{label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Quick capture modal */}
      {showQuickCapture && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowQuickCapture(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Quick Capture</h2>
              <button onClick={() => setShowQuickCapture(false)} className="p-1 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={quickSave} className="space-y-3">
              <input type="url" required autoFocus value={quickUrl} onChange={(e) => setQuickUrl(e.target.value)} placeholder="Paste a URL..." className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2.5 text-sm" />
              <textarea value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="Add a quick note..." rows={2} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm" />
              <button type="submit" disabled={quickSaving || !quickUrl.trim()} className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{quickSaving ? "Saving..." : "Save idea"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="p-1 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[["N", "New idea"], ["1–5", "Filter by status"], ["?", "Toggle shortcuts"], ["Esc", "Close / deselect"]].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{desc}</span>
                  <kbd className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs font-mono text-gray-600 dark:text-gray-400 border dark:border-gray-700">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
