# Diseño de Pantallas (desktop-first) — Gestor tipo Jira

## Global Styles (Design Tokens)
- Implementación: Tailwind CSS 3 (utilidades + tokens en `tailwind.config.*`).
- Build de estilos: Vite + PostCSS (autoprefixer) + content scan (purga) apuntando a `index.html` y `src/**/*.{vue,ts}`.
- Modo oscuro: estrategia `darkMode: 'class'` (se aplica la clase `dark` en `html`/`body`).
- Layout: Desktop-first con CSS Grid para estructura y Flexbox para controles.
- Breakpoints: base desktop ≥ 1200px; tablet 768–1199px; móvil ≤ 767px (colapsa sidebar y reduce densidad).
- Colores (tokens semánticos; mapear en `theme.extend.colors`):
  - Background: #0B1220 (app) / #0F172A (paneles)
  - Surface/Card: #111C33; Border: #1F2A44
  - Text: #E5E7EB; Muted: #94A3B8
  - Primary: #3B82F6; Success: #22C55E; Warning: #F59E0B; Danger: #EF4444
- Tipografía: Inter/system; escala 12/14/16/20/24.
- Componentización de estilos:
  - Reutilizables con `@layer components` + `@apply` (por ejemplo `.btn`, `.btn-primary`, `.input`, `.card`) para consistencia.
  - Evitar construir clases dinámicamente (para que el purge/content scan no las elimine); usar bindings de Vue (`:class` con arrays/objetos).
- Estados UI:
  - Botones: hover oscurece ~8%, disabled opacidad 40%, focus ring 2px (Primary).
  - Inputs: altura 36–40px, borde Border, `focus:ring-2 focus:ring-primary`.
  - Links: Primary, underline en hover.
- Transiciones: 150–200ms (color, sombra, transform).

## Componentes globales
- AppShell: Sidebar izquierda (collapsible) + TopBar + Content.
- Sidebar: enlaces a Inicio, Equipos y Tiempo, y acceso rápido a proyectos recientes.
- TopBar: buscador, selector de proyecto (si aplica), avatar/menú (logout).
- Toasts: confirmación/errores (envío correo, subida doc, guardados).

---

## Página: Login
### Meta Information
- Title: “Acceso — Gestor de Proyectos”
- Description: “Inicia sesión con Google para acceder a tus proyectos.”
- Open Graph: og:title, og:description, og:type=website

### Page Structure
- Contenedor centrado (max-width 420px) con card.

### Sections & Components
1) Header
- Logo + nombre de la app.
2) Card de acceso
- Botón “Continuar con Google” (full width).
- Texto legal breve: “Al continuar aceptas…” (opcional).
3) Estados
- Loading: spinner dentro del botón.
- Error: alert compacta si falla OAuth/callback.

---

## Página: Inicio / Panel
### Meta Information
- Title: “Panel — Gestor de Proyectos”
- Description: “Resumen de proyectos, tareas y horas registradas.”

### Layout
- Grid 12 columnas.
- Sidebar fija (260px) en desktop; en tablet se colapsa a iconos; móvil como drawer.

### Page Structure
- Fila superior: “Proyectos” + acciones.
- 2 columnas principales:
  - Izquierda (8): lista/tabla de proyectos.
  - Derecha (4): resumen “Mis tareas” + “Horas recientes”.

### Sections & Components
1) Lista de proyectos
- Toolbar: buscador + botón “Nuevo proyecto” (solo admin).
- Tabla: Nombre, Estado, Última actualización (si existe), Acción “Abrir”.
2) Mis tareas
- Cards por estado (Todo / En progreso / Done) con conteo y top 5.
- Click abre Proyecto filtrado por “asignado a mí”.
3) Horas recientes
- Lista compacta de últimos registros (tarea/proyecto, fecha, minutos).

---

## Página: Proyecto (Espacio de trabajo)
### Meta Information
- Title: “Proyecto — {Nombre}”
- Description: “Tablero de tareas, asignaciones, tiempos, documentos y correos del proyecto.”

### Layout
- TopBar contextual con breadcrumbs: Inicio / Proyecto.
- Subnavegación por pestañas: Tareas | Tiempos | Documentos | Correos.

### Page Structure
- Header del proyecto (nombre, estado, miembros visibles).
- Contenido por pestaña.

### Sections & Components
1) Header del proyecto
- Título + badge estado.
- Avatares miembros (tooltip) + botón “Gestionar miembros” (admin).

2) Pestaña: Tareas
- Toggle de vista: “Tablero” / “Lista”.
- Tablero (Kanban): 4 columnas (Backlog, Todo, In progress, Done).
- Card de tarea: título, prioridad, due date, avatares asignados.
- Interacciones:
  - Drag & drop entre columnas (actualiza status).
  - Click card → Drawer lateral “Detalle de tarea”.
- Drawer detalle:
  - Campos editables: título, descripción, prioridad, due date, status.
  - Asignados (multi-select), comentarios (lista + input).
  - Acciones: Guardar, Archivar/eliminar (según permisos).

3) Pestaña: Tiempos
- Filtros: rango fechas, miembro, tarea (opcional).
- Form rápido “Registrar tiempo”: tarea (opcional), fecha, minutos, nota.
- Tabla de registros con acciones editar/eliminar (propio).

4) Pestaña: Documentos
- Botón “Subir documento” (abre modal).
- Modal: selector archivo + (opcional) vincular a tarea + subir.
- Lista: filename, subido por, fecha, acción descargar.

5) Pestaña: Correos
- Form “Enviar correo”: Para, Asunto, Cuerpo (textarea).
- Adjuntos: selector opcional (si se soporta) o insertar links a documentos.
- Historial: lista de envíos (to, subject, fecha, autor) con preview.

---

## Página: Equipos y Tiempo
### Meta Information
- Title: “Equipos y Tiempo”
- Description: “Gestiona equipos/miembros y revisa registros de tiempo.”

### Layout
- Split view (2 columnas):
  - Izquierda (4): listado de equipos.
  - Derecha (8): detalle de equipo + sección de tiempos.

### Sections & Components
1) Equipos
- Lista con buscador.
- Botón “Nuevo equipo” (admin).
- Selección de equipo carga detalle.

2) Detalle de equipo
- Nombre editable (admin).
- Miembros: tabla (nombre, email, rol si aplica) + acciones añadir/quitar (admin).

3) Tiempo (vista consolidada)
- Filtros: equipo, proyecto, miembro, rango fechas.
- Tabla: fecha, miembro, proyecto, tarea, minutos, nota.
- Acción “Exportar CSV” (descarga).
