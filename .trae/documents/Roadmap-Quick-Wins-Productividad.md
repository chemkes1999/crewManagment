# Plan de mejoras: quick wins de productividad

## Resumen
- Objetivo: ampliar el MVP con mejoras de productividad de alto impacto y baja/mediana complejidad, manteniendo el stack actual (`Vue 3 + Pinia + Express + Supabase`) y sin abrir frentes innecesarios.
- Alcance propuesto para la siguiente iteración:
  1. Asignaciones de tareas visibles y editables.
  2. Edición completa de tareas y vista tipo Kanban.
  3. Resumen útil en el panel y filtros reales en tiempos.
- Fuera de alcance para esta iteración: comentarios, notificaciones en tiempo real, aprobaciones de tiempo, exportación CSV, adjuntos en correos y gestión completa de equipos.

## Current State Analysis
- `src/pages/DashboardPage.vue`
  - Ya lista proyectos y permite crear nuevos.
  - El bloque `Resumen` todavía muestra placeholders (`Tareas` y `Horas` en `—`).
  - No existe buscador, ni vista de “mis tareas”, ni “horas recientes”, aunque el PRD sí lo contempla.
- `src/pages/ProjectPage.vue`
  - Ya concentra pestañas de tareas, tiempos, documentos y correos.
  - Las tareas solo permiten crear con título/prioridad y editar `status`/`priority`.
  - No hay Kanban, detalle ampliado, fecha límite visible ni asignados.
  - La pestaña de documentos reutiliza `timeTaskId` para vincular tarea al subir archivos; funcionalmente sirve, pero no está modelado como control propio de documentos.
- `src/pages/TeamsTimePage.vue`
  - Solo filtra por rango de fechas.
  - No expone filtros por proyecto o miembro, aunque el endpoint backend ya acepta `projectId` y `userId`.
- `api/routes/api.ts`
  - Ya existen endpoints para proyectos, tareas, tiempos, documentos, correos y `GET /api/me`.
  - `PATCH /api/tasks/:taskId` ya soporta `title`, `description`, `status`, `priority` y `dueDate`, pero la UI no aprovecha casi nada de eso.
  - No existen endpoints para listar miembros por proyecto ni para asignar personas a tareas, pese a que la tabla `task_assignees` ya existe.
- `supabase/migrations/0001_init.sql`
  - Ya están creadas `project_members` y `task_assignees`, con RLS base.
  - Esto permite implementar asignaciones sin rediseñar el modelo principal.
- `.trae/documents/PRD-Gestor-Proyectos-Tareas.md`
  - El PRD ya menciona asignaciones, resumen del panel, filtros de tiempo y vista de tablero/lista, por lo que estas mejoras están alineadas con la dirección original del producto.

## Proposed Changes

### 1. Asignaciones de tareas
- Objetivo
  - Permitir ver y editar responsables por tarea para que el workspace deje de ser una lista plana y empiece a soportar trabajo en equipo real.
- Archivos a tocar
  - `api/routes/api.ts`
  - `supabase/migrations/0003_task_assignments_api_support.sql` (solo si hace falta ajustar política/performance; idealmente evitarla si el esquema actual alcanza)
  - `src/pages/ProjectPage.vue`
- Qué se agrega
  - `GET /api/projects/:projectId/members`: devuelve miembros del proyecto con datos básicos de perfil.
  - `GET /api/projects/:projectId/tasks`: extender `select` para incluir asignados por tarea.
  - `PUT /api/tasks/:taskId/assignees`: reemplaza el conjunto de asignados de una tarea.
  - En la UI de tareas: selector simple de asignados por tarea y visualización compacta de responsables.
- Cómo implementarlo
  - Backend:
    - Leer miembros desde `project_members` unido a `profiles`.
    - Leer asignados desde `task_assignees`.
    - Validar que el usuario autenticado sea miembro del proyecto antes de consultar o mutar asignaciones.
    - Validar que los usuarios asignados pertenezcan al mismo proyecto.
  - Frontend:
    - Cargar miembros del proyecto junto con tareas.
    - Mostrar asignados como chips o texto compacto dentro de cada tarea.
    - Añadir control de asignación dentro del detalle de tarea o en una acción inline.
- Decisión
  - Mantener asignación múltiple, porque el modelo ya lo soporta y evita rehacer API más adelante.

### 2. Edición completa de tareas + vista Kanban
- Objetivo
  - Convertir la pestaña `Tareas` en un espacio de trabajo real, no solo en una lista con dos selects.
- Archivos a tocar
  - `src/pages/ProjectPage.vue`
  - `src/lib/utils.ts` o un nuevo helper local para agrupar por estado si conviene
  - `api/routes/api.ts` (solo para pequeños ajustes de payload o respuesta)
