import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { db, rpc, supabase } from '../services/supabase'
import { errorText } from '../utils/room'
import type { UserProfile } from '../types'
import { nicknameColor } from '../utils/profile'
export function useSession() {
  const [user, setUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState('')
  const [color,setColor] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const [profileRevision,setProfileRevision] = useState(0)
  const userId=user?.id
  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user ?? null) })
    void supabase.auth.getSession().then(({data,error}) => { if (active) { setUser(data.session?.user ?? null); if (error) setError(errorText(error)); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    setNickname(''); setColor(null); setAdmin(false)
    if (!userId || !supabase) return
    let active = true
    setLoading(true)
    void Promise.all([supabase.from('user_profiles').select('*').eq('user_id',userId).maybeSingle(), rpc<boolean>('is_admin')]).then(([profile,isAdmin]) => {
      if (profile.error) throw profile.error
      if (active) { setNickname(profile.data?.nickname ?? ''); setColor(profile.data?.nickname_color ?? null); setAdmin(isAdmin) }
    }).catch(e => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId,profileRevision]) // Token refresh doesn't reset room membership.
  const refreshProfile=useCallback(async()=>{
    if(!userId||!supabase)return
    const result=await supabase.from('user_profiles').select('*').eq('user_id',userId).maybeSingle()
    if(!result.error&&result.data){setNickname(result.data.nickname);setColor(result.data.nickname_color??null);sessionStorage.setItem('dororong:nickname',result.data.nickname)}
  },[userId])
  useEffect(()=>{
    if(!userId)return
    const visible=()=>{if(document.visibilityState==='visible')void refreshProfile()}
    const poll=window.setInterval(visible,60000)
    document.addEventListener('visibilitychange',visible)
    return()=>{clearInterval(poll);document.removeEventListener('visibilitychange',visible)}
  },[userId,refreshProfile])
  const join = useCallback(async (name: string, captchaToken?: string) => {
    setError(''); setLoading(true)
    try {
      if (!user) { const {error} = await db().auth.signInAnonymously({ options: { captchaToken } }); if (error) throw error }
      const profile = await rpc<UserProfile>('join_room',{p_nickname:name})
      sessionStorage.setItem('dororong:nickname',profile.nickname)
      setNickname(profile.nickname)
      setColor(profile.nickname_color ?? null)
      setProfileRevision(v=>v+1)
    } catch(e) { setError(errorText(e)); throw e } finally { setLoading(false) }
  }, [user])
  const updateProfile = useCallback(async (name:string,chosenColor:string) => {
    try {
      const profile=await rpc<UserProfile>('update_my_profile',{p_nickname:name,p_color:chosenColor})
      setNickname(profile.nickname)
      setColor(profile.nickname_color ?? null)
      sessionStorage.setItem('dororong:nickname',profile.nickname)
    } catch(e) {
      if (typeof e==='object' && e && 'code' in e && e.code==='PGRST202') throw new Error('설정 기능의 DB 업데이트가 아직 적용되지 않았습니다. 추가 SQL 파일을 먼저 실행해 주세요.')
      throw e
    }
  },[])
  return { user, nickname, color:nicknameColor(userId ?? '',color), admin, loading, error, join, updateProfile, refreshProfile }
}
