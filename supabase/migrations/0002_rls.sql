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
