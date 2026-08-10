-- ============================================================
-- kkamdol 아카이브 · Supabase 설치 스크립트 (한 번에 실행)
-- Supabase 대시보드 → SQL Editor → New query 에 전체 붙여넣고 Run
-- ⚠️ 이 파일에는 승인코드/관리자키가 들어 있으니 공개하지 마세요.
-- ============================================================

-- ####################  supabase/migrations/0001_schema.sql  ####################
-- 0001_schema.sql
-- Tables, extensions, indexes for the kkamdol archive.
-- pgcrypto is used for bcrypt password/code hashing (crypt / gen_salt).
-- On Supabase, extensions live in the `extensions` schema by convention.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- access_codes: writer approval codes AND admin keys, stored as bcrypt hashes.
-- This table is NEVER exposed to the anon client (RLS enabled, no policies).
-- Only SECURITY DEFINER functions read/write it.
-- ---------------------------------------------------------------------------
create table if not exists public.access_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text        not null,
  role        text        not null default 'writer' check (role in ('writer', 'admin')),
  label       text,
  expires_at  timestamptz,
  revoked     boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events: the timeline of things that happened.
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null check (char_length(title) between 1 and 200),
  body          text        check (body is null or char_length(body) <= 5000),
  event_date    date,
  author_nick   text        not null check (char_length(author_nick) between 1 and 40),
  password_hash text        not null,
  status        text        not null default 'visible' check (status in ('visible', 'hidden', 'flagged')),
  report_count  int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- media: uploaded images/gifs, or external video embeds. Optionally attached
-- to an event.
-- ---------------------------------------------------------------------------
create table if not exists public.media (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid        references public.events(id) on delete set null,
  kind          text        not null check (kind in ('image', 'gif', 'video_file', 'video_embed')),
  storage_path  text,
  embed_url     text,
  mime_type     text,
  byte_size     bigint,
  width         int,
  height        int,
  caption       text        check (caption is null or char_length(caption) <= 500),
  author_nick   text        not null check (char_length(author_nick) between 1 and 40),
  password_hash text        not null,
  status        text        not null default 'visible' check (status in ('visible', 'hidden', 'flagged')),
  report_count  int         not null default 0,
  created_at    timestamptz not null default now(),
  -- exactly one of storage_path / embed_url must be present
  constraint media_source_chk check (
    (storage_path is not null and embed_url is null)
    or (storage_path is null and embed_url is not null)
  )
);

-- ---------------------------------------------------------------------------
-- comments: attached to either an event or a media item.
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid        references public.events(id) on delete cascade,
  media_id      uuid        references public.media(id)  on delete cascade,
  author_nick   text        not null check (char_length(author_nick) between 1 and 40),
  password_hash text        not null,
  body          text        not null check (char_length(body) between 1 and 2000),
  status        text        not null default 'visible' check (status in ('visible', 'hidden', 'flagged')),
  report_count  int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- exactly one target
  constraint comments_target_chk check (
    (event_id is not null and media_id is null)
    or (event_id is null and media_id is not null)
  )
);

create index if not exists idx_events_created   on public.events (created_at desc);
create index if not exists idx_events_status    on public.events (status);
create index if not exists idx_media_created     on public.media (created_at desc);
create index if not exists idx_media_status      on public.media (status);
create index if not exists idx_media_event       on public.media (event_id);
create index if not exists idx_comments_event    on public.comments (event_id, created_at);
create index if not exists idx_comments_media    on public.comments (media_id, created_at);
create index if not exists idx_comments_status   on public.comments (status);

-- ####################  supabase/migrations/0002_rls.sql  ####################
-- 0002_rls.sql
-- Row Level Security + column privileges.
--   * anon may READ visible rows, but NEVER the password_hash column.
--   * anon may NOT insert/update/delete directly — every write goes through a
--     SECURITY DEFINER RPC (0003-0005).
--   * access_codes is fully inaccessible to anon.
-- Reads are exposed through security_invoker views (RLS still applies) that
-- simply omit password_hash for convenient `select *`.

alter table public.access_codes enable row level security;
alter table public.events       enable row level security;
alter table public.media        enable row level security;
alter table public.comments     enable row level security;

-- access_codes: no policies + no grants -> anon/authenticated cannot read or
-- write it at all. Only SECURITY DEFINER functions (running as owner) touch it.
revoke all on public.access_codes from anon, authenticated;

-- events / media / comments: SELECT visible rows only; no write policies.
drop policy if exists events_read   on public.events;
drop policy if exists media_read    on public.media;
drop policy if exists comments_read on public.comments;

create policy events_read   on public.events   for select using (status = 'visible');
create policy media_read    on public.media    for select using (status = 'visible');
create policy comments_read on public.comments for select using (status = 'visible');

