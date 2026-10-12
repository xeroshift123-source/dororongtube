import { useEffect, useRef, useState } from 'react'
import { db, rpc } from '../services/supabase'
import type { BroadcastState, ChatEvent, ChatSnapshot, ConnectionStatus, Viewer } from '../types'
import { applyChatEvent, errorText, latestBroadcast } from '../utils/room'
import { presenceViewers } from '../utils/presence'
const empty: ChatSnapshot = { revision: 0, messages: [] }
export function useRoom(userId?: string, nickname = '', color = '') {
  const [broadcast,setBroadcast] = useState<BroadcastState | null>(null)
  const [chat,setChat] = useState<ChatSnapshot>(empty)
  const [viewers,setViewers] = useState(0)
  const [participants,setParticipants] = useState<Viewer[]>([])
  const profile = useRef({nickname,color})
  const updatePresence = useRef<(() => void) | null>(null)
  useEffect(()=>{profile.current={nickname,color};updatePresence.current?.()},[nickname,color])
  const [status,setStatus] = useState<ConnectionStatus>('connecting')
  const [error,setError] = useState('')
  const refreshRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (!userId) return
    let active = true, fetching = false, again = false
    let snapshot = empty
    let pending: ChatEvent[] = []
    const connected = new Set<string>()
    const client = db()
    setChat(empty); setBroadcast(null); setViewers(0); setParticipants([]); setStatus('connecting')
    function publish() { if (active) setChat(snapshot) }
    async function refresh() {
      if (!active) return
      if (fetching) { again = true; return }
      fetching = true
      try {
        const [next, state] = await Promise.all([rpc<ChatSnapshot>('get_chat_snapshot'), client.from('broadcast_state').select('*').eq('id',1).single()])
        if (state.error) throw state.error
        if (!next) throw new Error('인증 세션을 확인해 주세요.')
        if (!active) return
        if (next.revision >= snapshot.revision) snapshot = next
        pending = pending.filter(e => e.revision > snapshot.revision).sort((a,b) => a.revision-b.revision)
        for (const event of pending) {
          const result = applyChatEvent(snapshot,event)
          if (result.gap) { again = true; break }
          snapshot = result.state
        }
        pending = pending.filter(e => e.revision > snapshot.revision)
        publish()
        setBroadcast(old => latestBroadcast(old,state.data as BroadcastState)); setError('')
      } catch(e) { if (active) setError(errorText(e)) }
      finally { fetching = false; if (again && active) { again = false; window.setTimeout(() => void refresh(),1000) } }
    }
    refreshRef.current = () => void refresh()
    const chatChannel = client.channel('room:chat',{ config:{ private:true } }).on('broadcast',{event:'change'},({payload}) => {
      if (!active) return
      const event = payload as ChatEvent
      const result = applyChatEvent(snapshot,event)
      if (result.gap) { pending.push(event); pending=pending.slice(-200); void refresh() }
      else { snapshot=result.state; publish() }
    }).on('broadcast',{event:'reset'},() => void refresh())
    const stateChannel = client.channel('room:state',{config:{private:true}}).on('broadcast',{event:'change'},() => void refresh())
    const presence = client.channel('room:presence',{config:{private:true,presence:{key:userId}}}).on('presence',{event:'sync'},() => { if (active) {const people=presenceViewers(presence.presenceState());setParticipants(people);setViewers(people.length)} })
    const trackProfile = () => {if(active&&connected.has(presence.topic))void presence.track({online:true,...profile.current,profile_at:Date.now()}).then(result=>{if(active&&result!=='ok')setError('시청 인원 등록에 실패했습니다.')})}
    updatePresence.current=trackProfile
    const subscriptions = [chatChannel,stateChannel,presence]
    subscriptions.forEach(channel => channel.subscribe((state) => {
      if (!active) return
      if (state === 'SUBSCRIBED') {
        connected.add(channel.topic)
        if (channel === presence) trackProfile()
        void refresh()
      } else {
        connected.delete(channel.topic)
        if (channel === presence) {setViewers(0);setParticipants([])}
      }
      setStatus(!navigator.onLine ? 'offline' : connected.size === 3 ? 'connected' : 'reconnecting')
    }))
    const onOnline = () => { setStatus(connected.size === 3 ? 'connected' : 'reconnecting'); void refresh() }
    const onOffline = () => { setStatus('offline'); setViewers(0);setParticipants([]) }
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('online',onOnline); window.addEventListener('offline',onOffline); document.addEventListener('visibilitychange',onVisible)
    // Catch quiet Broadcast loss, including a lost deletion. One bounded snapshot per minute.
    const poll = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void refresh() },60000 + Math.random()*15000)
    void refresh()
    return () => {
      active = false; refreshRef.current = () => {};updatePresence.current=null; clearInterval(poll)
      window.removeEventListener('online',onOnline); window.removeEventListener('offline',onOffline); document.removeEventListener('visibilitychange',onVisible)
      subscriptions.forEach(c => { void client.removeChannel(c) })
    }
  },[userId])
  return {broadcast,messages:chat.messages,viewers,participants,status,error,refresh:() => refreshRef.current()}
}
