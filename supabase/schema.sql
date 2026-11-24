create extension if not exists pgcrypto;

create table if not exists public.categorias (
  id text primary key,
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.productos (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  precio integer not null check (precio >= 0),
  disponible boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  categoria_id text references public.categorias(id) on delete set null,
  codigo text,
  stock integer not null default 0
);

alter table public.productos
  add column if not exists codigo text,
  add column if not exists stock integer not null default 0;
alter table public.productos drop constraint if exists productos_stock_check;

create table if not exists public.producto_fotos (
  id uuid primary key default gen_random_uuid(),
  producto_id text not null references public.productos(id) on delete cascade,
  url text not null,
  orden integer not null default 0
);

create unique index if not exists producto_fotos_product_url_idx on public.producto_fotos (producto_id, url);

create table if not exists public.tipos_tejido (
  id text primary key,
  nombre text not null,
  disponible boolean not null default true
);

create table if not exists public.colores_hilo (
  id text primary key,
  nombre text not null,
  hex_color text not null,
  disponible boolean not null default true
);

create table if not exists public.tipos_piedra (
  id text primary key,
  nombre text not null,
  precio_unit integer not null check (precio_unit >= 0),
  imagen_url text,
  disponible boolean not null default true
);

create table if not exists public.dijes (
  id text primary key,
  nombre text not null,
  precio integer not null default 0 check (precio >= 0),
  imagen_url text,
  disponible boolean not null default true
);

alter table public.dijes
  add column if not exists precio integer not null default 0 check (precio >= 0);

create table if not exists public.bolas_metal (
  id text primary key,
  nombre text not null,
  precio integer not null check (precio >= 0),
  imagen_url text,
  disponible boolean not null default true
);

alter table public.tipos_piedra
  add column if not exists imagen_url text,
  drop column if exists hex_color,
  drop column if exists colores;
alter table public.bolas_metal
  add column if not exists imagen_url text,
  drop column if exists hex_color;
alter table public.dijes
  add column if not exists imagen_url text,
  drop column if exists icono;

create table if not exists public.config_manilla (
  id uuid primary key default gen_random_uuid(),
  precio_base integer not null check (precio_base >= 0),
  min_piedras integer not null check (min_piedras > 0),
  max_piedras integer not null check (max_piedras >= min_piedras),
  updated_at timestamptz not null default now()
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 80),
  celular text not null check (length(celular) between 7 and 20),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total integer not null check (total >= 0),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'contactado')),
  created_at timestamptz not null default now()
);

create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 100),
  celular text not null check (length(celular) between 7 and 20),
  direccion text,
  created_at timestamptz not null default now()
);
create index if not exists clientes_nombre_idx on public.clientes (nombre);

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  expiracion text not null default 'no_expira' check (expiracion in ('1_semana', '15_dias', '1_mes', 'no_expira')),
  concepto text not null default '',
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  subtotal integer not null check (subtotal >= 0),
  descuento_porcentaje numeric not null default 0 check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100),
  descuento_valor integer not null default 0 check (descuento_valor >= 0 and descuento_valor <= subtotal),
  total integer not null check (total >= 0 and total = subtotal - descuento_valor),
  estado text not null default 'creada' check (estado in ('creada', 'vendida')),
  pdf_url text,
  created_at timestamptz not null default now()
);
create index if not exists cotizaciones_cliente_id_idx on public.cotizaciones (cliente_id);
create index if not exists cotizaciones_created_at_idx on public.cotizaciones (created_at desc);
alter table public.cotizaciones add column if not exists estado text not null default 'creada' check (estado in ('creada', 'vendida'));

create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  numero_transaccion bigint generated always as identity unique,
  cliente_id uuid references public.clientes(id) on delete set null,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  fecha date not null default current_date,
  estado_pago text not null check (estado_pago in ('pagado', 'deuda')),
  metodo_pago text check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia', 'nequi', 'daviplata', 'otro')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  subtotal integer not null check (subtotal >= 0),
  descuento_porcentaje numeric not null default 0 check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100),
  descuento_valor integer not null default 0 check (descuento_valor >= 0 and descuento_valor <= subtotal),
  total integer not null check (total >= 0 and total = subtotal - descuento_valor),
  abono_valor integer not null default 0 check (abono_valor >= 0 and abono_valor <= total),
  concepto text not null default '',
  nota text,
  pdf_url text,
  created_at timestamptz not null default now()
);
create index if not exists ventas_created_at_idx on public.ventas (created_at desc);
create index if not exists ventas_cliente_id_idx on public.ventas (cliente_id);
create unique index if not exists ventas_cotizacion_id_unique_idx on public.ventas (cotizacion_id) where cotizacion_id is not null;

insert into public.categorias (id, nombre) values
('colombiana', 'Colombiana'), ('clasica', 'Clásica')
on conflict (id) do nothing;

