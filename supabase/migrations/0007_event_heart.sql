-- 0007_event_heart.sql
-- Let each event carry a chosen heart emoji (shown on the calendar) and an
-- optional link.

alter table public.events
  add column if not exists heart text not null default '💙';
alter table public.events
  add column if not exists link_url text;

-- Column-level SELECT grant for the new columns (anon reads base-table columns
-- through the security_invoker view, so it needs these explicitly — matching
-- the pattern in 0002_rls.sql). Without this, reads fail with "permission
-- denied for column heart".
grant select (heart, link_url) on public.events to anon, authenticated;

-- Expose heart + link through the public view. Drop + recreate (create-or-
-- replace cannot insert columns in the middle) and re-grant SELECT.
drop view if exists public.events_public;
create view public.events_public
  with (security_invoker = true) as
  select id, title, body, event_date, author_nick, heart, link_url, status,
         report_count, created_at, updated_at
  from public.events;
grant select on public.events_public to anon, authenticated;

-- Recreate create_event with an optional p_heart (default 💙). Drop the old
-- 6-arg version first so calls resolve unambiguously; existing 6-arg callers
-- still work via the default.
drop function if exists public.create_event(text, text, text, date, text, text);

create or replace function public.create_event(
  p_code       text,
  p_title      text,
  p_body       text,
  p_event_date date,
  p_nick       text,
  p_password   text,
  p_heart      text default '💙',
  p_link       text default null
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

  insert into public.events (title, body, event_date, author_nick, password_hash, heart, link_url)
  values (
    p_title,
    nullif(p_body, ''),
    p_event_date,
    p_nick,
    crypt(p_password, gen_salt('bf', 10)),
    coalesce(nullif(p_heart, ''), '💙'),
    case when nullif(p_link, '') ~* '^https?://' then p_link else null end
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_event(text, text, text, date, text, text, text, text)
  to anon, authenticated;
