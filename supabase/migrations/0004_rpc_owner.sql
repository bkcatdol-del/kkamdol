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