insert into public.productos (id, nombre, descripcion, precio, orden) values
('1', 'Raíz carmesí', 'Macramé rojo y piedras en tonos cálidos: un pequeño recordatorio de fuerza, arraigo y nuevos comienzos.', 20000, 1),
('2', 'Lazo de calma', 'Hilo rojo tejido a mano con cuentas rosadas suaves. Un detalle delicado para llevar cerca lo que te da tranquilidad.', 10000, 2),
('3', 'Cruz de marea', 'Azul profundo, cuentas claras y una cruz turquesa que evoca calma, confianza y protección.', 20000, 3),
('4', 'Luz de luna', 'El rojo del macramé contrasta con una piedra central luminosa y detalles transparentes. Hecha para destacar sin esfuerzo.', 15000, 4),
('5', 'Amuleto de plata', 'Una silueta negra y sobria con una cruz plateada al centro. Un clásico artesanal para todos los días.', 50000, 5),
('6', 'Corazón de camino', 'Hilo rojo, corazón claro y pequeños acentos turquesa: una pieza que celebra los vínculos que nos acompañan.', 20000, 6),
('7', 'Turquesa protectora', 'Macramé azul noche y una cruz turquesa rodeada de cuentas azules. Color y carácter en una pieza hecha a mano.', 30000, 7)
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, precio = excluded.precio, orden = excluded.orden;

update public.productos set categoria_id = 'clasica' where id in ('1','2','3','4','5','6','7');

insert into public.productos (id, nombre, descripcion, precio, disponible, orden, categoria_id) values
('colombia-heart', 'Corazón tricolor', 'Macramé negro con cuentas de colores y un corazón con la bandera colombiana: un símbolo de cariño por nuestra tierra.', 20000, true, 8, 'colombiana'),
('colombia-red', 'Raíces de Colombia', 'Hilo rojo tejido a mano con cuentas amarillas, azules y rojas, inspirado en los colores que nos unen.', 20000, true, 9, 'colombiana'),
('colombia-black', 'Orgullo tricolor', 'Macramé negro con cuentas en amarillo, azul y rojo: un diseño artesanal para llevar a Colombia contigo.', 20000, true, 10, 'colombiana'),
('colombia-upright', 'Camino colombiano', 'Tejido negro con una cuenta central tricolor y pequeños detalles de color, hecho a mano con inspiración colombiana.', 20000, true, 11, 'colombiana')
on conflict (id) do nothing;

insert into public.producto_fotos (producto_id, url, orden) values
('1', '/products/1.1.jpeg', 1), ('1', '/products/1.2.jpeg', 2),
('2', '/products/2.1.jpeg', 1), ('2', '/products/2.2.jpeg', 2),
('3', '/products/3.1.jpeg', 1), ('3', '/products/3.2.jpeg', 2),
('4', '/products/4.1.jpeg', 1), ('4', '/products/4.2.jpeg', 2),
('5', '/products/5.1.jpeg', 1), ('5', '/products/5.2.jpeg', 2),
('6', '/products/6.jpeg', 1), ('7', '/products/7.jpeg', 1),
('colombia-heart', '/colombia/colombia-heart.jpeg', 1),
('colombia-red', '/colombia/colombia-red.jpeg', 1),
('colombia-black', '/colombia/colombia-black.jpeg', 1),
('colombia-upright', '/colombia/colombia-upright.jpeg', 1)
on conflict (producto_id, url) do nothing;

insert into public.tipos_tejido (id, nombre) values ('clasico', 'Macramé clásico'), ('trenzado', 'Trenzado') on conflict (id) do nothing;
insert into public.colores_hilo (id, nombre, hex_color) values
('rojo', 'Rojo', '#9b2928'), ('negro', 'Negro', '#282522'), ('azul-noche', 'Azul noche', '#263b70'), ('crema', 'Crema', '#d7c8a7'), ('verde-jade', 'Verde jade', '#47816d'), ('vino', 'Vino', '#672c43') on conflict (id) do nothing;
insert into public.tipos_piedra (id, nombre, precio_unit, imagen_url) values
('cuarzo-rosa', 'Cuarzo rosa', 3000, '/personalizacion/piedras/cuarzo-rosa.svg'),
('ojo-tigre', 'Ojo de tigre', 3500, '/personalizacion/piedras/ojo-tigre.svg'),
('amatista', 'Amatista', 4000, '/personalizacion/piedras/amatista.svg'),
('aventurina', 'Aventurina', 3000, '/personalizacion/piedras/aventurina.svg'),
('howlita', 'Howlita', 2500, '/personalizacion/piedras/howlita.svg') on conflict (id) do nothing;
insert into public.dijes (id, nombre, precio, imagen_url) values ('corazon', 'Corazón', 10000, '/personalizacion/dijes/corazon.svg'), ('cruz', 'Cruz', 10000, '/personalizacion/dijes/cruz.svg') on conflict (id) do nothing;
update public.dijes set precio = 10000 where precio = 0;
insert into public.bolas_metal (id, nombre, precio, imagen_url) values ('plata', 'Plata', 4000, '/personalizacion/bolas/plata.svg'), ('oro', 'Oro', 5000, '/personalizacion/bolas/oro.svg') on conflict (id) do nothing;
insert into public.config_manilla (id, precio_base, min_piedras, max_piedras) values ('00000000-0000-0000-0000-000000000001', 18000, 3, 10) on conflict (id) do nothing;

alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.producto_fotos enable row level security;
alter table public.tipos_tejido enable row level security;
alter table public.colores_hilo enable row level security;
alter table public.tipos_piedra enable row level security;
alter table public.dijes enable row level security;
alter table public.bolas_metal enable row level security;
alter table public.config_manilla enable row level security;
alter table public.pedidos enable row level security;

drop policy if exists "Public reads categories" on public.categorias;
create policy "Public reads categories" on public.categorias for select to anon, authenticated using (true);
drop policy if exists "Authenticated manages categories" on public.categorias;
create policy "Authenticated manages categories" on public.categorias for all to authenticated using (true) with check (true);

drop policy if exists "Public reads available products" on public.productos;
create policy "Public reads available products" on public.productos for select to anon, authenticated using (disponible or auth.role() = 'authenticated');
drop policy if exists "Authenticated manages products" on public.productos;
create policy "Authenticated manages products" on public.productos for all to authenticated using (true) with check (true);
drop policy if exists "Public reads product photos" on public.producto_fotos;
create policy "Public reads product photos" on public.producto_fotos for select to anon, authenticated using (true);
drop policy if exists "Authenticated manages product photos" on public.producto_fotos;
create policy "Authenticated manages product photos" on public.producto_fotos for all to authenticated using (true) with check (true);

do $$
declare table_name text;
begin
  foreach table_name in array array['tipos_tejido','colores_hilo','tipos_piedra','dijes','bolas_metal'] loop
    execute format('drop policy if exists "Public reads available %1$s" on public.%1$I', table_name);
    execute format('create policy "Public reads available %1$s" on public.%1$I for select to anon, authenticated using (disponible or auth.role() = ''authenticated'')', table_name);
    execute format('drop policy if exists "Authenticated manages %1$s" on public.%1$I', table_name);
    execute format('create policy "Authenticated manages %1$s" on public.%1$I for all to authenticated using (true) with check (true)', table_name);
  end loop;
end $$;

drop policy if exists "Public reads bracelet config" on public.config_manilla;
create policy "Public reads bracelet config" on public.config_manilla for select to anon, authenticated using (true);
drop policy if exists "Authenticated manages bracelet config" on public.config_manilla;
create policy "Authenticated manages bracelet config" on public.config_manilla for all to authenticated using (true) with check (true);
drop policy if exists "Public creates orders" on public.pedidos;
create policy "Public creates orders" on public.pedidos for insert to anon, authenticated with check (true);
drop policy if exists "Authenticated manages orders" on public.pedidos;
create policy "Authenticated manages orders" on public.pedidos for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('productos', 'productos', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']) on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists "Public reads product assets" on storage.objects;
create policy "Public reads product assets" on storage.objects for select to anon, authenticated using (bucket_id = 'productos');
drop policy if exists "Authenticated uploads product assets" on storage.objects;
create policy "Authenticated uploads product assets" on storage.objects for insert to authenticated with check (bucket_id = 'productos');
drop policy if exists "Authenticated updates product assets" on storage.objects;
create policy "Authenticated updates product assets" on storage.objects for update to authenticated using (bucket_id = 'productos') with check (bucket_id = 'productos');
drop policy if exists "Authenticated deletes product assets" on storage.objects;
create policy "Authenticated deletes product assets" on storage.objects for delete to authenticated using (bucket_id = 'productos');

alter table public.clientes enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.ventas enable row level security;
drop policy if exists "Authenticated manages clients" on public.clientes;
create policy "Authenticated manages clients" on public.clientes for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated manages quotes" on public.cotizaciones;
create policy "Authenticated manages quotes" on public.cotizaciones for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated manages sales" on public.ventas;
create policy "Authenticated manages sales" on public.ventas for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizaciones', 'cotizaciones', true, 5242880, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];
drop policy if exists "Public reads quote pdfs" on storage.objects;
drop policy if exists "Authenticated lists quote pdfs" on storage.objects;
create policy "Authenticated lists quote pdfs" on storage.objects for select to authenticated using (bucket_id = 'cotizaciones');
drop policy if exists "Authenticated uploads quote pdfs" on storage.objects;
create policy "Authenticated uploads quote pdfs" on storage.objects for insert to authenticated with check (bucket_id = 'cotizaciones');
drop policy if exists "Authenticated deletes quote pdfs" on storage.objects;
create policy "Authenticated deletes quote pdfs" on storage.objects for delete to authenticated using (bucket_id = 'cotizaciones');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ventas', 'ventas', true, 5242880, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf'];
drop policy if exists "Authenticated lists sale pdfs" on storage.objects;
create policy "Authenticated lists sale pdfs" on storage.objects for select to authenticated using (bucket_id = 'ventas');
drop policy if exists "Authenticated uploads sale pdfs" on storage.objects;
create policy "Authenticated uploads sale pdfs" on storage.objects for insert to authenticated with check (bucket_id = 'ventas');
drop policy if exists "Authenticated deletes sale pdfs" on storage.objects;
create policy "Authenticated deletes sale pdfs" on storage.objects for delete to authenticated using (bucket_id = 'ventas');
