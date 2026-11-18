# Migraciones de Supabase

Este proyecto usa Supabase CLI para ejecutar los SQL de `supabase/migrations` en el proyecto compartido. No se requiere levantar Supabase local ni Docker para aplicar migraciones remotas.

## Configuración inicial en cada equipo

1. Instala Supabase CLI siguiendo la guía oficial: <https://supabase.com/docs/guides/local-development/cli/getting-started>.
2. Desde la raíz del repositorio, autentícate y enlaza el proyecto:

   ```powershell
   supabase login
   supabase link --project-ref <project-ref>
   ```

   Obtén el `project-ref` desde Supabase Dashboard → Project Settings → General. Cuando se solicite, introduce la contraseña de la base de datos en la terminal; no la guardes en el repositorio. El enlace local queda en `supabase/.temp/`, ignorado por Git.

## Aplicar migraciones

Antes de aplicar cambios, revisa qué migraciones están pendientes en el proyecto enlazado. En Supabase CLI 3, los comandos se dirigen a la base local por defecto, así que incluye `--remote` para trabajar con el proyecto compartido:

```powershell
supabase migration list --remote
supabase db push --dry-run --remote
```

Si el plan corresponde a los cambios esperados, aplícalos desde la raíz:

```powershell
supabase db push --remote
```

El CLI registra las migraciones aplicadas en el historial de Supabase. No ejecutes SQL arbitrario directamente contra producción; las migraciones deben estar revisadas y guardadas en `supabase/migrations/`.

## Crear una migración

```powershell
supabase migration new nombre_del_cambio
```

Edita el SQL creado en `supabase/migrations/`, revisa el diff y el resultado de `supabase db push --dry-run --remote` antes de aplicar.

## Migración de categorías aplicada manualmente

`20261118110000_add_categories_and_colombian_products.sql` se ejecutó desde SQL Editor y luego se registró en el historial remoto con `supabase migration repair --status applied 20261118110000 --remote`. La lista remota confirma que está aplicada y `supabase db push --dry-run --remote` confirma que la base está al día. No repitas la reparación para esta base.
