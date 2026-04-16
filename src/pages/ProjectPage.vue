<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import ToastHost from '@/components/ToastHost.vue'
import { apiFetch, apiFetchForm } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

type Project = { id: string; name: string; description: string | null; status: string }
type Assignee = { userId: string; fullName: string | null; avatarUrl: string | null }
type Member = Assignee & { projectRole: 'admin' | 'member'; createdAt: string }
type Task = {
  id: string
  project_id: string
  title: string
  description: string | null
  status: 'backlog' | 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  created_at: string
  assignees: Assignee[]
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
type DocumentItem = { id: string; filename: string; storage_path: string; task_id: string | null; created_at: string }
type EmailLog = { id: string; to_email: string; subject: string; body_preview: string; sent_at: string }
type Invitation = {
  id: string
  invited_email: string
  project_role: 'admin' | 'member'
  token: string
  created_at: string
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
  created_by: string
}
type TaskStatus = Task['status']
type TaskPriority = Task['priority']

const TASK_STATUSES: Array<{ value: TaskStatus; label: string }> = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Por hacer' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'done', label: 'Hecha' },
]

const PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
]

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

const project = ref<Project | null>(null)
const tasks = ref<Task[]>([])
const members = ref<Member[]>([])
const timeEntries = ref<TimeEntry[]>([])
const documents = ref<DocumentItem[]>([])
const emails = ref<EmailLog[]>([])
const invitations = ref<Invitation[]>([])

const tab = ref<'tasks' | 'time' | 'docs' | 'emails' | 'members'>('tasks')
const taskView = ref<'list' | 'kanban'>('kanban')
const selectedTaskId = ref('')

const newTaskTitle = ref('')
const newTaskPriority = ref<TaskPriority>('medium')

const taskTitle = ref('')
const taskDescription = ref('')
const taskStatus = ref<TaskStatus>('todo')
const taskPriority = ref<TaskPriority>('medium')
const taskDueDate = ref('')
const selectedAssigneeUserIds = ref<string[]>([])
const notifyAssignees = ref(false)
const assigneeNote = ref('')

const timeDate = ref(new Date().toISOString().slice(0, 10))
const timeMinutes = ref(30)
const timeNote = ref('')
const timeTaskId = ref('')

const selectedDocTaskId = ref('')

const emailTo = ref('')
const emailSubject = ref('')
const emailBody = ref('')
const emailTaskId = ref('')

const inviteEmail = ref('')
const inviteRole = ref<'admin' | 'member'>('member')
const inviteNote = ref('')

const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value) || null)
const taskColumns = computed(() =>
  TASK_STATUSES.map((column) => ({
    ...column,
    items: tasks.value.filter((task) => task.status === column.value),
  })),
)

const applyRouteContext = () => {
  const qTab = route.query.tab
  if (qTab === 'tasks' || qTab === 'time' || qTab === 'docs' || qTab === 'emails' || qTab === 'members') {
    tab.value = qTab
  }

  const qTaskId = route.query.taskId
  selectedTaskId.value = typeof qTaskId === 'string' ? qTaskId : ''
}

const setTab = (nextTab: 'tasks' | 'time' | 'docs' | 'emails' | 'members') => {
  tab.value = nextTab
}

const statusLabel = (status: TaskStatus) => TASK_STATUSES.find((item) => item.value === status)?.label || status
const priorityLabel = (priority: TaskPriority) => PRIORITIES.find((item) => item.value === priority)?.label || priority
const displayPerson = (person: Assignee | Member) => person.fullName || `Usuario ${person.userId.slice(0, 8)}`
const formatAssignees = (task: Task) => task.assignees.map(displayPerson).join(', ')
const isOverdue = (dueDate: string | null) => Boolean(dueDate && dueDate < new Date().toISOString().slice(0, 10))
const totalTaskCount = computed(() => tasks.value.length)
const myUserId = computed(() => auth.session?.user?.id || '')
const myProjectRole = computed(() => members.value.find((m) => m.userId === myUserId.value)?.projectRole || 'member')
const canAdmin = computed(() => myProjectRole.value === 'admin')

