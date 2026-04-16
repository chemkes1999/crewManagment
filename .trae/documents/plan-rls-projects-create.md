## Resumen
El error `new row violates row-level security policy for table "projects"` ocurre cuando Supabase/Postgres bloquea un `INSERT` (o el `RETURNING`/representación del insert) por no cumplir las políticas RLS de `public.projects`. En este repo, la política de inserción exige que el registro cumpla `created_by = auth.uid()` y la política de lectura exige que el usuario sea miembro del proyecto; además, la membresía se crea vía trigger y hay migraciones posteriores que corrigen problemas de RLS recursivo.

Este plan deja la base de datos en un estado “robusto” para crear proyectos en Supabase remoto: asegura que las migraciones de fixes estén aplicadas y endurece la política de `SELECT` para que el owner pueda ver su propio proyecto incluso si la membresía aún no existe.

## Análisis del estado actual (repo)
- La tabla `public.projects` tiene RLS habilitado: [0001_init.sql](file:///workspace/supabase/migrations/0001_init.sql#L11-L18), [0001_init.sql](file:///workspace/supabase/migrations/0001_init.sql#L91-L98).
- Políticas relevantes:
  - `projects_insert_owner`: permite `INSERT` solo a `authenticated` con `with check (created_by = auth.uid())`: [0001_init.sql](file:///workspace/supabase/migrations/0001_init.sql#L166-L170).
  - `projects_select_member`: permite `SELECT` solo si `public.is_project_member(id)`: [0001_init.sql](file:///workspace/supabase/migrations/0001_init.sql#L161-L165).
- La membresía del creador se intenta crear con un trigger `after insert on public.projects` → `public.add_project_owner_member()`: [0001_init.sql](file:///workspace/supabase/migrations/0001_init.sql#L127-L144).
- Hay migraciones posteriores que corrigen problemas comunes con RLS/recursión y el trigger:
  - `0002_fix_rls_stack_depth.sql`: redefine funciones `is_project_member/is_project_admin` para evitar recursión (security definer + `row_security = off`): [0002_fix_rls_stack_depth.sql](file:///workspace/supabase/migrations/0002_fix_rls_stack_depth.sql#L1-L38).
  - `0003_fix_project_owner_member_trigger_rls.sql`: redefine el trigger function como `security definer` + `row_security = off`: [0003_fix_project_owner_member_trigger_rls.sql](file:///workspace/supabase/migrations/0003_fix_project_owner_member_trigger_rls.sql#L1-L16).
- La app crea proyectos vía API con el token del usuario y setea `created_by` con el `userId` del JWT:
  - `POST /api/projects` usa `getAuthedSupabase(req)` y hace `.from('projects').insert({ created_by: r.auth.userId, ... }).select('*').single()`: [api.ts](file:///workspace/api/routes/api.ts#L169-L194).
  - El middleware `requireAuth` valida el Bearer token y setea `req.auth.userId`: [auth.ts](file:///workspace/api/lib/auth.ts#L13-L57).
  - El cliente “authed” setea `Authorization: Bearer <token>` para Supabase: [supabase.ts](file:///workspace/api/lib/supabase.ts#L4-L20).

## Hipótesis más probable (por qué pasa)
En Supabase remoto, el `INSERT` a `projects` (o el `RETURNING` del insert) está siendo bloqueado por RLS porque al menos una de estas condiciones no se cumple:
- La request que llega a PostgREST no está efectivamente autenticada (no se está aplicando el JWT en la llamada a Supabase) y por lo tanto no aplica ninguna policy para `authenticated`.
- `created_by` no coincide con `auth.uid()` (policy `projects_insert_owner`).
- Aunque el insert pase, el `.select('*')` del insert requiere permiso de `SELECT` (policy `projects_select_member`), y si la fila de `project_members` no existe (o el trigger falla/recursa), `SELECT` queda denegado y se ve el error en `projects`.

## Cambios propuestos
### 1) Verificar y aplicar migraciones en Supabase remoto (0001, 0002, 0003)
Objetivo: asegurar que los fixes de RLS/trigger realmente están activos en el entorno remoto.

Acciones:
- Verificar qué migraciones están aplicadas en remoto:
  - Opción SQL (en Supabase SQL editor):
    - `select * from supabase_migrations.schema_migrations order by version;`
  - Opción CLI:
    - `supabase link --project-ref <...>`
    - `supabase migration list`
- Si falta `0002_fix_rls_stack_depth.sql` o `0003_fix_project_owner_member_trigger_rls.sql`, aplicarlas:
  - Opción CLI:
    - `supabase db push`
  - Opción SQL editor:
    - Ejecutar el contenido exacto de esas migraciones en orden.

Resultado esperado:
- `public.is_project_member()` y `public.is_project_admin()` quedan como `security definer` con `row_security = off`.
- `public.add_project_owner_member()` queda como `security definer` con `row_security = off`.

### 2) Hacer la policy de SELECT de projects compatible con “owner”
Objetivo: evitar que la creación falle al intentar devolver la representación del registro (`.select('*')`) si por cualquier razón todavía no existe el registro en `project_members`.

Acciones (en repo, como nueva migración):
- Crear una migración nueva, por ejemplo:
  - `supabase/migrations/0004_projects_select_owner_or_member.sql`
- Contenido:
  - Dropear y recrear `projects_select_member` para que permita `SELECT` si:
    - `created_by = auth.uid()` (owner), OR
    - `public.is_project_member(id)` (miembro)

Notas:
- Esto no abre el acceso a terceros: sigue limitado a `authenticated` y solo al owner/miembros.
- Reduce el acoplamiento temporal al trigger y evita fallas al devolver el registro recién creado.

### 3) Ajuste opcional en API para reducir dependencia de SELECT (si hiciera falta)
Objetivo: tener un fallback si en algún entorno la política de `SELECT` sigue bloqueando el `RETURNING`.

Acciones (solo si tras 1) y 2) aún falla):
- En `POST /api/projects` cambiar la inserción para no pedir `return=representation`:
  - Hacer `insert(...)` sin `.select('*').single()`.
  - Luego hacer un `select` por `id` (o devolver `{ success: true }` y refrescar lista).

Archivo:
- `api/routes/api.ts` en el handler `POST /projects`: [api.ts](file:///workspace/api/routes/api.ts#L169-L194).

## Decisiones y supuestos
- Entorno: Supabase remoto.
- Hay acceso para aplicar migraciones/cambiar policies en la DB.
- Se prioriza mantener RLS (no se usa service role para writes de usuario final).
- Se acepta agregar una migración nueva para robustecer `SELECT` del owner.

## Verificación (aceptación)
### Verificación DB (Supabase SQL editor)
- Confirmar policies:
  - `select schemaname, tablename, policyname, roles, cmd, qual, with_check from pg_policies where tablename in ('projects','project_members') order by tablename, policyname;`
- Confirmar definiciones de funciones:
  - `select proname, prosecdef from pg_proc join pg_namespace n on n.oid = pronamespace where n.nspname='public' and proname in ('is_project_member','is_project_admin','add_project_owner_member');`

### Verificación app (manual)
- Loguearse en la app.
- Crear un proyecto desde el dashboard.
- Esperado:
  - Respuesta 201 desde `POST /api/projects`.
  - El proyecto aparece en la lista inmediatamente.
  - En DB existe el registro en `public.project_members` para el creador con `project_role = 'admin'`.
