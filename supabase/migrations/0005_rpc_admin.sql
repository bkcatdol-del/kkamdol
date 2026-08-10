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
