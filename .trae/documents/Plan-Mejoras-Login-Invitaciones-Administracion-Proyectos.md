## Resumen

Mejorar el sistema actual (Vue + Express + Supabase) agregando: (1) login por correo con magic link (OTP) y animaciones en la pantalla de login, (2) flujo completo de invitación a proyectos (crear, listar, revocar y aceptar), y (3) mejoras de administración: gestión de miembros/roles y notificación por correo al asignar tareas (usando SMTP del backend).

## Análisis del Estado Actual (repositorio)

- Frontend:
  - Login solo con Google OAuth en [LoginPage.vue](file:///workspace/src/pages/LoginPage.vue).
  - UI de tareas con asignación de miembros ya existe en [ProjectPage.vue](file:///workspace/src/pages/ProjectPage.vue) (edición + endpoint de assignees).
  - Ruteo y protección de rutas en [router/index.ts](file:///workspace/src/router/index.ts).
- Backend:
  - API Express centralizada en [api.ts](file:///workspace/api/routes/api.ts), con autenticación por bearer token Supabase via [auth.ts](file:///workspace/api/lib/auth.ts).
  - Envío de correos por SMTP ya existe para correos genéricos/asignación manual via `/projects/:projectId/emails/send`, usando [emailTemplates.ts](file:///workspace/api/lib/emailTemplates.ts) y `email_logs`.
- Base de datos (Supabase):
  - Esquema base con `projects`, `project_members`, `tasks`, `task_assignees`, `email_logs` y RLS en [0001_init.sql](file:///workspace/supabase/migrations/0001_init.sql).
  - No existe un sistema de invitaciones ni endpoints para administrar miembros (cambiar roles/remover/alta por invitación).
  - `profiles` no guarda email; el email vive en Auth (por eso, para notificaciones, se requiere `serviceRole` para resolver emails por `userId`).

## Cambios Propuestos (decision-complete)

### 1) Login con correo (Magic Link) + animaciones

**Objetivo:** permitir iniciar sesión tanto con Google como con correo (OTP), con una UI más moderna y animada.

- Editar [LoginPage.vue](file:///workspace/src/pages/LoginPage.vue)
  - Agregar formulario de email con:
    - Input email + botón “Enviar enlace”.
    - Estado “enviando” y estado “enviado” con feedback.
    - `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`.
      - `emailRedirectTo` = `${origin}/login?redirect=...` para reusar el handler existente de `exchangeCodeForSession`.
  - Mantener Google OAuth existente.
  - Añadir animaciones:
    - Entrada del card (transición de opacidad/translate/blur con Tailwind + `<Transition>`).
    - Transiciones en cambio de estados (enviando/enviado/error) y micro-interacciones en botones.

- Editar [stores/auth.ts](file:///workspace/src/stores/auth.ts)
  - Añadir `signInWithEmailOtp(email, redirectTo)` para centralizar el flujo (misma capa que `signInWithGoogle`).

### 2) Sistema de invitaciones a proyectos (DB + API + UI)

**Objetivo:** permitir que admins inviten por email a nuevos miembros al proyecto y que el invitado pueda aceptar tras iniciar sesión (flujo “Requiere login”).

#### 2.1 Base de datos (nueva migración)

- Agregar migración nueva: `supabase/migrations/0005_project_invitations.sql`
  - Tabla `project_invitations` con campos:
    - `id uuid primary key default gen_random_uuid()`
    - `project_id uuid not null`
    - `invited_email text not null`
    - `project_role text not null default 'member' check (project_role in ('admin','member'))`
    - `token uuid not null unique`
    - `created_by uuid not null`
    - `created_at timestamptz not null default now()`
    - `expires_at timestamptz not null`
    - `accepted_by uuid`
    - `accepted_at timestamptz`
    - `revoked_at timestamptz`
  - Índices: `project_id`, `invited_email`, `token`.
  - RLS:
    - Select/insert/update/delete permitidos a admins del proyecto (`public.is_project_admin(project_id)`), con restricciones:
      - Solo ver invitaciones del proyecto.
      - Solo editar/revocar invitaciones del proyecto.
    - (El flujo de aceptación se hará vía backend con service role, por lo que no se requiere exponer la invitación al invitado vía RLS).
  - Grants a `authenticated` para CRUD bajo RLS.

#### 2.2 Backend (endpoints + email)

- Editar [api/routes/api.ts](file:///workspace/api/routes/api.ts)
  - Endpoints de invitaciones (autenticados):
    - `GET /projects/:projectId/invitations`
      - Lista invitaciones del proyecto (solo admins por RLS).
    - `POST /projects/:projectId/invitations`
      - Body: `{ email, projectRole, expiresInDays? }`.
      - Genera `token` (uuid) y `expires_at` (por defecto 7 días).
      - Inserta en `project_invitations`.
      - Envía email por SMTP con link: `${baseUrl}/invite?token=...` (ver 2.3).
      - Registra en `email_logs` (tipo invitación, `task_id` null).
    - `POST /projects/:projectId/invitations/:invitationId/resend`
      - Reenvía el email (misma invitación/token) si no está aceptada ni revocada ni expirada.
    - `DELETE /projects/:projectId/invitations/:invitationId`
      - Marca `revoked_at` (o elimina; preferencia: soft revoke para auditoría).
  - Endpoint de aceptación:
    - `POST /invitations/accept`
      - Body: `{ token }`.
      - Requiere sesión (bearer) y valida:
        - El token existe, no está revocado, no está aceptado y no está expirado.
        - El email del usuario logueado (via `supabase.auth.getUser()`) coincide con `invited_email` (case-insensitive, normalizado).
      - Con `createSupabaseService()`:
        - Upsert en `project_members` (`project_id`, `user_id`, `project_role`).
        - Update de `project_invitations` (`accepted_by`, `accepted_at`).
      - Devuelve `{ success: true, projectId }` para redirigir.

- Editar [api/lib/emailTemplates.ts](file:///workspace/api/lib/emailTemplates.ts)
  - Agregar `buildProjectInvitationEmail({ projectName, invitedByName?, role, url, note? })`.
  - Mantener estilos existentes (HTML inline).

#### 2.3 Frontend (pantalla /invite + gestión en Project)

- Editar [router/index.ts](file:///workspace/src/router/index.ts)
  - Agregar ruta pública `/invite` (sin `requiresAuth`).

- Agregar nueva página: `src/pages/InviteAcceptPage.vue`
  - Lee `token` del query string.
  - Si no hay sesión: redirige a `/login?redirect=<ruta actual con token>`.
  - Si hay sesión: llama `POST /api/invitations/accept` y redirige a `/projects/:projectId` con toast.
  - Estados: cargando/éxito/error con UI consistente.

- Editar [ProjectPage.vue](file:///workspace/src/pages/ProjectPage.vue)
  - Agregar nueva pestaña “Miembros”:
    - Lista miembros actuales (ya existe `loadMembers`).
    - Form de invitación (email + rol).
    - Lista invitaciones pendientes (estado: pendiente/expirada/aceptada/revocada).
      - Acciones: copiar link, reenviar, revocar.
  - Consumir endpoints nuevos:
    - `GET /api/projects/:projectId/invitations`
    - `POST /api/projects/:projectId/invitations`
    - `POST /api/projects/:projectId/invitations/:invitationId/resend`
    - `DELETE /api/projects/:projectId/invitations/:invitationId`

### 3) Mejoras de administración: roles de miembros + notificación por asignación de tarea

#### 3.1 Gestión de roles/remoción de miembros (admin)

- Editar [api/routes/api.ts](file:///workspace/api/routes/api.ts)
  - Agregar:
    - `PATCH /projects/:projectId/members/:userId` body `{ projectRole }` (solo admins; aplica RLS existente de `project_members_update_admin`).
    - `DELETE /projects/:projectId/members/:userId` (solo admins; aplica RLS existente de `project_members_delete_admin`).
- Editar [ProjectPage.vue](file:///workspace/src/pages/ProjectPage.vue)
  - En pestaña “Miembros”, agregar:
    - Cambiar rol (select admin/member) y guardar.
    - Remover miembro (con confirmación UI).
  - (Guard rails) Impedir remover el último admin del proyecto desde UI (validación frontend) y validar también en backend (consulta previa).

#### 3.2 Notificación por email al asignar tareas (SMTP)

**Objetivo:** al guardar asignados, permitir enviar notificación automática usando la plantilla existente de “tarea asignada”.

- Editar endpoint existente `PUT /tasks/:taskId/assignees` en [api.ts](file:///workspace/api/routes/api.ts)
  - Extender payload zod para aceptar opcionales:
    - `notify: boolean` (default false)
    - `note: string` (default '')
  - Luego de persistir assignees:
    - Calcular nuevos asignados (diff antes/después).
    - Usar `createSupabaseService().auth.admin.getUserById(userId)` para resolver emails.
    - Enviar un email por cada nuevo asignado usando `buildTaskAssignmentEmail`.
    - Registrar cada envío en `email_logs` (project_id, task_id, to_email, subject, body_preview).
  - Si SMTP no está configurado, responder 501 solo cuando `notify=true` (no romper asignación básica).

- Editar [ProjectPage.vue](file:///workspace/src/pages/ProjectPage.vue)
  - En “Asignados” agregar:
    - Toggle “Notificar por correo” + campo “Mensaje” opcional.
    - Al guardar: `notify=true` y `note` con el texto.

## Decisiones y Supuestos

- Login por correo se implementa como magic link (OTP) con Supabase Auth.
- Invitaciones requieren que el usuario inicie sesión y que el email del usuario coincida con el email invitado.
- SMTP del backend estará configurado (variables en `.env` / `.env.example`) y se usará para invitaciones y notificaciones de asignación.
- Se usa `service role` solo en backend para:
  - Aceptar invitaciones (upsert en `project_members`).
  - Resolver emails por `userId` (Auth Admin API) al notificar asignaciones.
- No se introducen librerías nuevas; se usan Tailwind + Vue `<Transition>` para animaciones.

## Verificación (cómo comprobar que funciona)

- Frontend:
  - Iniciar sesión con Google como antes.
  - Login por correo: solicitar magic link, abrir enlace, confirmar sesión creada y redirección correcta.
  - Abrir `/invite?token=...` sin sesión: redirige a login y vuelve; con sesión: acepta invitación y navega al proyecto.
  - En Project -> Miembros: crear invitación, copiar link, reenviar y revocar; ver cambios en lista.
  - Asignar tarea con `notify=true`: verificar toasts y que el endpoint responde 201/200.
- Backend:
  - Probar endpoints con token válido:
    - `GET/POST/DELETE` de invitaciones.
    - `POST /invitations/accept`.
    - `PUT /tasks/:taskId/assignees` con y sin `notify`.
- DB:
  - Ejecutar migraciones en Supabase y verificar que `project_invitations` existe con RLS habilitado.
  - Verificar que `email_logs` registra envíos de invitación y notificaciones.

