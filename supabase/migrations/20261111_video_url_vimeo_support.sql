-- Note Fiorentine: supporto link video esterni Vimeo/YouTube nelle sezioni video.
-- Applicare prima di distribuire il codice che legge video_url.
alter table public.performance_videos add column if not exists video_url text;
alter table public.restaurant_videos add column if not exists video_url text;
comment on column public.performance_videos.video_url is 'URL Vimeo o YouTube del video; se valorizzato sostituisce il file video_path.';
comment on column public.restaurant_videos.video_url is 'URL Vimeo o YouTube del video; youtube_url resta disponibile per compatibilità con i record esistenti.';
