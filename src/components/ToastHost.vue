<script setup lang="ts">
import { useToastStore } from '@/stores/toast'
import { computed } from 'vue'

const toast = useToastStore()

const items = computed(() => toast.toasts)
const toneClass = (tone: string) => {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
  if (tone === 'error') return 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
  return 'border-slate-200 bg-white/90 dark:border-slate-500/30 dark:bg-slate-500/10'
}
</script>

<template>
  <div class="fixed right-4 top-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] space-y-2">
    <div
      v-for="t in items"
      :key="t.id"
      class="rounded-xl border p-3 shadow-lg backdrop-blur"
      :class="toneClass(t.tone)"
      role="status"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {{ t.title }}
          </div>
          <div
            v-if="t.message"
            class="mt-0.5 text-xs text-slate-600 dark:text-slate-200/80"
          >
            {{ t.message }}
          </div>
        </div>
        <button
          class="shrink-0 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-200/70 dark:hover:bg-white/5 dark:hover:text-slate-100"
          @click="toast.dismiss(t.id)"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
</template>
