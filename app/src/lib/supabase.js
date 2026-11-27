import { createClient } from '@supabase/supabase-js'

// Public values (safe in the browser: Row Level Security protects the data)
export const SUPABASE_URL = 'https://kabbtpgvglxmmkaevbxy.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_ODENK4I7nF_k6c_sKADc0w_yB1og9or'
export const ALLOWED_DOMAIN = 'codetantra.in'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
