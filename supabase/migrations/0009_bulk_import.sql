-- 0009_bulk_import.sql
-- Bulk-create events from a spreadsheet import. One approval code + one
-- author nick/password apply to the whole batch; rows come in as JSON.

create or replace function public.create_events_bulk(
  p_code     text,
  p_nick     text,
  p_password text,
  p_rows     jsonb
) returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r      jsonb;
  n      int := 0;
  v_hash text;
  v_date date;
begin
  if not public._check_writer(p_code) then
    raise exception 'invalid_access_code' using errcode = '28000';
  end if;
  if p_password is null or char_length(p_password) < 4 then
    raise exception 'weak_password' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'bad_rows' using errcode = '22023';
  end if;

  v_hash := crypt(p_password, gen_salt('bf', 10));

  for r in select * from jsonb_array_elements(p_rows) loop
    -- skip rows without a title
    if coalesce(nullif(trim(r->>'title'), ''), '') = '' then
      continue;
    end if;

    -- date must already be normalized to YYYY-MM-DD by the client, else null
    v_date := case
                when (r->>'event_date') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'event_date')::date
                else null
              end;

    insert into public.events (
      title, body, event_date, author_nick, password_hash, heart, link_url
    ) values (
      left(trim(r->>'title'), 200),
      nullif(r->>'body', ''),
      v_date,
      p_nick,
      v_hash,
      coalesce(nullif(r->>'heart', ''), '💙'),
      case when nullif(r->>'link', '') ~* '^https?://' then r->>'link' else null end
    );
    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.create_events_bulk(text, text, text, jsonb)
  to anon, authenticated;
