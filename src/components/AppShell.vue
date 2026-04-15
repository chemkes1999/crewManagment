<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { toggleTheme, isDark } = useTheme()

const title = computed(() => {
  if (route.name === 'home') return 'Panel'
  if (route.name === 'teams-time') return 'Equipos y tiempo'
  if (route.name === 'project') return 'Proyecto'
  return 'Gestor'
})

const onSignOut = async () => {
  await auth.signOut()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-5">
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">
          Crew Manager
        </div>
      </div>

      <nav class="mt-6 space-y-1">
        <RouterLink
          to="/"
          class="block rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-200/80 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-100"
          active-class="bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-slate-100"
        >
          Panel
        </RouterLink>
        <RouterLink
          to="/teams-time"
          class="block rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-200/80 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-100"
          active-class="bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-slate-100"
        >
          Equipos y tiempo
        </RouterLink>
      </nav>

      <div class="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3">
        <div class="text-xs text-slate-500 dark:text-slate-200/70">
          Sesión
        </div>
        <div class="mt-1 truncate text-sm text-slate-900 dark:text-slate-100">
          {{ auth.me?.user?.email || '—' }}
        </div>
        <div class="mt-3 flex items-center gap-2">
          <button
            class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-200/80 hover:bg-slate-50 dark:hover:bg-white/5"
            @click="toggleTheme"
          >
            {{ isDark ? 'Claro' : 'Oscuro' }}
          </button>
          <button
            class="ml-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-200/80 hover:bg-slate-50 dark:hover:bg-white/5"
            @click="onSignOut"
          >
            Salir
          </button>
        </div>
      </div>
    </aside>

    <main class="flex-1 bg-slate-50 dark:bg-slate-900">
      <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 px-6 py-4 backdrop-blur">
        <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {{ title }}
        </div>
      </header>

      <div class="px-6 py-6">
        <slot />
      </div>
    </main>
  </div>
</template>
