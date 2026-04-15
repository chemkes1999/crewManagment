<script setup lang="ts">
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const redirectTo = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'))
const unauthorizedRedirect = computed(() => route.query.reason === 'unauthorized')

const exchanging = ref(false)

onMounted(async () => {
  await auth.waitUntilReady()
  const code = typeof route.query.code === 'string' ? route.query.code : null
  if (code) {
    exchanging.value = true
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    exchanging.value = false
    if (error) {
      toast.push({ tone: 'error', title: 'No se pudo completar el login', message: error.message })
      return
    }

    const nextQuery: Record<string, any> = { ...route.query }
    delete nextQuery.code
    router.replace({ path: '/login', query: nextQuery })
  }
})

watch(
  () => auth.session,
  (s) => {
    if (s && !unauthorizedRedirect.value) router.replace(redirectTo.value)
  },
  { immediate: true }
)

const onLogin = async () => {
  try {
    await auth.signInWithGoogle(`${window.location.origin}/login?redirect=${encodeURIComponent(redirectTo.value)}`)
  } catch (e: any) {
    toast.push({ tone: 'error', title: 'No se pudo iniciar sesión', message: e?.message })
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <div class="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div class="w-full ui-card p-8 shadow-xl">
        <div class="flex items-start gap-4">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm"
            aria-hidden="true"
          >
            <svg
              class="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>

          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300/70">
              Crew Manager
            </div>
            <h1 class="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Iniciar sesión
            </h1>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-200/70">
              Accede con tu cuenta de Google para continuar.
            </p>
          </div>
        </div>

        <div
          v-if="unauthorizedRedirect"
          class="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
        >
          Tu sesión no tiene permisos para acceder a esa pantalla. Inicia sesión con una cuenta autorizada.
        </div>

        <button
          class="mt-6 w-full ui-btn-primary h-11"
          :disabled="exchanging"
          @click="onLogin"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>{{ exchanging ? 'Conectando…' : 'Continuar con Google' }}</span>
          <span
            v-if="exchanging"
            class="ml-1 inline-flex h-4 w-4 items-center justify-center"
            aria-hidden="true"
          >
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          </span>
        </button>

        <div class="mt-5 text-xs text-slate-500 dark:text-slate-300/70">
          Si es tu primera vez, se crea tu perfil automáticamente.
        </div>
      </div>
    </div>
  </div>
</template>
