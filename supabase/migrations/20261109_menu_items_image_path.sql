-- Note Fiorentine: fotografia opzionale associata a ogni piatto.
-- Applicare soltanto quando si approva il rilascio in produzione.
alter table public.menu_items
  add column if not exists image_path text;

comment on column public.menu_items.image_path is
  'Percorso della fotografia del piatto nel bucket pubblico site-media.';