const syncTaskForm = (task: Task | null) => {
  if (!task) {
    taskTitle.value = ''
    taskDescription.value = ''
    taskStatus.value = 'todo'
    taskPriority.value = 'medium'
    taskDueDate.value = ''
    selectedAssigneeUserIds.value = []
    notifyAssignees.value = false
    assigneeNote.value = ''
    return
  }

  taskTitle.value = task.title
  taskDescription.value = task.description || ''
  taskStatus.value = task.status
  taskPriority.value = task.priority
  taskDueDate.value = task.due_date || ''
  selectedAssigneeUserIds.value = task.assignees.map((item) => item.userId)
  notifyAssignees.value = false
  assigneeNote.value = ''
}

const scrollToSelectedTask = async () => {
  if (!selectedTaskId.value || tab.value !== 'tasks') return
  await nextTick()
  const el = document.getElementById(`task-${selectedTaskId.value}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const openTask = async (taskId: string) => {
  selectedTaskId.value = taskId
  tab.value = 'tasks'
  await scrollToSelectedTask()
}

const loadMembers = async () => {
  try {
    const r = await apiFetch<{ success: boolean; members: Member[] }>(`/api/projects/${projectId.value}/members`)
    members.value = r.members
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudieron cargar miembros', message: e?.message })
  }
}

const loadInvitations = async () => {
  if (!canAdmin.value) {
    invitations.value = []
    return
  }
  try {
    const r = await apiFetch<{ success: boolean; invitations: Invitation[] }>(`/api/projects/${projectId.value}/invitations`)
    invitations.value = r.invitations
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudieron cargar invitaciones', message: e?.message })
  }
}

const loadAll = async () => {
  try {
    const p = await apiFetch<{ success: boolean; project: Project }>(`/api/projects/${projectId.value}`)
    project.value = p.project
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo cargar el proyecto', message: e?.message })
  }

  await loadMembers()
  await Promise.all([loadInvitations(), loadTasks(), loadTime(), loadDocs(), loadEmails()])
}

const loadTasks = async () => {
  try {
    const r = await apiFetch<{ success: boolean; tasks: Task[] }>(`/api/projects/${projectId.value}/tasks`)
    tasks.value = r.tasks
    if (selectedTaskId.value && !tasks.value.some((task) => task.id === selectedTaskId.value)) {
      selectedTaskId.value = ''
    }
    if (!selectedTaskId.value && tasks.value[0]) {
      selectedTaskId.value = tasks.value[0].id
    }
    await scrollToSelectedTask()
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudieron cargar tareas', message: e?.message })
  }
}

const createTask = async () => {
  if (newTaskTitle.value.trim().length < 2) return
  try {
    const r = await apiFetch<{ success: boolean; task: Omit<Task, 'assignees'> }>(`/api/projects/${projectId.value}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title: newTaskTitle.value.trim(), priority: newTaskPriority.value }),
    })
    const createdTask: Task = { ...r.task, assignees: [] }
    tasks.value = [createdTask, ...tasks.value]
    newTaskTitle.value = ''
    selectedTaskId.value = createdTask.id
    toast.push({ tone: 'success', title: 'Tarea creada' })
    await scrollToSelectedTask()
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo crear la tarea', message: e?.message })
  }
}

const patchTask = async (
  taskId: string,
  patch: Partial<{ title: string; description: string | null; status: TaskStatus; priority: TaskPriority; dueDate: string | null }>,
) => {
  const existing = tasks.value.find((task) => task.id === taskId)
  if (!existing) return

  try {
    const r = await apiFetch<{ success: boolean; task: Omit<Task, 'assignees'> }>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    tasks.value = tasks.value.map((task) =>
      task.id === taskId
        ? {
            ...r.task,
            assignees: existing.assignees,
          }
        : task,
    )
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo actualizar', message: e?.message })
  }
}

const saveTaskDetails = async () => {
  if (!selectedTask.value) return
  if (taskTitle.value.trim().length < 2) {
    toast.push({ tone: 'error', title: 'El título es demasiado corto' })
    return
  }

  await patchTask(selectedTask.value.id, {
    title: taskTitle.value.trim(),
    description: taskDescription.value.trim() || null,
    status: taskStatus.value,
    priority: taskPriority.value,
    dueDate: taskDueDate.value || null,
  })
  toast.push({ tone: 'success', title: 'Tarea actualizada' })
}

