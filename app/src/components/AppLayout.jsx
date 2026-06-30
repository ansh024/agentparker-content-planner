import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import {
  Inbox, CalendarDays, Radio, Settings, LogOut,
  Menu, X, Plus, LayoutGrid, Keyboard, Download, BookOpen, Mic, PenLine, LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import HelpButton from "@/components/common/HelpButton";

const log = logger("AppLayout");

const navItems = [
  { to: "/today", icon: LayoutDashboard, label: "Today" },
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/board", icon: LayoutGrid, label: "Board" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/topics", icon: Radio, label: "Listening" },
  { to: "/drafts", icon: PenLine, label: "Drafts" },
  { to: "/knowledgebase", icon: BookOpen, label: "Knowledgebase" },
];

const SHORTCUTS = [
  ["N", "New idea"],
  ["1–5", "Filter by status"],
  ["?", "Toggle shortcuts"],
  ["Esc", "Close / deselect"],
];

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [quickUrl, setQuickUrl] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [inboxCount, setInboxCount] = useState(null);

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
    const channel = supabase
      .channel("idea-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `user_id=eq.${user.id}` }, fetchCounts)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  useEffect(() => {
    const beforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", beforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", beforeInstallPrompt);
  }, []);

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

  const installApp = async () => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isStandalone) {
      showToast("ContentPlanner is already installed.", "info");
      return;
    }
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") showToast("ContentPlanner installed.", "success");
  };

  const sidebarLink = ({ isActive }) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    );

  return (
    <div className="relative flex min-h-screen">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 z-50 flex h-screen w-64 flex-col border-r bg-card transition-transform lg:sticky lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none"><path d="M10 22V10l12 6-12 6z" fill="white" /></svg>
            </div>
            <span className="text-sm font-bold text-foreground">ContentPlanner</span>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={sidebarLink}>
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {to === "/inbox" && inboxCount > 0 && (
                <Badge className="h-5 px-1.5 text-[10px] leading-none">{inboxCount}</Badge>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-0.5 border-t p-2">
          <NavLink to="/voice" className={sidebarLink}>
            <Mic className="h-4 w-4" /> Voice
          </NavLink>
          <NavLink to="/settings" className={sidebarLink}>
            <Settings className="h-4 w-4" /> Settings
          </NavLink>
          <button onClick={() => setShowShortcuts(true)} className={cn(sidebarLink({ isActive: false }), "w-full")}>
            <Keyboard className="h-4 w-4" /> Shortcuts
          </button>
          <button onClick={installApp} className={cn(sidebarLink({ isActive: false }), "w-full")}>
            <Download className="h-4 w-4" /> Install app
          </button>
          <button onClick={signOut} className={cn(sidebarLink({ isActive: false }), "w-full")}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="min-h-screen flex-1 overflow-y-auto bg-background pb-16 lg:pb-0">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-card px-2 py-2 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </Button>
          <span className="text-sm font-bold text-foreground">ContentPlanner</span>
          <div className="flex items-center">
            <HelpButton />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={installApp} aria-label="Install app">
                  <Download className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Install app</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-primary" onClick={() => setShowQuickCapture(true)} aria-label="Quick capture">
                  <Plus className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Quick capture</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card lg:hidden">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 4).map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname.startsWith(to);
            return (
              <NavLink key={to} to={to} className={cn("flex flex-col items-center px-3 py-2 text-xs font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
                <Icon className="mb-0.5 h-5 w-5" />{label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Quick capture modal */}
      <Dialog open={showQuickCapture} onOpenChange={setShowQuickCapture}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick capture</DialogTitle>
            <DialogDescription>Save a link or note straight to your Inbox.</DialogDescription>
          </DialogHeader>
          <form onSubmit={quickSave} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qc-url">URL</Label>
              <Input id="qc-url" type="url" required autoFocus value={quickUrl} onChange={(e) => setQuickUrl(e.target.value)} placeholder="Paste a URL…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-note">Note <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="qc-note" value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="Add a quick note…" rows={2} />
            </div>
            <Button type="submit" disabled={quickSaving || !quickUrl.trim()} className="w-full">
              {quickSaving ? "Saving…" : "Save idea"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Install help modal */}
      <Dialog open={showInstallHelp} onOpenChange={setShowInstallHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Install ContentPlanner</DialogTitle>
            <DialogDescription>Add it to your home screen for one-tap capture.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Android Chrome</p>
              <p className="mt-1">Open the browser menu, then tap Add to Home screen or Install app.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">iPhone Safari</p>
              <p className="mt-1">Tap Share, then Add to Home Screen.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowInstallHelp(false)} className="w-full">Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortcuts modal */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {SHORTCUTS.map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{desc}</span>
                <kbd className="rounded-md border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
