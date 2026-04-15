<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import ToastHost from '@/components/ToastHost.vue'
import { apiFetch } from '@/lib/api'
import { useToastStore } from '@/stores/toast'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

type Project = {
  id: string
  name: string
  description: string | null
  status: 'active' | 'archived'
  created_at: string
}

type DashboardTask = {
  id: string
  projectId: string
  projectName: string
  title: string
  status: 'backlog' | 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  dueDate: string | null
}

type RecentTime = {
  id: string
  projectId: string
  taskId: string | null
  projectName: string
  entryDate: string
  minutes: number
  note: string | null
}

const toast = useToastStore()
const router = useRouter()

const loading = ref(false)
const projects = ref<Project[]>([])
const search = ref('')
const summary = ref<{
  projectCount: number
  myTasks: {
    counts: {
      backlog: number
      todo: number
      in_progress: number
      done: number
    }
    items: DashboardTask[]
  }
  recentTime: RecentTime[]
} | null>(null)

const name = ref('')
const description = ref('')

const canCreate = computed(() => name.value.trim().length >= 2)
const filteredProjects = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return projects.value
  return projects.value.filter((project) => {
    const haystack = `${project.name} ${project.description || ''}`.toLowerCase()
    return haystack.includes(term)
  })
})

const load = async () => {
  loading.value = true
  try {
    const [projectResponse, summaryResponse] = await Promise.all([
      apiFetch<{ success: boolean; projects: Project[] }>('/api/projects'),
      apiFetch<{ success: boolean; summary: NonNullable<typeof summary.value> }>('/api/dashboard-summary'),
    ])
    projects.value = projectResponse.projects
    summary.value = summaryResponse.summary
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo cargar el panel', message: e?.message })
  } finally {
    loading.value = false
  }
}

const createProject = async () => {
  if (!canCreate.value) return
  try {
    const r = await apiFetch<{ success: boolean; project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: name.value.trim(), description: description.value.trim() }),
    })
    toast.push({ tone: 'success', title: 'Proyecto creado' })
    name.value = ''
    description.value = ''
    projects.value = [r.project, ...projects.value]
    if (summary.value) {
      summary.value = {
        ...summary.value,
        projectCount: summary.value.projectCount + 1,
      }
    }
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo crear el proyecto', message: e?.message })
  }
}

const openMyTask = (task: DashboardTask) => {
  router.push({
    name: 'project',
    params: { projectId: task.projectId },
    query: { tab: 'tasks', taskId: task.id },
  })
}

onMounted(load)
</script>

<template>
  <AppShell>
    <div class="grid grid-cols-12 gap-6">
      <section class="col-span-12 lg:col-span-8">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Proyectos
          </div>
          <button
            class="ui-btn-primary px-3 py-2"
            :disabled="!canCreate"
            @click="createProject"
          >
            Nuevo proyecto
          </button>
        </div>

        <div class="mt-3 ui-card-muted p-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              v-model="name"
              class="ui-input"
              placeholder="Nombre del proyecto"
            >
            <input
              v-model="description"
              class="ui-input"
              placeholder="Descripción (opcional)"
            >
            <input
              v-model="search"
              class="ui-input"
              placeholder="Buscar proyecto"
            >
          </div>
        </div>

        <div class="mt-4 ui-card-muted">
          <div
            v-if="loading"
            class="p-4 text-sm text-slate-600 dark:text-slate-200/70"
          >
            Cargando…
          </div>
          <div
            v-else-if="filteredProjects.length === 0"
            class="p-4 text-sm text-slate-600 dark:text-slate-200/70"
          >
            {{ projects.length === 0 ? 'Sin proyectos todavía.' : 'No hay resultados para tu búsqueda.' }}
          </div>
          <div
            v-else
            class="divide-y divide-slate-200 dark:divide-slate-800"
          >
            <button
              v-for="p in filteredProjects"
              :key="p.id"
              class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-900/5 dark:hover:bg-white/5"
              @click="router.push({ name: 'project', params: { projectId: p.id } })"
            >
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {{ p.name }}
                </div>
                <div class="truncate text-xs text-slate-600 dark:text-slate-200/70">
                  {{ p.description || '—' }}
                </div>
              </div>
              <div class="shrink-0 ui-pill">
                {{ p.status }}
              </div>
            </button>
          </div>
        </div>
      </section>

      <section class="col-span-12 lg:col-span-4">
        <div class="ui-card-muted p-4">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Resumen
          </div>
          <div class="mt-2 text-sm text-slate-600 dark:text-slate-200/70">
            Vista rápida de asignaciones y registros recientes.
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <div class="text-xs text-slate-600 dark:text-slate-200/70">
                Proyectos
              </div>
              <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {{ summary?.projectCount ?? projects.length }}
              </div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <div class="text-xs text-slate-600 dark:text-slate-200/70">
                Mis tareas
              </div>
              <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {{ summary?.myTasks.items.length ?? 0 }}
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300/70">
              Estados
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                Backlog: {{ summary?.myTasks.counts.backlog ?? 0 }}
              </div>
              <div class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                Por hacer: {{ summary?.myTasks.counts.todo ?? 0 }}
              </div>
              <div class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                En curso: {{ summary?.myTasks.counts.in_progress ?? 0 }}
              </div>
              <div class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                Hechas: {{ summary?.myTasks.counts.done ?? 0 }}
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300/70">
              Mis tareas
            </div>
            <div
              v-if="!summary || summary.myTasks.items.length === 0"
              class="mt-3 text-sm text-slate-600 dark:text-slate-200/70"
            >
              Sin tareas asignadas.
            </div>
            <div
              v-else
              class="mt-3 space-y-2"
            >
              <button
                v-for="task in summary.myTasks.items"
                :key="task.id"
                class="w-full rounded-xl border border-slate-200 px-3 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5"
                @click="openMyTask(task)"
              >
                <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {{ task.title }}
                </div>
                <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
                  {{ task.projectName }} · {{ task.status }}
                </div>
                <div
                  v-if="task.dueDate"
                  class="mt-1 text-xs text-slate-500 dark:text-slate-300/70"
                >
                  Vence {{ task.dueDate }}
                </div>
              </button>
            </div>
          </div>

          <div class="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300/70">
              Horas recientes
            </div>
            <div
              v-if="!summary || summary.recentTime.length === 0"
              class="mt-3 text-sm text-slate-600 dark:text-slate-200/70"
            >
              Sin registros recientes.
            </div>
            <div
              v-else
              class="mt-3 space-y-2"
            >
              <div
                v-for="entry in summary.recentTime"
                :key="entry.id"
                class="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800"
              >
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {{ entry.projectName }} · {{ entry.minutes }} min
                </div>
                <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
                  {{ entry.entryDate }}
                </div>
                <div class="mt-1 text-xs text-slate-500 dark:text-slate-300/70">
                  {{ entry.note || 'Sin nota' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <ToastHost />
  </AppShell>
</template>
