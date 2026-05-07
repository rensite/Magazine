import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from '@/services/supabaseClient'

interface State {
  session: Session | null
  initialized: boolean
  initError: string | null
  signingIn: boolean
  signInError: string | null
  signInSent: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): State => ({
    session: null,
    initialized: false,
    initError: null,
    signingIn: false,
    signInError: null,
    signInSent: false,
  }),
  getters: {
    user: (s): User | null => s.session?.user ?? null,
    isAuthenticated: (s): boolean => !!s.session?.user,
  },
  actions: {
    async init() {
      try {
        const sb = getSupabase()
        const { data } = await sb.auth.getSession()
        this.session = data.session
        sb.auth.onAuthStateChange((_event, session) => {
          this.session = session
        })
      } catch (err) {
        this.initError = (err as Error).message ?? 'auth init failed'
      } finally {
        this.initialized = true
      }
    },

    async signInWithOtp(email: string) {
      this.signingIn = true
      this.signInError = null
      this.signInSent = false
      try {
        const redirect = window.location.origin + import.meta.env.BASE_URL
        const { error } = await getSupabase().auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirect },
        })
        if (error) throw error
        this.signInSent = true
      } catch (err) {
        this.signInError = (err as Error).message ?? 'sign in failed'
      } finally {
        this.signingIn = false
      }
    },

    async signOut() {
      await getSupabase().auth.signOut()
      this.session = null
    },
  },
})
