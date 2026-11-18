create table if not exists public.categorias (
  id text primary key,
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table public.productos
  add column if not exists categoria_id text references public.categorias(id) on delete set null;

alter table public.categorias enable row level security;
drop policy if exists "Public reads categories" on public.categorias;
create policy "Public reads categories" on public.categorias for select to anon, authenticated using (true);
drop policy if exists "Authenticated manages categories" on public.categorias;
create policy "Authenticated manages categories" on public.categorias for all to authenticated using (true) with check (true);

insert into public.categorias (id, nombre) values
  ('colombiana', 'Colombiana'),
  ('clasica', 'Clásica')
on conflict (id) do nothing;

insert into public.productos (id, nombre, descripcion, precio, disponible, orden, categoria_id) values
  ('colombia-heart', 'Corazón tricolor', 'Macramé negro con cuentas de colores y un corazón con la bandera colombiana: un símbolo de cariño por nuestra tierra.', 20000, true, 8, 'colombiana'),
  ('colombia-red', 'Raíces de Colombia', 'Hilo rojo tejido a mano con cuentas amarillas, azules y rojas, inspirado en los colores que nos unen.', 20000, true, 9, 'colombiana'),
  ('colombia-black', 'Orgullo tricolor', 'Macramé negro con cuentas en amarillo, azul y rojo: un diseño artesanal para llevar a Colombia contigo.', 20000, true, 10, 'colombiana'),
  ('colombia-upright', 'Camino colombiano', 'Tejido negro con una cuenta central tricolor y pequeños detalles de color, hecho a mano con inspiración colombiana.', 20000, true, 11, 'colombiana')
on conflict (id) do nothing;

update public.productos set categoria_id = 'clasica' where id in ('1','2','3','4','5','6','7');
update public.productos set categoria_id = 'colombiana' where id in ('colombia-heart','colombia-red','colombia-black','colombia-upright');

insert into public.producto_fotos (producto_id, url, orden) values
  ('colombia-heart', '/colombia/colombia-heart.jpeg', 1),
  ('colombia-red', '/colombia/colombia-red.jpeg', 1),
  ('colombia-black', '/colombia/colombia-black.jpeg', 1),
  ('colombia-upright', '/colombia/colombia-upright.jpeg', 1)
on conflict (producto_id, url) do nothing;
