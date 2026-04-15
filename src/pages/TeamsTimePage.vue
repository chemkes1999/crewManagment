<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import ToastHost from '@/components/ToastHost.vue'
import { apiFetch } from '@/lib/api'
import { useToastStore } from '@/stores/toast'
import { computed, onMounted, ref, watch } from 'vue'

type Project = {
  id: string
  name: string
}

type Member = {
  userId: string
  fullName: string | null
  avatarUrl: string | null
  projectRole: 'admin' | 'member'
  createdAt: string
}

type TimeEntry = {
  id: string
  project_id: string
  task_id: string | null
  user_id: string
  entry_date: string
  minutes: number
  note: string | null
}

const toast = useToastStore()
const from = ref('')
const to = ref('')
const selectedProjectId = ref('')
const selectedUserId = ref('')
const entries = ref<TimeEntry[]>([])
const projects = ref<Project[]>([])
const members = ref<Member[]>([])

const query = computed(() => {
  const params = new URLSearchParams()
  if (selectedProjectId.value) params.set('projectId', selectedProjectId.value)
  if (selectedUserId.value) params.set('userId', selectedUserId.value)
  if (from.value) params.set('from', from.value)
  if (to.value) params.set('to', to.value)
  const s = params.toString()
  return s ? `?${s}` : ''
})

const totalMinutes = computed(() => entries.value.reduce((sum, entry) => sum + entry.minutes, 0))
const totalHours = computed(() => (totalMinutes.value / 60).toFixed(1))
const projectMap = computed(() => new Map(projects.value.map((project) => [project.id, project.name])))

const displayMember = (member: Member) => member.fullName || `Usuario ${member.userId.slice(0, 8)}`

const loadProjects = async () => {
  try {
    const r = await apiFetch<{ success: boolean; projects: Project[] }>('/api/projects')
    projects.value = r.projects
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudieron cargar proyectos', message: e?.message })
  }
}

const loadMembers = async () => {
  if (!selectedProjectId.value) {
    members.value = []
    selectedUserId.value = ''
    return
  }

  try {
    const r = await apiFetch<{ success: boolean; members: Member[] }>(`/api/projects/${selectedProjectId.value}/members`)
    members.value = r.members
    if (selectedUserId.value && !members.value.some((member) => member.userId === selectedUserId.value)) {
      selectedUserId.value = ''
    }
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudieron cargar miembros', message: e?.message })
  }
}

const load = async () => {
  try {
    const r = await apiFetch<{ success: boolean; timeEntries: TimeEntry[] }>(`/api/time-entries${query.value}`)
    entries.value = r.timeEntries
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo cargar tiempos', message: e?.message })
  }
}

watch(selectedProjectId, async () => {
  await loadMembers()
})

onMounted(async () => {
  await loadProjects()
  await load()
})
</script>

<template>
  <AppShell>
    <div class="ui-card-muted p-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-end">
        <div class="flex-1">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Registro de tiempo
          </div>
          <div class="mt-1 text-sm text-slate-600 dark:text-slate-200/70">
            En el MVP, los miembros ven sus registros y los admins ven todo por proyecto.
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-5">
          <select
            v-model="selectedProjectId"
            class="ui-select"
          >
            <option value="">
              Todos los proyectos
            </option>
            <option
              v-for="project in projects"
              :key="project.id"
              :value="project.id"
            >
              {{ project.name }}
            </option>
          </select>
          <select
            v-model="selectedUserId"
            class="ui-select"
            :disabled="!selectedProjectId"
          >
            <option value="">
              Todos los miembros
            </option>
            <option
              v-for="member in members"
              :key="member.userId"
              :value="member.userId"
            >
              {{ displayMember(member) }}
            </option>
          </select>
          <input
            v-model="from"
            type="date"
            class="ui-input"
          >
          <input
            v-model="to"
            type="date"
            class="ui-input"
          >
          <button
            class="ui-btn-primary h-10"
            @click="load"
          >
            Filtrar
          </button>
        </div>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <div class="ui-card-muted p-4">
        <div class="text-xs text-slate-600 dark:text-slate-200/70">
          Registros filtrados
        </div>
        <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {{ entries.length }}
        </div>
      </div>
      <div class="ui-card-muted p-4">
        <div class="text-xs text-slate-600 dark:text-slate-200/70">
          Minutos totales
        </div>
        <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {{ totalMinutes }}
        </div>
      </div>
      <div class="ui-card-muted p-4">
        <div class="text-xs text-slate-600 dark:text-slate-200/70">
          Horas totales
        </div>
        <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {{ totalHours }}
        </div>
      </div>
    </div>

    <div class="mt-4 ui-card-muted">
      <div
        v-if="entries.length === 0"
        class="p-4 text-sm text-slate-600 dark:text-slate-200/70"
      >
        Sin datos.
      </div>
      <div
        v-else
        class="divide-y divide-slate-200 dark:divide-slate-800"
      >
        <div
          v-for="e in entries"
          :key="e.id"
          class="px-4 py-3"
        >
          <div class="flex items-center justify-between">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ e.entry_date }} · {{ e.minutes }} min
            </div>
            <div class="text-xs text-slate-600 dark:text-slate-200/70">
              {{ e.user_id.slice(0, 8) }}
            </div>
          </div>
          <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
            Proyecto: {{ projectMap.get(e.project_id) || e.project_id.slice(0, 8) }} · Tarea: {{ e.task_id ? e.task_id.slice(0, 8) : '—' }}
          </div>
          <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
            {{ e.note || '—' }}
          </div>
        </div>
      </div>
    </div>

    <ToastHost />
  </AppShell>
</template>
