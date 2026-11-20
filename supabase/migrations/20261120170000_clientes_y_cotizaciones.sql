alter table public.productos
  add column if not exists codigo text,
  add column if not exists stock integer not null default 0 check (stock >= 0);

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
  pdf_url text,
  created_at timestamptz not null default now()
);
create index if not exists cotizaciones_cliente_id_idx on public.cotizaciones (cliente_id);
create index if not exists cotizaciones_created_at_idx on public.cotizaciones (created_at desc);

alter table public.clientes enable row level security;
drop policy if exists "Authenticated manages clients" on public.clientes;
create policy "Authenticated manages clients" on public.clientes for all to authenticated using (true) with check (true);
alter table public.cotizaciones enable row level security;
drop policy if exists "Authenticated manages quotes" on public.cotizaciones;
create policy "Authenticated manages quotes" on public.cotizaciones for all to authenticated using (true) with check (true);

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
