import { supabase } from "./supabase";
import type { MediaKind } from "./validation";

// ---- Row types (match the public views; no password_hash) -----------------
export interface EventRow {
  id: string;
  title: string;
  body: string | null;
  event_date: string | null;
  author_nick: string;
  heart: string;
  link_url: string | null;
  status: string;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export interface MediaRow {
  id: string;
  event_id: string | null;
  kind: MediaKind;
  storage_path: string | null;
  embed_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  author_nick: string;
  status: string;
  report_count: number;
  created_at: string;
}

export interface CommentRow {
  id: string;
  event_id: string | null;
  media_id: string | null;
  author_nick: string;
  body: string;
  status: string;
  report_count: number;
  created_at: string;
  updated_at: string;
}

// ---- Reads ----------------------------------------------------------------
export async function listEvents(limit = 50): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events_public")
    .select("*")
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase.from("events_public").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMedia(limit = 60): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("media_public")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listMediaForEvent(eventId: string): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("media_public")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listComments(
  target: { eventId?: string; mediaId?: string }
): Promise<CommentRow[]> {
  let q = supabase.from("comments_public").select("*").order("created_at", { ascending: true });
  q = target.eventId ? q.eq("event_id", target.eventId) : q.eq("media_id", target.mediaId!);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ---- Writes (approval-code gated; server re-verifies) ---------------------
export async function createEvent(
  code: string,
  input: {
    title: string;
    body: string;
    eventDate: string | null;
    nick: string;
    password: string;
    heart: string;
    link: string;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("create_event", {
    p_code: code,
    p_title: input.title,
    p_body: input.body,
    p_event_date: input.eventDate,
    p_nick: input.nick,
    p_password: input.password,
    p_heart: input.heart,
    p_link: input.link,
  });
  if (error) throw error;
  return data as string;
}

export async function createMedia(
  code: string,
  input: {
    eventId: string | null;
    kind: MediaKind;
    storagePath: string | null;
    embedUrl: string | null;
    mimeType: string | null;
    byteSize: number | null;
    caption: string;
    nick: string;
    password: string;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("create_media", {
    p_code: code,
    p_event_id: input.eventId,
    p_kind: input.kind,
    p_storage_path: input.storagePath,
    p_embed_url: input.embedUrl,
    p_mime_type: input.mimeType,
    p_byte_size: input.byteSize,
    p_caption: input.caption,
    p_nick: input.nick,
    p_password: input.password,
  });
  if (error) throw error;
  return data as string;
}

export interface BulkRow {
  title: string;
  body: string;
  event_date: string; // YYYY-MM-DD or ""
  heart: string;
  link: string;
}

export async function createEventsBulk(
  code: string,
  nick: string,
  password: string,
  rows: BulkRow[]
): Promise<number> {
  const { data, error } = await supabase.rpc("create_events_bulk", {
    p_code: code,
    p_nick: nick,
    p_password: password,
    p_rows: rows,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function createComment(
  code: string,
  input: { eventId?: string; mediaId?: string; nick: string; password: string; body: string }
): Promise<string> {
  const { data, error } = await supabase.rpc("create_comment", {
    p_code: code,
    p_event_id: input.eventId ?? null,
    p_media_id: input.mediaId ?? null,
    p_nick: input.nick,
    p_password: input.password,
    p_body: input.body,
  });
  if (error) throw error;
  return data as string;
}

// ---- Author self-service (password) ---------------------------------------
export async function deleteComment(id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_comment", { p_id: id, p_password: password });
  if (error) throw error;
  return data === true;
}

export async function updateComment(id: string, password: string, body: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("update_comment", {
    p_id: id,
    p_password: password,
    p_body: body,
  });
  if (error) throw error;
  return data === true;
}

export async function deleteEvent(id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_event", { p_id: id, p_password: password });
  if (error) throw error;
  return data === true;
}

export async function updateEvent(
  id: string,
  password: string,
  input: { title: string; body: string; eventDate: string | null; heart?: string; link?: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc("update_event", {
    p_id: id,
    p_password: password,
    p_title: input.title,
    p_body: input.body,
    p_event_date: input.eventDate,
    p_heart: input.heart ?? null,
    p_link: input.link ?? null,
  });
  if (error) throw error;
  return data === true;
}

export async function deleteMedia(id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_media", { p_id: id, p_password: password });
  if (error) throw error;
  return data === true;
}

// ---- Reporting ------------------------------------------------------------
export type ReportTable = "event" | "media" | "comment";
export async function reportContent(table: ReportTable, id: string): Promise<void> {
  const { error } = await supabase.rpc("report_content", { p_table: table, p_id: id });
  if (error) throw error;
}

// ---- Admin ----------------------------------------------------------------
export async function adminDelete(key: string, table: ReportTable, id: string): Promise<boolean> {
  const fn = { event: "admin_delete_event", media: "admin_delete_media", comment: "admin_delete_comment" }[table];
  const { data, error } = await supabase.rpc(fn, { p_key: key, p_id: id });
  if (error) throw error;
  return data === true;
}

export async function adminSetStatus(
  key: string,
  table: ReportTable,
  id: string,
  status: "visible" | "hidden" | "flagged"
): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_set_status", {
    p_key: key,
    p_table: table,
    p_id: id,
    p_status: status,
  });
  if (error) throw error;
  return data === true;
}

export interface CodeRow {
  id: string;
  role: string;
  label: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

export async function adminListCodes(key: string): Promise<CodeRow[]> {
  const { data, error } = await supabase.rpc("admin_list_codes", { p_key: key });
  if (error) throw error;
  return (data as CodeRow[]) ?? [];
}

export async function adminAddCode(
  key: string,
  input: { code: string; role: "writer" | "admin"; label: string; expiresAt: string | null }
): Promise<string> {
  const { data, error } = await supabase.rpc("admin_add_code", {
    p_key: key,
    p_new_code: input.code,
    p_role: input.role,
    p_label: input.label,
    p_expires_at: input.expiresAt,
  });
  if (error) throw error;
  return data as string;
}

export async function adminRevokeCode(key: string, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_revoke_code", { p_key: key, p_code_id: id });
  if (error) throw error;
  return data === true;
}
