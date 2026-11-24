alter table public.dijes
  add column if not exists precio integer not null default 0 check (precio >= 0);

update public.dijes set precio = 10000 where precio = 0;
