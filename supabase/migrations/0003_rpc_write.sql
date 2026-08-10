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
