import { supabase } from "./supabase";

async function authToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export async function getSettings() {
  const token = await authToken();
  const res = await fetch("/api/settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function saveSettings(settings) {
  const token = await authToken();
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}
