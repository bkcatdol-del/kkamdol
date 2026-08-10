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
