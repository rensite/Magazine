import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export const getSupabase = (): SupabaseClient => {
  if (!client) {
    if (!url || !anon) {
      throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY must be set')
    }
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

export const ASSETS_BUCKET =
  (import.meta.env.VITE_SUPABASE_ASSETS_BUCKET as string | undefined) ?? 'spread-assets'
