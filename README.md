# Gestor de Proyectos (Vue + Express + Supabase)

Aplicación tipo “Jira-lite” para proyectos, tareas, miembros, registro de tiempo, documentos y envío de emails.  
Frontend en Vue 3 (Vite) y API en Express desplegada como función serverless en Vercel.

## Requisitos
- Node.js + npm
- Proyecto en Supabase (DB + Auth)
- (Opcional) SMTP para envío de emails

## Variables de entorno
Copia la plantilla y rellena valores reales:

```bash
cp .env.example .env
```

Variables (resumen):
- Frontend (Vite):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Backend (API):
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (solo servidor; no debe llegar al cliente)
- Producción / Vercel:
  - `APP_PUBLIC_URL` (obligatoria en producción: CORS + enlaces de email)
- SMTP (opcional):
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - Si no están configuradas, el endpoint de envío devuelve 501 “SMTP not configured”.

## Supabase (DB + Storage)
1) Crea un proyecto en Supabase.
2) Aplica las migraciones SQL en orden desde:
   - [/supabase/migrations](file:///workspace/supabase/migrations)

Puedes ejecutarlas pegándolas en el SQL Editor de Supabase (o con CLI si lo prefieres).

Notas:
- Se crea la estructura de tablas y políticas RLS para `projects`, `tasks`, `time_entries`, etc.
- Se crea el bucket privado `project-documents` (migración `0002_storage.sql`).

## Supabase Auth (Google OAuth)
La app usa login con Google.

En Supabase:
1) Auth → Providers → habilita Google y configura tu Client ID/Secret.
2) Auth → URL Configuration → añade Redirect URLs, por ejemplo:
   - Local: `http://localhost:5173/login`
   - Producción: `https://<tu-dominio-vercel>/login`

## Desarrollo local
Instala dependencias y arranca frontend + API:

```bash
npm ci
npm run dev
```

- Frontend: `http://localhost:5173`
- API local (Express): `http://localhost:3001`
- En desarrollo, Vite hace proxy de `/api` hacia `http://localhost:3001`.

Health check:
- `http://localhost:5173/api/health`

## Despliegue en Vercel
1) Importa el repositorio en Vercel.
2) Configura las variables de entorno (Project → Settings → Environment Variables) copiando las claves de `.env.example` con valores reales.
3) Asegura `APP_PUBLIC_URL` apuntando al dominio público (sin slash final), por ejemplo:
   - `https://mi-app.vercel.app`

Verificación mínima:
- `https://<tu-dominio>/api/health` devuelve 200.
- Login con Google redirige correctamente a `/login` y, tras autenticarse, la app carga el dashboard.

## Scripts útiles
- `npm run lint`
- `npm run check` (typecheck)
- `npm run build`
