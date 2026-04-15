import { defineStore } from 'pinia'

export type Toast = {
  id: string
  title: string
  message?: string
  tone: 'success' | 'error' | 'info'
}

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
  }),
  actions: {
    push(t: Omit<Toast, 'id'>) {
      const id = crypto.randomUUID()
      this.toasts = [{ ...t, id }, ...this.toasts].slice(0, 3)
      setTimeout(() => this.dismiss(id), 3200)
    },
    dismiss(id: string) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})

