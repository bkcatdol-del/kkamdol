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
