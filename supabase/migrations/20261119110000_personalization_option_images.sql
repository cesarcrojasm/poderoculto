alter table public.tipos_piedra
  add column if not exists imagen_url text;
alter table public.tipos_piedra
  drop column if exists hex_color,
  drop column if exists colores;

alter table public.bolas_metal
  add column if not exists imagen_url text;
alter table public.bolas_metal
  drop column if exists hex_color;

alter table public.dijes
  add column if not exists imagen_url text;
alter table public.dijes
  drop column if exists icono;