-- Column-level privileges: drop blanket access (which would expose
-- password_hash) and re-grant only the safe columns. This is what actually
-- hides the hash from `select password_hash ...`; RLS only filters rows.
revoke all on public.events   from anon, authenticated;
revoke all on public.media    from anon, authenticated;
revoke all on public.comments from anon, authenticated;

grant select (id, title, body, event_date, author_nick, status, report_count,
              created_at, updated_at)
  on public.events to anon, authenticated;

grant select (id, event_id, kind, storage_path, embed_url, mime_type, byte_size,
              width, height, caption, author_nick, status, report_count, created_at)
  on public.media to anon, authenticated;

grant select (id, event_id, media_id, author_nick, body, status, report_count,
              created_at, updated_at)
  on public.comments to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public views (security_invoker: the caller's RLS + column grants apply).
-- They omit password_hash and give the client a clean `select *` surface.
-- ---------------------------------------------------------------------------
create or replace view public.events_public
  with (security_invoker = true) as
  select id, title, body, event_date, author_nick, status, report_count,
         created_at, updated_at
  from public.events;

create or replace view public.media_public
  with (security_invoker = true) as
  select id, event_id, kind, storage_path, embed_url, mime_type, byte_size,
         width, height, caption, author_nick, status, report_count, created_at
  from public.media;

create or replace view public.comments_public
  with (security_invoker = true) as
  select id, event_id, media_id, author_nick, body, status, report_count,
         created_at, updated_at
  from public.comments;

grant select on public.events_public, public.media_public, public.comments_public
  to anon, authenticated;

-- ####################  supabase/migrations/0003_rpc_write.sql  ####################
-- 0003_rpc_write.sql
-- Write RPCs. Every write is gated by a valid approval (writer) code, verified
-- server-side with bcrypt. All functions are SECURITY DEFINER so they run as
-- the owner and bypass RLS, but only after the code check passes.

-- ---------------------------------------------------------------------------
-- Internal: is this a currently-valid writer code?
-- ---------------------------------------------------------------------------
create or replace function public._check_writer(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.access_codes
    where role = 'writer'
      and not revoked
      and (expires_at is null or expires_at > now())
      and code_hash = crypt(p_code, code_hash)
  );
$$;

-- Public, cheap verify endpoint for the "unlock once" UX. Returns only a bool;
-- never echoes the code back.
create or replace function public.verify_code(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select public._check_writer(p_code);
$$;

-- ---------------------------------------------------------------------------
-- create_event
-- ---------------------------------------------------------------------------
create or replace function public.create_event(
  p_code       text,
  p_title      text,
  p_body       text,
  p_event_date date,
  p_nick       text,
  p_password   text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public._check_writer(p_code) then
    raise exception 'invalid_access_code' using errcode = '28000';
  end if;
  if p_password is null or char_length(p_password) < 4 then
    raise exception 'weak_password' using errcode = '22023';
  end if;

  insert into public.events (title, body, event_date, author_nick, password_hash)
  values (
    p_title,
    nullif(p_body, ''),
    p_event_date,
    p_nick,
    crypt(p_password, gen_salt('bf', 10))
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_media
-- ---------------------------------------------------------------------------
create or replace function public.create_media(
  p_code         text,
  p_event_id     uuid,
  p_kind         text,
  p_storage_path text,
  p_embed_url    text,
  p_mime_type    text,
  p_byte_size    bigint,
  p_caption      text,
  p_nick         text,
  p_password     text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public._check_writer(p_code) then
    raise exception 'invalid_access_code' using errcode = '28000';
  end if;
  if p_password is null or char_length(p_password) < 4 then
    raise exception 'weak_password' using errcode = '22023';
  end if;

  insert into public.media (
    event_id, kind, storage_path, embed_url, mime_type, byte_size,
    caption, author_nick, password_hash
  )
  values (
    p_event_id, p_kind, nullif(p_storage_path, ''), nullif(p_embed_url, ''),
    p_mime_type, p_byte_size, nullif(p_caption, ''), p_nick,
    crypt(p_password, gen_salt('bf', 10))
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_comment
-- ---------------------------------------------------------------------------
create or replace function public.create_comment(
  p_code     text,
  p_event_id uuid,
  p_media_id uuid,
  p_nick     text,
  p_password text,
  p_body     text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public._check_writer(p_code) then
    raise exception 'invalid_access_code' using errcode = '28000';
  end if;
  if p_password is null or char_length(p_password) < 4 then
    raise exception 'weak_password' using errcode = '22023';
  end if;

  insert into public.comments (event_id, media_id, author_nick, password_hash, body)
  values (
    p_event_id, p_media_id, p_nick,
    crypt(p_password, gen_salt('bf', 10)),
    p_body
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Expose only the intended RPCs to the anon client.
revoke all on function public._check_writer(text) from public, anon, authenticated;
grant execute on function public.verify_code(text)   to anon, authenticated;
grant execute on function public.create_event(text, text, text, date, text, text)         to anon, authenticated;
grant execute on function public.create_media(text, uuid, text, text, text, text, bigint, text, text, text) to anon, authenticated;
grant execute on function public.create_comment(text, uuid, uuid, text, text, text)       to anon, authenticated;

-- ####################  supabase/migrations/0004_rpc_owner.sql  ####################
-- 0004_rpc_owner.sql
-- Author self-service: edit/delete your OWN event/media/comment by re-entering
-- the nickname+password you set when creating it. Deletes are soft (status =
-- 'hidden') so content is recoverable and storage files aren't orphaned mid-op.
-- Returns true on success, false on wrong password / missing row — never
-- reveals whether the row exists.

create or replace function public.update_event(
  p_id text, p_password text, p_title text, p_body text, p_event_date date
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  update public.events
     set title = coalesce(nullif(p_title, ''), title),
         body = nullif(p_body, ''),
         event_date = p_event_date,
         updated_at = now()
   where id = p_id::uuid
     and password_hash = crypt(p_password, password_hash)
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;

create or replace function public.delete_event(p_id text, p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  update public.events set status = 'hidden', updated_at = now()
   where id = p_id::uuid
     and password_hash = crypt(p_password, password_hash)
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;

create or replace function public.update_media(
  p_id text, p_password text, p_caption text
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  update public.media set caption = nullif(p_caption, '')
   where id = p_id::uuid
     and password_hash = crypt(p_password, password_hash)
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;

create or replace function public.delete_media(p_id text, p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  update public.media set status = 'hidden'
   where id = p_id::uuid
     and password_hash = crypt(p_password, password_hash)
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;

create or replace function public.update_comment(
  p_id text, p_password text, p_body text
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  update public.comments
     set body = coalesce(nullif(p_body, ''), body), updated_at = now()
   where id = p_id::uuid
     and password_hash = crypt(p_password, password_hash)
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;

create or replace function public.delete_comment(p_id text, p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  update public.comments set status = 'hidden', updated_at = now()
   where id = p_id::uuid
     and password_hash = crypt(p_password, password_hash)
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;

grant execute on function public.update_event(text, text, text, text, date) to anon, authenticated;
grant execute on function public.delete_event(text, text)                    to anon, authenticated;
grant execute on function public.update_media(text, text, text)              to anon, authenticated;
grant execute on function public.delete_media(text, text)                    to anon, authenticated;
grant execute on function public.update_comment(text, text, text)            to anon, authenticated;
grant execute on function public.delete_comment(text, text)                  to anon, authenticated;

-- ####################  supabase/migrations/0005_rpc_admin.sql  ####################
-- 0005_rpc_admin.sql
-- Admin controls (delete anything, hide/unhide, manage codes) gated by the
-- separate, stronger admin key. Plus a public report endpoint.

create or replace function public._check_admin(p_key text)
returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.access_codes
    where role = 'admin'
      and not revoked
      and (expires_at is null or expires_at > now())
      and code_hash = crypt(p_key, code_hash)
  );
$$;

create or replace function public.verify_admin(p_key text)
returns boolean
language sql security definer set search_path = public, extensions as $$
  select public._check_admin(p_key);
$$;

-- ---- delete anything (hard delete) --------------------------------------
create or replace function public.admin_delete_event(p_key text, p_id text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._check_admin(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  delete from public.events where id = p_id::uuid;
  return found;
end; $$;

create or replace function public.admin_delete_media(p_key text, p_id text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._check_admin(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  -- NOTE: this removes the DB row. The physical file in the `media` bucket is
  -- purged separately (Supabase dashboard, or the Phase-2 orphan-cleanup job /
  -- storage API), since reliable file deletion goes through the storage service.
  delete from public.media where id = p_id::uuid;
  return found;
end; $$;

create or replace function public.admin_delete_comment(p_key text, p_id text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._check_admin(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  delete from public.comments where id = p_id::uuid;
  return found;
end; $$;

-- ---- hide / unhide / flag ------------------------------------------------
create or replace function public.admin_set_status(
  p_key text, p_table text, p_id text, p_status text
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._check_admin(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_status not in ('visible', 'hidden', 'flagged') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  if p_table = 'event' then
    update public.events   set status = p_status, updated_at = now() where id = p_id::uuid;
  elsif p_table = 'media' then
    update public.media    set status = p_status where id = p_id::uuid;
  elsif p_table = 'comment' then
    update public.comments set status = p_status, updated_at = now() where id = p_id::uuid;
  else
    raise exception 'bad_table' using errcode = '22023';
  end if;
  return found;
end; $$;

-- ---- code management (issue / revoke / list) -----------------------------
create or replace function public.admin_add_code(
  p_key text, p_new_code text, p_role text, p_label text, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not public._check_admin(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_role not in ('writer', 'admin') then
    raise exception 'bad_role' using errcode = '22023';
  end if;
  if p_new_code is null or char_length(p_new_code) < 4 then
    raise exception 'weak_code' using errcode = '22023';
  end if;
  insert into public.access_codes (code_hash, role, label, expires_at)
  values (crypt(p_new_code, gen_salt('bf', 10)), p_role, nullif(p_label, ''), p_expires_at)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_revoke_code(p_key text, p_code_id text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._check_admin(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  update public.access_codes set revoked = true where id = p_code_id::uuid;
  return found;
end; $$;

-- Lists codes WITHOUT ever returning code_hash.
create or replace function public.admin_list_codes(p_key text)
returns table (
  id uuid, role text, label text, expires_at timestamptz,
  revoked boolean, created_at timestamptz
)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._check_admin(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return query
    select ac.id, ac.role, ac.label, ac.expires_at, ac.revoked, ac.created_at
    from public.access_codes ac
    order by ac.created_at desc;
end; $$;

-- ---- public report endpoint ---------------------------------------------
-- Anyone viewing can report. Auto-flags (hides from public) past a threshold.
create or replace function public.report_content(p_table text, p_id text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_threshold constant int := 5;
begin
  if p_table = 'event' then
    update public.events set
      report_count = report_count + 1,
      status = case when report_count + 1 >= v_threshold and status = 'visible' then 'flagged' else status end
    where id = p_id::uuid;
  elsif p_table = 'media' then
    update public.media set
      report_count = report_count + 1,
      status = case when report_count + 1 >= v_threshold and status = 'visible' then 'flagged' else status end
    where id = p_id::uuid;
  elsif p_table = 'comment' then
    update public.comments set
      report_count = report_count + 1,
      status = case when report_count + 1 >= v_threshold and status = 'visible' then 'flagged' else status end
    where id = p_id::uuid;
  else
    raise exception 'bad_table' using errcode = '22023';
  end if;
  return found;
end; $$;

revoke all on function public._check_admin(text) from public, anon, authenticated;

grant execute on function public.verify_admin(text)                         to anon, authenticated;
grant execute on function public.admin_delete_event(text, text)             to anon, authenticated;
grant execute on function public.admin_delete_media(text, text)             to anon, authenticated;
grant execute on function public.admin_delete_comment(text, text)           to anon, authenticated;
grant execute on function public.admin_set_status(text, text, text, text)   to anon, authenticated;
grant execute on function public.admin_add_code(text, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.admin_revoke_code(text, text)              to anon, authenticated;
grant execute on function public.admin_list_codes(text)                     to anon, authenticated;
grant execute on function public.report_content(text, text)                 to anon, authenticated;

-- ####################  supabase/migrations/0006_storage.sql  ####################
-- 0006_storage.sql
-- Public `media` bucket for uploaded images / gifs (and optional small video).
-- Video is normally added as an external embed (kind='video_embed'); direct
-- file uploads are capped hard by the bucket config below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true,
  26214400, -- 25 MB hard ceiling; per-type caps (img 5MB / gif 10MB) enforced client-side
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
    'video/mp4', 'video/webm'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read of objects in the media bucket.
drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id = 'media');

-- MVP upload path: anon may INSERT into the media bucket (bounded by the
-- bucket's size/mime limits above). A file only becomes visible on the site
-- once create_media() succeeds with a valid approval code, so orphaned uploads
-- are never shown; a Phase-2 cleanup job (or the signed-upload Edge Function)
-- hardens this further.
drop policy if exists media_anon_insert on storage.objects;
create policy media_anon_insert on storage.objects
  for insert with check (bucket_id = 'media');

-- No UPDATE/DELETE policies for anon: object removal happens via admin tools /
-- the storage API, not from the public client.

-- ####################  시드: 승인코드 + 관리자키  ####################
insert into public.access_codes (code_hash, role, label)
values (crypt('happy0502', gen_salt('bf', 10)), 'writer', 'first batch');

insert into public.access_codes (code_hash, role, label)
values (crypt('x19GUykI5eLpg6m3JVGGAPVIQel2QL1V', gen_salt('bf', 10)), 'admin', 'owner');
