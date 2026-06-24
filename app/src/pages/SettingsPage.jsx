import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { Moon, Sun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/common/PageHeader";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const isInstalled =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(display-mode: standalone)").matches;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader title="Settings" subtitle="Personalize ContentPlanner and set up one-tap capture." />

      <div className="space-y-6">
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
