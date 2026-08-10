import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

// The anon key is public by design; RLS + the write RPCs protect the data.
export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder-anon-key",
  { auth: { persistSession: false } }
);

/** Public URL for a stored object in the `media` bucket. */
export function mediaUrl(path: string): string {
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}
