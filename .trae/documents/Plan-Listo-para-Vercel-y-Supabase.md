# Plan: Dejar el proyecto “listo” (Vercel + Supabase)

## Resumen
Dejar el repositorio listo para desarrollo y despliegue en Vercel, asegurando que:
- La configuración y documentación de instalación no dependa de conocimiento implícito.
- Las variables de entorno se gestionen de forma segura (sin secretos versionados).
- La API restrinja CORS en producción.
- Queden definidos los pasos de provisión de Supabase (DB + Auth + Storage) y, opcionalmente, SMTP.

## Análisis del estado actual (según repo)
- Frontend: Vue 3 + Vite + TypeScript en [/workspace/src](file:///workspace/src).
- Backend: Express empaquetado como handler serverless para Vercel en [/workspace/api/index.ts](file:///workspace/api/index.ts) y app Express en [/workspace/api/app.ts](file:///workspace/api/app.ts).
- Datos: migraciones SQL para Supabase en [/workspace/supabase/migrations](file:///workspace/supabase/migrations).
- Despliegue: rewrites configurados en [/workspace/vercel.json](file:///workspace/vercel.json).
- Variables de entorno: existe plantilla en [/workspace/.env.example](file:///workspace/.env.example), pero hay ficheros .env en el repo y actualmente NO están ignorados por git (falta en [/workspace/.gitignore](file:///workspace/.gitignore)).
- CORS: la API está abierta (cors() sin restricciones) en [/workspace/api/app.ts](file:///workspace/api/app.ts).
- Documentación: el README actual es boilerplate de Vite/Vue y no describe setup real del proyecto ([/workspace/README.md](file:///workspace/README.md)).

## Objetivo y criterios de éxito
El proyecto queda “listo” si:
- Se puede clonar el repo, configurar variables, aplicar migraciones y levantar el entorno local sin pasos ambiguos.
- En Vercel, el frontend carga y las rutas /api funcionan con autenticación Supabase.
- No hay secretos en el repositorio (y hay guía clara para configurar .env).
- En producción, la API solo acepta requests desde el/los orígenes permitidos.

## Cambios propuestos (decision-complete)

### 1) Endurecer gestión de secretos y entorno
**Archivos:**
- Editar [/workspace/.gitignore](file:///workspace/.gitignore)
- Eliminar del repo (y dejar solo como archivos locales): [/workspace/.env](file:///workspace/.env) y [/workspace/api/.env](file:///workspace/api/.env)
- Revisar y ampliar (si procede) [/workspace/.env.example](file:///workspace/.env.example)

**Qué y cómo:**
- Añadir a .gitignore:
  - `.env`
  - `.env.*` (excepto `.env.example`)
  - `/api/.env`
  - `/api/.env.*` (excepto una posible plantilla si se decide crearla)
- Eliminar los .env versionados del repositorio para evitar fuga de secretos.
- Mantener una única fuente de verdad para variables:
  - `.env.example` en raíz con todo lo necesario para frontend y backend (ya existe).
  - En local: usar `.env` en raíz para ambos (backend ya llama dotenv.config() en app.ts; Vite también lee `.env`).

**Notas importantes:**
- Si esos `.env` ya se subieron alguna vez con claves reales, el plan asume rotación de claves en Supabase/SMTP (acción manual fuera del repo).

### 2) Restringir CORS en producción (Vercel)
**Archivos:**
- Editar [/workspace/api/app.ts](file:///workspace/api/app.ts)
- Opcional: ajustar [/workspace/.env.example](file:///workspace/.env.example)

**Qué y cómo:**
- Reemplazar `app.use(cors())` por una configuración con:
  - En desarrollo: permitir `http://localhost:5173` (y opcionalmente `http://127.0.0.1:5173`).
  - En producción: permitir únicamente el origen indicado por `APP_PUBLIC_URL` (sin trailing slash).
  - Permitir cabeceras necesarias: `Authorization`, `Content-Type`.
  - Permitir métodos necesarios: `GET,POST,PATCH,PUT,DELETE,OPTIONS`.
- Fijar la decisión de configuración vía env:
  - `APP_PUBLIC_URL` ya existe y se reutiliza como base URL para emails en [/workspace/api/lib/emailTemplates.ts](file:///workspace/api/lib/emailTemplates.ts), por lo que se adopta como fuente de verdad también para CORS en producción.

### 3) Documentación de setup end-to-end (local + Vercel)
**Archivos:**
- Reescribir [/workspace/README.md](file:///workspace/README.md)
- (Opcional) Añadir un doc más extenso: `/workspace/docs/SETUP.md`

**Qué y cómo (contenido mínimo del README):**
- Requisitos:
  - Node (indicar versión recomendada; si se decide fijar, añadir `"engines"` a package.json).
  - Cuenta Supabase + proyecto.
  - (Opcional) SMTP si se usan emails.
- Variables de entorno:
  - Explicar qué va en `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (frontend) vs `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (backend).
  - Explicar `APP_PUBLIC_URL` (obligatoria para prod: CORS + enlaces de email).
  - Explicar variables SMTP y que si no están, endpoint devuelve 501.
- Supabase (pasos manuales y verificables):
  - Aplicar migraciones de `/supabase/migrations` (vía SQL Editor o CLI si se quiere añadir en el futuro).
  - Configurar Auth:
    - Activar Google OAuth en Supabase.
    - Configurar Redirect URLs para local (p. ej. `http://localhost:5173/login`) y para Vercel (p. ej. `https://<tu-dominio>/login`).
  - Confirmar que existe el bucket `project-documents` (migración 0002_storage.sql) y que el backend usa service role para subir/firmar descargas.
- Comandos:
  - `npm ci`
  - `npm run dev` (cliente + server local)
  - `npm run lint`, `npm run check`, `npm run build`
- Despliegue a Vercel:
  - Variables de entorno a cargar en Vercel (copiar desde `.env.example`, con valores reales).
  - Verificar que `/api/health` responde en producción.

### 4) Verificación de rewrites API en Vercel (sin cambiar si ya funciona)
**Archivos:**
- Revisar comportamiento con [/workspace/vercel.json](file:///workspace/vercel.json) y handler [/workspace/api/index.ts](file:///workspace/api/index.ts)

**Qué y cómo:**
- Validar en entorno preview/prod:
  - `/api/health` devuelve 200.
  - `/api/me` devuelve 401 sin token y 200 con token válido.
  - Rutas con parámetros (p. ej. `/api/projects/<id>/tasks`) funcionan.
- Solo si se detecta que Vercel no preserva correctamente la ruta original al reescribir a `/api/index`:
  - Ajustar `vercel.json` para preservar el path con query (p. ej. `destination: "/api/index?path=$1"`) y adaptar `api/app.ts` para montar rutas en `/` en vez de `/api`.
  - Este ajuste se considera contingente a una verificación fallida; por defecto no se toca.

## Suposiciones y decisiones cerradas
- Target de despliegue: Vercel.
- Secretos: se ignoran y se eliminan del repo; queda `.env.example` como plantilla.
- CORS: restringido en producción; abierto/permitido para localhost en desarrollo.
- `APP_PUBLIC_URL` se usa como fuente de verdad para:
  - Links en emails (ya implementado).
  - Allowed origin de CORS en producción (a implementar).

## Pasos de verificación (post-implementación)
- Local:
  - `npm ci`
  - `npm run lint`
  - `npm run check`
  - `npm run build`
  - `npm run dev` y comprobar:
    - UI carga en `http://localhost:5173`
    - API health en `http://localhost:5173/api/health` (vía proxy Vite)
    - Login con Google redirige correctamente y luego `/api/me` funciona
- Vercel (Preview/Prod):
  - Confirmar variables de entorno cargadas.
  - Visitar la app, login con Google, navegación básica:
    - dashboard, crear proyecto, crear tarea, registrar tiempo
    - subir documento (requiere service key en backend)
  - Probar emails (si SMTP configurado) o confirmar respuesta 501 si no lo está.

