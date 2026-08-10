/**
 * Admin-key handling. Same friction rule as writer codes: typed once per
 * device, kept in localStorage, verified server-side on every admin action.
 * Magic link: #adminkey=...
 */
import { supabase } from "./supabase";

const KEY = "kkamdol.admin_key";

export function getStoredAdminKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeAdminKey(key: string): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* ignore */
  }
}

export function clearAdminKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isAdminUnlocked(): boolean {
  return Boolean(getStoredAdminKey());
}

export async function verifyAdmin(key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("verify_admin", { p_key: key });
  if (error) return false;
  return data === true;
}

export async function captureAdminMagicLink(): Promise<void> {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  const key = hash.get("adminkey") ?? query.get("adminkey");
  if (!key) return;

  if (await verifyAdmin(key)) storeAdminKey(key);

  hash.delete("adminkey");
  query.delete("adminkey");
  const newHash = hash.toString();
  const newQuery = query.toString();
  const clean =
    location.pathname + (newQuery ? `?${newQuery}` : "") + (newHash ? `#${newHash}` : "");
  history.replaceState(null, "", clean);
}
