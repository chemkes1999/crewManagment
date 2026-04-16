<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import ToastHost from '@/components/ToastHost.vue'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const message = ref('')

const accept = async () => {
  await auth.waitUntilReady()

  if (!token.value) {
    status.value = 'error'
    message.value = 'Falta el token de invitación.'
    return
  }

  if (!auth.session) {
    router.replace({ name: 'login', query: { redirect: route.fullPath } })
    return
  }

  status.value = 'loading'
  try {
    const r = await apiFetch<{ success: boolean; projectId: string }>(`/api/invitations/accept`, {
      method: 'POST',
      body: JSON.stringify({ token: token.value }),
    })
    status.value = 'success'
    toast.push({ tone: 'success', title: 'Invitación aceptada' })
    router.replace({ name: 'project', params: { projectId: r.projectId } })
  } catch (e: any) {
    status.value = 'error'
    message.value = e?.message || 'No se pudo aceptar la invitación.'
    toast.push({ tone: 'error', title: 'No se pudo aceptar la invitación', message: message.value })
  }
}

onMounted(() => {
  void accept()
})
</script>

<template>
  <AppShell v-if="auth.session">
    <div class="mx-auto max-w-xl">
      <div class="ui-card-muted p-6">
        <div class="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Invitación al proyecto
        </div>
        <div class="mt-2 text-sm text-slate-600 dark:text-slate-200/70">
          {{ status === 'loading' ? 'Procesando…' : status === 'success' ? 'Listo.' : status === 'error' ? message : '—' }}
        </div>
      </div>
    </div>
    <ToastHost />
  </AppShell>

  <div
    v-else
    class="min-h-screen bg-slate-50 dark:bg-slate-950"
  >
    <div class="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div class="w-full ui-card p-8 shadow-xl">
        <div class="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Invitación al proyecto
        </div>
        <div class="mt-2 text-sm text-slate-600 dark:text-slate-200/70">
          Redirigiendo a inicio de sesión…
        </div>
      </div>
    </div>
  </div>
</template>

