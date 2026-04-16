import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { apiFetch } from '@/lib/api'

type MeResponse = {
  success: boolean
  user: { id: string; email?: string | null; fullName: string | null; avatarUrl: string | null }
  profile: any
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null as Session | null,
    ready: false,
    me: null as MeResponse | null,
  }),
  actions: {
    async refreshMe() {
      if (!this.session) {
        this.me = null
        return
      }
      try {
        this.me = await apiFetch<MeResponse>('/api/me')
      } catch {
        this.me = null
      }
    },
    async init() {
      const { data } = await supabase.auth.getSession()
      this.session = data.session

      supabase.auth.onAuthStateChange((_event, session) => {
        this.session = session
        if (!session) {
          this.me = null
          return
        }
        void this.refreshMe()
      })

      await this.refreshMe()

      this.ready = true
    },
    async waitUntilReady() {
      if (this.ready) return
      await new Promise<void>((resolve) => {
        const t = setInterval(() => {
          if (this.ready) {
            clearInterval(t)
            resolve()
          }
        }, 25)
      })
    },
    async signInWithGoogle(redirectTo?: string) {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo || `${window.location.origin}/login`,
        },
      })
    },
    async signInWithEmailOtp(email: string, redirectTo?: string) {
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo || `${window.location.origin}/login`,
        },
      })
    },
    async signOut() {
      await supabase.auth.signOut()
      this.session = null
      this.me = null
    },
  },
})
