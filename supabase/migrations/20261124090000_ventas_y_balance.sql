alter table public.productos drop constraint if exists productos_stock_check;

alter table public.cotizaciones
  add column if not exists estado text not null default 'creada'
    check (estado in ('creada', 'vendida'));

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

alter table public.ventas enable row level security;
drop policy if exists "Authenticated manages sales" on public.ventas;
create policy "Authenticated manages sales" on public.ventas
  for all to authenticated using (true) with check (true);

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
