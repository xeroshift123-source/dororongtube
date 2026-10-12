import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 5 }, reconnectAfterMs: attempt => Math.min(1000 * 2 ** attempt, 30000) + Math.random() * 1000 } }) : null
export function db() { if (!supabase) throw new Error('Supabase 환경 변수를 설정해 주세요.'); return supabase }
export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> { const {data,error} = await db().rpc(name,args); if (error) throw error; return data as T }
