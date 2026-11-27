import { createClient } from '@supabase/supabase-js'

// Public values (safe in the browser: Row Level Security protects the data)
export const SUPABASE_URL = 'https://kabbtpgvglxmmkaevbxy.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_ODENK4I7nF_k6c_sKADc0w_yB1og9or'
export const CLERK_PUBLISHABLE_KEY = 'pk_test_Y3VkZGx5LWdsb3d3b3JtLTIzMDAuY2xlcmsuYWNjb3VudHMuZGV2JA'
export const ALLOWED_DOMAIN = 'codetantra.in'

// Sign-in is handled by Clerk. Every Supabase request carries the current Clerk
// session token; App.jsx registers the function that fetches it.
let getClerkToken = async () => null
export function setTokenGetter(fn) {
  getClerkToken = fn
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  accessToken: async () => (await getClerkToken()) ?? null,
})