const toggleAssignee = (userId: string) => {
  if (selectedAssigneeUserIds.value.includes(userId)) {
    selectedAssigneeUserIds.value = selectedAssigneeUserIds.value.filter((id) => id !== userId)
    return
  }
  selectedAssigneeUserIds.value = [...selectedAssigneeUserIds.value, userId]
}

const saveAssignees = async () => {
  if (!selectedTask.value) return
  try {
    const r = await apiFetch<{ success: boolean; assignees: Assignee[] }>(`/api/tasks/${selectedTask.value.id}/assignees`, {
      method: 'PUT',
      body: JSON.stringify({
        assigneeUserIds: selectedAssigneeUserIds.value,
        notify: notifyAssignees.value,
        note: assigneeNote.value,
      }),
    })
    tasks.value = tasks.value.map((task) =>
      task.id === selectedTask.value?.id
        ? {
            ...task,
            assignees: r.assignees,
          }
        : task,
    )
    notifyAssignees.value = false
    assigneeNote.value = ''
    toast.push({ tone: 'success', title: 'Asignaciones guardadas' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudieron guardar asignaciones', message: e?.message })
  }
}

const inviteLink = (inv: Invitation) => `${window.location.origin}/invite?token=${encodeURIComponent(inv.token)}`
const isExpiredInvite = (inv: Invitation) => new Date(inv.expires_at).getTime() <= Date.now()
const inviteStatus = (inv: Invitation) => {
  if (inv.revoked_at) return 'Revocada'
  if (inv.accepted_at) return 'Aceptada'
  if (isExpiredInvite(inv)) return 'Expirada'
  return 'Pendiente'
}

const copyInviteLink = async (inv: Invitation) => {
  const link = inviteLink(inv)
  try {
    await navigator.clipboard.writeText(link)
    toast.push({ tone: 'success', title: 'Link copiado' })
  } catch {
    toast.push({ tone: 'error', title: 'No se pudo copiar', message: link })
  }
}

const createInvitation = async () => {
  if (!canAdmin.value) return
  const email = inviteEmail.value.trim()
  if (!email || !email.includes('@')) return
  try {
    const r = await apiFetch<{ success: boolean; invitation: Invitation }>(`/api/projects/${projectId.value}/invitations`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        projectRole: inviteRole.value,
        note: inviteNote.value.trim(),
      }),
    })
    invitations.value = [r.invitation, ...invitations.value]
    inviteEmail.value = ''
    inviteRole.value = 'member'
    inviteNote.value = ''
    toast.push({ tone: 'success', title: 'Invitación enviada' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo invitar', message: e?.message })
  }
}

const resendInvitation = async (inv: Invitation) => {
  if (!canAdmin.value) return
  try {
    await apiFetch<{ success: boolean }>(`/api/projects/${projectId.value}/invitations/${inv.id}/resend`, { method: 'POST' })
    toast.push({ tone: 'success', title: 'Invitación reenviada' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo reenviar', message: e?.message })
  }
}

const revokeInvitation = async (inv: Invitation) => {
  if (!canAdmin.value) return
  if (!window.confirm(`¿Revocar invitación para ${inv.invited_email}?`)) return
  try {
    await apiFetch<{ success: boolean }>(`/api/projects/${projectId.value}/invitations/${inv.id}`, { method: 'DELETE' })
    invitations.value = invitations.value.map((x) => (x.id === inv.id ? { ...x, revoked_at: new Date().toISOString() } : x))
    toast.push({ tone: 'success', title: 'Invitación revocada' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo revocar', message: e?.message })
  }
}

const updateMemberRole = async (userId: string, projectRole: 'admin' | 'member') => {
  if (!canAdmin.value) return
  try {
    const r = await apiFetch<{ success: boolean; member: { userId: string; projectRole: 'admin' | 'member' } }>(
      `/api/projects/${projectId.value}/members/${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ projectRole }),
      },
    )
    members.value = members.value.map((m) => (m.userId === userId ? { ...m, projectRole: r.member.projectRole } : m))
    toast.push({ tone: 'success', title: 'Rol actualizado' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo actualizar rol', message: e?.message })
  }
}

const removeMember = async (userId: string) => {
  if (!canAdmin.value) return
  const member = members.value.find((m) => m.userId === userId)
  if (!member) return
  if (!window.confirm(`¿Eliminar a ${displayPerson(member)} del proyecto?`)) return
  try {
    await apiFetch<{ success: boolean }>(`/api/projects/${projectId.value}/members/${userId}`, { method: 'DELETE' })
    members.value = members.value.filter((m) => m.userId !== userId)
    toast.push({ tone: 'success', title: 'Miembro eliminado' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo eliminar', message: e?.message })
  }
}

const loadTime = async () => {
  try {
    const r = await apiFetch<{ success: boolean; timeEntries: TimeEntry[] }>(
      `/api/time-entries?projectId=${encodeURIComponent(projectId.value)}`,
    )
    timeEntries.value = r.timeEntries
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo cargar tiempos', message: e?.message })
  }
}

const addTime = async () => {
  try {
    const r = await apiFetch<{ success: boolean; timeEntry: TimeEntry }>(`/api/time-entries`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: projectId.value,
        taskId: timeTaskId.value,
        date: timeDate.value,
        minutes: Number(timeMinutes.value),
        note: timeNote.value,
      }),
    })
    timeEntries.value = [r.timeEntry, ...timeEntries.value]
    timeNote.value = ''
    toast.push({ tone: 'success', title: 'Tiempo registrado' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo registrar tiempo', message: e?.message })
  }
}

const removeTime = async (id: string) => {
  try {
    await apiFetch<{ success: boolean }>(`/api/time-entries/${id}`, { method: 'DELETE' })
    timeEntries.value = timeEntries.value.filter((x) => x.id !== id)
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo eliminar', message: e?.message })
  }
}

const loadDocs = async () => {
  try {
    const r = await apiFetch<{ success: boolean; documents: DocumentItem[] }>(`/api/projects/${projectId.value}/documents`)
    documents.value = r.documents
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudieron cargar documentos', message: e?.message })
  }
}

const onUpload = async (ev: Event) => {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const form = new FormData()
  form.append('file', file)
  if (selectedDocTaskId.value) form.append('taskId', selectedDocTaskId.value)

  try {
    const r = await apiFetchForm<{ success: boolean; document: DocumentItem }>(
      `/api/projects/${projectId.value}/documents`,
      form,
    )
    documents.value = [r.document, ...documents.value]
    toast.push({ tone: 'success', title: 'Documento subido' })
    input.value = ''
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo subir', message: e?.message })
  }
}

const downloadDoc = async (docId: string) => {
  try {
    const r = await apiFetch<{ success: boolean; url: string }>(`/api/documents/${docId}/download`)
    window.open(r.url, '_blank')
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo descargar', message: e?.message })
  }
}

const loadEmails = async () => {
  try {
    const r = await apiFetch<{ success: boolean; emails: EmailLog[] }>(`/api/projects/${projectId.value}/emails`)
    emails.value = r.emails
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo cargar correos', message: e?.message })
  }
}

const sendEmail = async () => {
  try {
    const r = await apiFetch<{ success: boolean; email: EmailLog }>(`/api/projects/${projectId.value}/emails/send`, {
      method: 'POST',
      body: JSON.stringify({
        to: emailTo.value,
        subject: emailSubject.value,
        body: emailBody.value,
        taskId: emailTaskId.value,
      }),
    })
    emails.value = [r.email, ...emails.value]
    emailTo.value = ''
    emailSubject.value = ''
    emailBody.value = ''
    toast.push({ tone: 'success', title: 'Correo enviado' })
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo enviar', message: e?.message })
  }
}

watch(
  selectedTask,
  (task) => {
    syncTaskForm(task)
  },
  { immediate: true },
)

watch(
  () => [route.query.tab, route.query.taskId],
  async () => {
    applyRouteContext()
    await scrollToSelectedTask()
  },
  { immediate: true },
)

onMounted(loadAll)
</script>

<template>
  <AppShell>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0">
        <div class="truncate text-xl font-semibold text-slate-900 dark:text-slate-100">
          {{ project?.name || 'Proyecto' }}
        </div>
        <div class="mt-1 truncate text-sm text-slate-600 dark:text-slate-200/70">
          {{ project?.description || '—' }}
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <span class="ui-pill">{{ totalTaskCount }} tareas</span>
          <span class="ui-pill">{{ members.length }} miembros</span>
          <span class="ui-pill">{{ project?.status || 'active' }}</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="ui-btn-outline px-3 py-2 text-sm"
          :class="tab === 'tasks' ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-slate-100' : ''"
          @click="setTab('tasks')"
        >
          Tareas
        </button>
        <button
          class="ui-btn-outline px-3 py-2 text-sm"
          :class="tab === 'time' ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-slate-100' : ''"
          @click="setTab('time')"
        >
          Tiempos
        </button>
        <button
          class="ui-btn-outline px-3 py-2 text-sm"
          :class="tab === 'docs' ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-slate-100' : ''"
          @click="setTab('docs')"
        >
          Documentos
        </button>
        <button
          class="ui-btn-outline px-3 py-2 text-sm"
          :class="tab === 'members' ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-slate-100' : ''"
          @click="setTab('members')"
        >
          Miembros
        </button>
        <button
          class="ui-btn-outline px-3 py-2 text-sm"
          :class="tab === 'emails' ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-slate-100' : ''"
          @click="setTab('emails')"
        >
          Correos
        </button>
      </div>
    </div>

    <div
      v-if="tab === 'members'"
      class="mt-6 space-y-4"
    >
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="ui-card-muted p-4">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Invitar
          </div>
          <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
            Enviar invitación por correo (requiere SMTP).
          </div>

          <div
            v-if="!canAdmin"
            class="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300/70"
          >
            Solo los administradores pueden invitar.
          </div>

          <div
            v-else
            class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4"
          >
            <input
              v-model="inviteEmail"
              class="ui-input sm:col-span-2"
              placeholder="email@dominio.com"
            >
            <select
              v-model="inviteRole"
              class="ui-select"
            >
              <option value="member">
                Miembro
              </option>
              <option value="admin">
                Admin
              </option>
            </select>
            <button
              class="ui-btn-primary h-10"
              :disabled="inviteEmail.trim().length < 5"
              @click="createInvitation"
            >
              Enviar
            </button>
            <textarea
              v-model="inviteNote"
              rows="3"
              class="ui-textarea sm:col-span-4"
              placeholder="Mensaje opcional"
            />
          </div>
        </div>

        <div class="ui-card-muted p-4">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Miembros
          </div>
          <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
            Roles y acceso al proyecto.
          </div>

          <div
            v-if="members.length === 0"
            class="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300/70"
          >
            Sin miembros cargados.
          </div>

          <div
            v-else
            class="mt-4 divide-y divide-slate-200 dark:divide-slate-800"
          >
            <div
              v-for="m in members"
              :key="m.userId"
              class="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {{ displayPerson(m) }}
                </div>
                <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
                  {{ m.userId.slice(0, 8) }} · {{ new Date(m.createdAt).toLocaleString() }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <select
                  class="ui-select h-9 w-32"
                  :disabled="!canAdmin"
                  :value="m.projectRole"
                  @change="
                    updateMemberRole(m.userId, ($event.target as HTMLSelectElement).value as 'admin' | 'member')
                  "
                >
                  <option value="member">
                    Miembro
                  </option>
                  <option value="admin">
                    Admin
                  </option>
                </select>
                <button
                  class="ui-btn-outline px-3 py-2 text-xs"
                  :disabled="!canAdmin || m.userId === myUserId"
                  @click="removeMember(m.userId)"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="ui-card-muted">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Invitaciones
            </div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
              Pendientes, aceptadas o revocadas.
            </div>
          </div>
          <button
            class="ui-btn-outline px-3 py-2 text-xs"
            :disabled="!canAdmin"
            @click="loadInvitations"
          >
            Recargar
          </button>
        </div>

        <div
          v-if="!canAdmin"
          class="px-4 pb-4 text-sm text-slate-600 dark:text-slate-200/70"
        >
          Solo los administradores pueden ver invitaciones.
        </div>

        <div
          v-else-if="invitations.length === 0"
          class="px-4 pb-4 text-sm text-slate-600 dark:text-slate-200/70"
        >
          Sin invitaciones.
        </div>

        <div
          v-else
          class="divide-y divide-slate-200 dark:divide-slate-800"
        >
          <div
            v-for="inv in invitations"
            :key="inv.id"
            class="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {{ inv.invited_email }}
              </div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-200/70">
                <span class="ui-pill">{{ inv.project_role }}</span>
                <span class="ui-pill">{{ inviteStatus(inv) }}</span>
                <span class="ui-pill">Vence {{ new Date(inv.expires_at).toISOString().slice(0, 10) }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class="ui-btn-outline px-3 py-2 text-xs"
                @click="copyInviteLink(inv)"
              >
                Copiar link
              </button>
              <button
                class="ui-btn-outline px-3 py-2 text-xs"
                :disabled="Boolean(inv.accepted_at) || Boolean(inv.revoked_at) || isExpiredInvite(inv)"
                @click="resendInvitation(inv)"
              >
                Reenviar
              </button>
              <button
                class="ui-btn-outline px-3 py-2 text-xs"
                :disabled="Boolean(inv.accepted_at) || Boolean(inv.revoked_at)"
                @click="revokeInvitation(inv)"
              >
                Revocar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="tab === 'tasks'"
      class="mt-6"
    >
      <div class="ui-card-muted p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            v-model="newTaskTitle"
            class="ui-input flex-1"
            placeholder="Nueva tarea"
          >
          <select
            v-model="newTaskPriority"
            class="ui-select lg:w-44"
          >
            <option
              v-for="option in PRIORITIES"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <div class="flex gap-2">
            <button
              class="ui-btn-outline px-3 py-2 text-sm"
              :class="taskView === 'list' ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-slate-100' : ''"
              @click="taskView = 'list'"
            >
              Lista
            </button>
            <button
              class="ui-btn-outline px-3 py-2 text-sm"
              :class="taskView === 'kanban' ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-slate-100' : ''"
              @click="taskView = 'kanban'"
            >
              Kanban
            </button>
            <button
              class="ui-btn-primary h-10"
              @click="createTask"
            >
              Crear
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section class="min-w-0">
          <div
            v-if="tasks.length === 0"
            class="ui-card-muted p-4 text-sm text-slate-600 dark:text-slate-200/70"
          >
            Sin tareas todavía.
          </div>

          <div
            v-else-if="taskView === 'list'"
            class="ui-card-muted divide-y divide-slate-200 dark:divide-slate-800"
          >
            <button
              v-for="t in tasks"
              :id="`task-${t.id}`"
              :key="t.id"
              class="w-full px-4 py-4 text-left transition-colors hover:bg-slate-900/5 dark:hover:bg-white/5"
              :class="selectedTaskId === t.id ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:ring-blue-500/30' : ''"
              @click="openTask(t.id)"
            >
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {{ t.title }}
                  </div>
                  <div class="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-200/70">
                    {{ t.description || 'Sin descripción' }}
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span class="ui-pill">{{ statusLabel(t.status) }}</span>
                    <span class="ui-pill">{{ priorityLabel(t.priority) }}</span>
                    <span
                      v-if="t.due_date"
                      class="ui-pill"
                      :class="isOverdue(t.due_date) ? 'border-red-300 text-red-700 dark:border-red-500/30 dark:text-red-200' : ''"
                    >
                      Vence {{ t.due_date }}
                    </span>
                  </div>
                </div>
                <div class="lg:max-w-52">
                  <div class="text-xs font-medium text-slate-500 dark:text-slate-300/70">
                    Asignados
                  </div>
                  <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
                    {{ t.assignees.length ? formatAssignees(t) : 'Sin asignar' }}
                  </div>
                </div>
              </div>
            </button>
          </div>

          <div
            v-else
            class="grid grid-cols-1 gap-4 xl:grid-cols-4"
          >
            <div
              v-for="column in taskColumns"
              :key="column.value"
              class="ui-card-muted min-h-[420px] p-3"
            >
              <div class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {{ column.label }}
                </div>
                <span class="ui-pill">{{ column.items.length }}</span>
              </div>

              <div class="mt-3 space-y-3">
                <button
                  v-for="task in column.items"
                  :id="`task-${task.id}`"
                  :key="task.id"
                  class="ui-card w-full p-3 text-left transition-colors hover:border-blue-300 dark:hover:border-blue-500/30"
                  :class="selectedTaskId === task.id ? 'border-blue-300 ring-1 ring-blue-200 dark:border-blue-500/30 dark:ring-blue-500/30' : ''"
                  @click="openTask(task.id)"
                >
                  <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {{ task.title }}
                  </div>
                  <div class="mt-2 line-clamp-3 text-xs text-slate-600 dark:text-slate-200/70">
                    {{ task.description || 'Sin descripción' }}
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span class="ui-pill">{{ priorityLabel(task.priority) }}</span>
                    <span
                      v-if="task.due_date"
                      class="ui-pill"
                      :class="isOverdue(task.due_date) ? 'border-red-300 text-red-700 dark:border-red-500/30 dark:text-red-200' : ''"
                    >
                      {{ task.due_date }}
                    </span>
                  </div>
                  <div class="mt-3 text-xs text-slate-600 dark:text-slate-200/70">
                    {{ task.assignees.length ? formatAssignees(task) : 'Sin asignar' }}
                  </div>
                </button>

                <div
                  v-if="column.items.length === 0"
                  class="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300/70"
                >
                  Sin tareas
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside class="ui-card-muted p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Detalle de tarea
              </div>
              <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
                Edita campos completos y asignados.
              </div>
            </div>
            <button
              v-if="selectedTask"
              class="ui-btn-ghost px-3 py-2 text-xs"
              @click="selectedTaskId = ''"
            >
              Cerrar
            </button>
          </div>

          <div
            v-if="!selectedTask"
            class="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300/70"
          >
            Selecciona una tarea para editarla.
          </div>

          <div
            v-else
            class="mt-4 space-y-4"
          >
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-200/70">Título</label>
              <input
                v-model="taskTitle"
                class="ui-input"
                placeholder="Título"
              >
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-200/70">Descripción</label>
              <textarea
                v-model="taskDescription"
                rows="5"
                class="ui-textarea"
                placeholder="Descripción de la tarea"
              />
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-200/70">Estado</label>
                <select
                  v-model="taskStatus"
                  class="ui-select"
                >
                  <option
                    v-for="option in TASK_STATUSES"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-200/70">Prioridad</label>
                <select
                  v-model="taskPriority"
                  class="ui-select"
                >
                  <option
                    v-for="option in PRIORITIES"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-200/70">Fecha límite</label>
                <input
                  v-model="taskDueDate"
                  type="date"
                  class="ui-input"
                >
              </div>
            </div>

            <div>
              <div class="mb-2 text-xs font-medium text-slate-600 dark:text-slate-200/70">
                Asignados
              </div>
              <div
                v-if="members.length === 0"
                class="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300/70"
              >
                No hay miembros visibles para asignar.
              </div>
              <div
                v-else
                class="space-y-2"
              >
                <button
                  v-for="member in members"
                  :key="member.userId"
                  class="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors"
                  :class="
                    selectedAssigneeUserIds.includes(member.userId)
                      ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-white/5'
                  "
                  @click="toggleAssignee(member.userId)"
                >
                  <span>{{ displayPerson(member) }}</span>
                  <span class="text-xs uppercase tracking-wide opacity-70">{{ member.projectRole }}</span>
                </button>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
              <label class="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
                <span>Notificar por correo</span>
                <input
                  v-model="notifyAssignees"
                  type="checkbox"
                  class="h-4 w-4 accent-blue-600"
                >
              </label>
              <textarea
                v-if="notifyAssignees"
                v-model="assigneeNote"
                rows="3"
                class="ui-textarea mt-3"
                placeholder="Mensaje opcional para la notificación"
              />
              <div
                v-if="notifyAssignees"
                class="mt-2 text-xs text-slate-600 dark:text-slate-200/70"
              >
                Se enviará correo solo a los nuevos asignados (requiere SMTP).
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                class="ui-btn-primary"
                @click="saveTaskDetails"
              >
                Guardar cambios
              </button>
              <button
                class="ui-btn-outline"
                @click="saveAssignees"
              >
                Guardar asignados
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <div
      v-if="tab === 'time'"
      class="mt-6"
    >
      <div class="ui-card-muted grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
        <input
          v-model="timeDate"
          type="date"
          class="ui-input"
        >
        <input
          v-model.number="timeMinutes"
          type="number"
          min="1"
          class="ui-input"
          placeholder="Minutos"
        >
        <select
          v-model="timeTaskId"
          class="ui-select"
        >
          <option value="">
            (sin tarea)
          </option>
          <option
            v-for="t in tasks"
            :key="t.id"
            :value="t.id"
          >
            {{ t.title }}
          </option>
        </select>
        <input
          v-model="timeNote"
          class="ui-input"
          placeholder="Nota (opcional)"
        >
        <button
          class="ui-btn-primary h-10"
          @click="addTime"
        >
          Registrar
        </button>
      </div>

      <div class="mt-4 ui-card-muted">
        <div
          v-if="timeEntries.length === 0"
          class="p-4 text-sm text-slate-600 dark:text-slate-200/70"
        >
          Sin registros.
        </div>
        <div
          v-else
          class="divide-y divide-slate-200 dark:divide-slate-800"
        >
          <div
            v-for="te in timeEntries"
            :key="te.id"
            class="flex items-center gap-3 px-4 py-3"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {{ te.entry_date }} · {{ te.minutes }} min
              </div>
              <div class="truncate text-xs text-slate-600 dark:text-slate-200/70">
                {{ te.note || '—' }}
              </div>
            </div>
            <button
              class="ui-btn-outline px-3 py-2 text-xs"
              @click="removeTime(te.id)"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="tab === 'docs'"
      class="mt-6"
    >
      <div class="ui-card-muted p-4">
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-end">
          <div>
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Documentos
            </div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
              Subida vía API y Storage privado (URL firmada).
            </div>
          </div>
          <select
            v-model="selectedDocTaskId"
            class="ui-select"
          >
            <option value="">
              Vincular a tarea (opcional)
            </option>
            <option
              v-for="t in tasks"
              :key="t.id"
              :value="t.id"
            >
              {{ t.title }}
            </option>
          </select>
          <input
            type="file"
            class="block w-full text-sm text-slate-600 dark:text-slate-200/70 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900/5 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-900/10 dark:file:bg-white/5 dark:file:text-slate-100 dark:hover:file:bg-white/10 sm:w-auto"
            @change="onUpload"
          >
        </div>
      </div>

      <div class="mt-4 ui-card-muted">
        <div
          v-if="documents.length === 0"
          class="p-4 text-sm text-slate-600 dark:text-slate-200/70"
        >
          Sin documentos.
        </div>
        <div
          v-else
          class="divide-y divide-slate-200 dark:divide-slate-800"
        >
          <div
            v-for="d in documents"
            :key="d.id"
            class="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {{ d.filename }}
              </div>
              <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
                {{ new Date(d.created_at).toLocaleString() }}
              </div>
              <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
                {{ d.task_id ? `Vinculado a tarea ${d.task_id.slice(0, 8)}` : 'Sin tarea vinculada' }}
              </div>
            </div>
            <button
              class="ui-btn-primary px-3 py-2 text-xs"
              @click="downloadDoc(d.id)"
            >
              Descargar
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="tab === 'emails'"
      class="mt-6"
    >
      <div class="ui-card-muted p-4">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            v-model="emailTo"
            class="ui-input"
            placeholder="Para (email)"
          >
          <input
            v-model="emailSubject"
            class="ui-input"
            placeholder="Asunto"
          >
          <select
            v-model="emailTaskId"
            class="ui-select"
          >
            <option value="">
              (sin tarea)
            </option>
            <option
              v-for="t in tasks"
              :key="t.id"
              :value="t.id"
            >
              {{ t.title }}
            </option>
          </select>
          <button
            class="ui-btn-primary h-10 md:col-span-2"
            @click="sendEmail"
          >
            Enviar correo
          </button>
        </div>
        <textarea
          v-model="emailBody"
          rows="6"
          class="ui-textarea mt-3"
          placeholder="Cuerpo del mensaje"
        />
        <div class="mt-2 text-xs text-slate-600 dark:text-slate-200/70">
          Requiere SMTP configurado en el backend.
        </div>
      </div>

      <div class="mt-4 ui-card-muted">
        <div
          v-if="emails.length === 0"
          class="p-4 text-sm text-slate-600 dark:text-slate-200/70"
        >
          Sin correos enviados.
        </div>
        <div
          v-else
          class="divide-y divide-slate-200 dark:divide-slate-800"
        >
          <div
            v-for="m in emails"
            :key="m.id"
            class="px-4 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {{ m.subject }}
              </div>
              <div class="shrink-0 text-xs text-slate-600 dark:text-slate-200/70">
                {{ new Date(m.sent_at).toLocaleString() }}
              </div>
            </div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
              Para: {{ m.to_email }}
            </div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-200/70">
              {{ m.body_preview }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <ToastHost />
  </AppShell>
</template>
