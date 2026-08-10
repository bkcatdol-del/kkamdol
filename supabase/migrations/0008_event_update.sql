-- 0008_event_update.sql
-- Extend update_event so the author can edit heart + link too (full-post edit),
-- not just title/body/date.

drop function if exists public.update_event(text, text, text, text, date);

create or replace function public.update_event(
  p_id         text,
  p_password   text,
  p_title      text,
  p_body       text,
  p_event_date date,
  p_heart      text default null,
  p_link       text default null
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
begin
  update public.events set
    title      = coalesce(nullif(p_title, ''), title),
    body       = nullif(p_body, ''),
    event_date = p_event_date,
    heart      = coalesce(nullif(p_heart, ''), heart),
    link_url   = case
                   when p_link is null then link_url                    -- unchanged
                   when nullif(p_link, '') ~* '^https?://' then p_link   -- new link
                   else null                                            -- cleared/invalid
                 end,
    updated_at = now()
  where id = p_id::uuid
    and password_hash = crypt(p_password, password_hash)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

grant execute on function public.update_event(text, text, text, text, date, text, text)
  to anon, authenticated;
