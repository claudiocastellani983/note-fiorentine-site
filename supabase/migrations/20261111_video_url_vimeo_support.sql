-- Note Fiorentine: supporto link video esterni Vimeo/YouTube nelle sezioni video.
-- Questa migrazione va applicata all'ambiente Test e poi, dopo approvazione, a Production.

alter table public.performance_videos
  add column if not exists video_url text;

-- video_path era NOT NULL: ora è consentito usare il link esterno al posto del file.
alter table public.performance_videos
  alter column video_path drop not null;

alter table public.performance_videos
  add constraint performance_videos_video_source_check
  check (video_path is not null or video_url is not null);

alter table public.performance_videos
  add constraint performance_videos_video_url_check
  check (video_url is null or video_url ~* '^https://(www[.])?(vimeo[.]com|player[.]vimeo[.]com|youtube[.]com|m[.]youtube[.]com|youtu[.]be|youtube-nocookie[.]com)/');

alter table public.restaurant_videos
  add column if not exists video_url text;

-- youtube_url resta nullable per conservare i record legacy e consentire nuovi record Vimeo.
alter table public.restaurant_videos
  alter column youtube_url drop not null;

alter table public.restaurant_videos
  drop constraint if exists restaurant_videos_youtube_url_check;

alter table public.restaurant_videos
  add constraint restaurant_videos_video_source_check
  check (youtube_url is not null or video_url is not null);

alter table public.restaurant_videos
  add constraint restaurant_videos_video_url_check
  check (video_url is null or video_url ~* '^https://(www[.])?(vimeo[.]com|player[.]vimeo[.]com|youtube[.]com|m[.]youtube[.]com|youtu[.]be|youtube-nocookie[.]com)/');

comment on column public.performance_videos.video_url is
  'URL Vimeo o YouTube del video; se valorizzato sostituisce il file video_path.';

comment on column public.restaurant_videos.video_url is
  'URL Vimeo o YouTube del video; youtube_url resta disponibile per compatibilità con i record esistenti.';