- Qué se agrega
  - Vista conmutada `Lista / Kanban`.
  - Edición de `title`, `description`, `priority`, `status` y `dueDate`.
  - Panel lateral o bloque expandible para detalle de tarea.
  - Resaltado visual de prioridad y vencimiento.
- Cómo implementarlo
  - Reutilizar `PATCH /api/tasks/:taskId`, ya presente.
  - Mantener la lista actual como vista básica.
  - Agregar agrupación de tareas por `backlog`, `todo`, `in_progress`, `done`.
  - El primer corte no necesita drag & drop complejo: mover entre columnas puede hacerse con select o acción rápida por tarjeta.
  - Incluir en UI campos ya soportados por backend pero hoy ocultos.
- Decisión
  - No introducir una librería nueva de drag & drop en esta iteración; primero se valida el flujo de tablero con controles simples.

### 3. Panel con resumen real
- Objetivo
  - Hacer que `DashboardPage` sirva como punto de arranque diario y no solo como lista de proyectos.
- Archivos a tocar
  - `api/routes/api.ts`
  - `src/pages/DashboardPage.vue`
- Qué se agrega
  - Bloque “Mis tareas” con conteo por estado y lista breve de pendientes del usuario.
  - Bloque “Horas recientes” con últimos registros del usuario autenticado.
  - Buscador local de proyectos por nombre.
- Cómo implementarlo
  - Añadir endpoint resumido, por ejemplo `GET /api/dashboard-summary`, para evitar 3-4 requests y lógica duplicada en frontend.
  - El resumen debe devolver:
    - tareas asignadas al usuario, agrupadas por estado;
    - últimos registros propios de `time_entries`;
    - opcionalmente total de proyectos visibles.
  - En frontend:
    - reemplazar placeholders del resumen;
    - filtrar proyectos en memoria por texto;
    - enlazar “mis tareas” hacia `project` con `tab=tasks&taskId=...`.
- Decisión
  - Centralizar el resumen en un endpoint propio en vez de recomponerlo solo en frontend.

### 4. Filtros útiles en Equipos y Tiempo
- Objetivo
  - Aprovechar capacidades que ya existen en backend y acercar esa pantalla a una vista operativa real.
- Archivos a tocar
  - `src/pages/TeamsTimePage.vue`
  - `api/routes/api.ts` (solo si falta endpoint auxiliar para opciones de filtro)
- Qué se agrega
  - Filtro por proyecto.
  - Filtro por miembro.
  - Totales visibles del período filtrado.
- Cómo implementarlo
  - Reutilizar `GET /api/time-entries?projectId&userId&from&to`, que ya soporta esos parámetros.
  - Cargar lista de proyectos visibles y, según necesidad, miembros para poblar selects.
  - Calcular total de minutos/horas en frontend con los resultados ya filtrados.
- Decisión
  - Dejar exportación CSV para la siguiente fase; primero validar filtros y resumen.

## Orden recomendado de ejecución
1. Extender backend para miembros, asignados y resumen del panel.
2. Actualizar `ProjectPage.vue` con detalle de tarea, asignados y vista Kanban básica.
3. Completar `DashboardPage.vue` con resumen real y buscador.
4. Mejorar `TeamsTimePage.vue` con filtros y totales.

## Assumptions & Decisions
- Se prioriza productividad sobre administración completa de equipos.
- Se mantiene el stack actual; no se agregan servicios externos ni otro framework UI.
- Se aprovecha el modelo existente (`project_members`, `task_assignees`) antes de crear nuevas tablas.
- No se implementan comentarios en esta fase porque requieren nueva entidad y más decisiones de UX.
- No se implementa realtime en esta fase; los datos se refrescan por carga explícita y actualización local.
- Si las políticas RLS actuales alcanzan, se evita crear migración nueva; solo se agrega si la implementación muestra una limitación real.

## Verification Steps
- Backend
  - Verificar que un miembro pueda listar miembros del proyecto y asignar usuarios válidos.
  - Verificar que no se pueda asignar un usuario ajeno al proyecto.
  - Verificar que el resumen del panel solo devuelva tareas/tiempos visibles para el usuario autenticado.
- Frontend
  - Crear tarea, editar todos sus campos y confirmar persistencia tras recarga.
  - Asignar y desasignar miembros, validando refresco visual inmediato.
  - Navegar desde “Mis tareas” en panel al proyecto y resaltar la tarea objetivo.
  - Filtrar tiempos por fecha/proyecto/miembro y comprobar total del rango.
- Calidad
  - Ejecutar `npm run check` y `npm run lint`.
  - Revisar diagnósticos de VS Code en archivos modificados.
