update public.tipos_piedra
set imagen_url = '/personalizacion/piedras/' || id || '.svg'
where id in ('cuarzo-rosa', 'ojo-tigre', 'amatista', 'aventurina', 'howlita')
  and (imagen_url is null or imagen_url like '/personalizacion/%');

update public.bolas_metal
set imagen_url = '/personalizacion/bolas/' || id || '.svg'
where id in ('plata', 'oro')
  and (imagen_url is null or imagen_url like '/personalizacion/%');

update public.dijes
set imagen_url = '/personalizacion/dijes/' || id || '.svg'
where id in ('corazon', 'cruz')
  and (imagen_url is null or imagen_url like '/personalizacion/%');
