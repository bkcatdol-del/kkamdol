import { createClient } from "@supabase/supabase-js";

// Public by design (protected by Row Level Security + the write RPCs). Use ||
// (not ??) so an EMPTY-STRING env var — which is what an unset GitHub Actions
// variable expands to at build time — still falls back to these baked-in values.
const url =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://iswndlocksmwsaaqcezn.supabase.co";
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "sb_publishable_xB69YBCEKFzPGHkiVT4Ncw_BKIBZkfK";

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});

/** Public URL for a stored object in the `media` bucket. */
export function mediaUrl(path: string): string {
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}
