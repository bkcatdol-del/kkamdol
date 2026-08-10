/**
 * Writer approval-code handling.
 *
 * Friction rule: the server (RPC) verifies the code on every write, but the
 * user only ever TYPES it once per device. Once verified it's kept in
 * localStorage and auto-attached to writes. A magic link (#code=...) can seed
 * it with zero typing.
 */
import { supabase } from "./supabase";

const KEY = "kkamdol.writer_code";

export function getStoredCode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* ignore private-mode storage errors */
  }
}

export function clearCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isUnlocked(): boolean {
  return Boolean(getStoredCode());
}

/** Ask the server whether a code is currently valid. */
export async function verifyCode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("verify_code", { p_code: code });
  if (error) return false;
  return data === true;
}

/**
 * On page load: if the URL carries #code=... (or ?code=...), verify and store
 * it, then strip it from the URL so it doesn't linger in history.
 */
export async function captureMagicLink(): Promise<void> {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  const code = hash.get("code") ?? query.get("code");
  if (!code) return;

  if (await verifyCode(code)) storeCode(code);

  hash.delete("code");
  query.delete("code");
  const newHash = hash.toString();
  const newQuery = query.toString();
  const clean =
    location.pathname + (newQuery ? `?${newQuery}` : "") + (newHash ? `#${newHash}` : "");
  history.replaceState(null, "", clean);
}
