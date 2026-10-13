import { useEffect, useRef, useState } from 'react'
import { db, rpc } from '../services/supabase'
import type { BroadcastState, ChatEvent, ChatSnapshot, ConnectionStatus, RoomProfile, Viewer } from '../types'
import { applyChatEvent, errorText, latestBroadcast } from '../utils/room'
import { presenceViewers } from '../utils/presence'
import { nicknameColor } from '../utils/profile'
const empty: ChatSnapshot = { revision: 0, messages: [] }
export function useRoom(userId?: string, nickname = '', color = '', onProfileChanged?: () => void) {
  const [broadcast,setBroadcast] = useState<BroadcastState | null>(null)
  const [chat,setChat] = useState<ChatSnapshot>(empty)
  const [viewers,setViewers] = useState(0)
  const [participants,setParticipants] = useState<Viewer[]>([])
  const [roomProfiles,setRoomProfiles] = useState<RoomProfile[]>([])
  const profile = useRef({nickname,color})
  const updatePresence = useRef<(() => void) | null>(null)
  const profileChanged = useRef(onProfileChanged)
  useEffect(()=>{profileChanged.current=onProfileChanged},[onProfileChanged])
  useEffect(()=>{profile.current={nickname,color};updatePresence.current?.()},[nickname,color])
  const [status,setStatus] = useState<ConnectionStatus>('connecting')
  const [error,setError] = useState('')
  const [profileError,setProfileError] = useState('')
  const [presenceError,setPresenceError] = useState('')
  const refreshRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (!userId) return
    let active = true, fetching = false, again = false
    let snapshot = empty
    let pending: ChatEvent[] = []
    const connected = new Set<string>()
    const client = db()
    let onlinePeople:Viewer[]=[]
    let profileRequest=0
    async function refreshProfiles() {
      const request=++profileRequest
      const ids=onlinePeople.map(person=>person.id).filter(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      if(!ids.length){setRoomProfiles([]);setProfileError('');return}
      try{
        const batches=[]
        for(let i=0;i<ids.length;i+=500)batches.push(rpc<RoomProfile[]>('get_room_profiles',{p_user_ids:ids.slice(i,i+500)}))
        const results=await Promise.all(batches)
        if(active&&request===profileRequest){setRoomProfiles(results.flat());setProfileError('')}
      }catch(e){if(active&&request===profileRequest)setProfileError(errorText(e))}
    }
    setRoomProfiles([])
    setError('');setProfileError('');setPresenceError('')
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
        void refreshProfiles()
      } catch(e) { if (active) setError(errorText(e)) }
      finally { fetching = false; if (again && active) { again = false; window.setTimeout(() => void refresh(),1000) } }
    }
    refreshRef.current = () => {void refresh();trackProfile()}
    const chatChannel = client.channel('room:chat',{ config:{ private:true } }).on('broadcast',{event:'change'},({payload}) => {
      if (!active) return
      const event = payload as ChatEvent
      const result = applyChatEvent(snapshot,event)
      if (result.gap) { pending.push(event); pending=pending.slice(-200); void refresh() }
      else { snapshot=result.state; publish() }
    }).on('broadcast',{event:'reset'},() => void refresh())
    const stateChannel = client.channel('room:state',{config:{private:true}}).on('broadcast',{event:'change'},() => void refresh()).on('broadcast',{event:'profile_changed'},({payload}) => {if(payload.user_id===userId)profileChanged.current?.();void refresh()}).on('broadcast',{event:'moderation_changed'},() => void refreshProfiles())
    const presence = client.channel('room:presence',{config:{private:true,presence:{key:userId}}}).on('presence',{event:'sync'},() => { if (active) {const people=presenceViewers(presence.presenceState());onlinePeople=people;setParticipants(people);setViewers(people.length);void refreshProfiles()} })
    let tracking=false,trackAgain=false,trackId=0,trackFailures=0
    let trackRetry:number|undefined
    const cancelTracking=()=>{clearTimeout(trackRetry);trackRetry=undefined;trackId++;tracking=false;trackAgain=false}
    function trackProfile() {
      if(!active||!navigator.onLine||!connected.has(presence.topic))return
      clearTimeout(trackRetry);trackRetry=undefined
      if(tracking){trackAgain=true;return}
      tracking=true;trackAgain=false
      const request=++trackId
      const finish=(ok:boolean)=>{
        if(!active||request!==trackId)return
        tracking=false
        if(ok){trackFailures=0;setPresenceError('')}
        if(trackAgain){trackProfile();return}
        if(!ok){
          trackFailures++
          if(trackFailures>=3)setPresenceError('시청 인원 연결을 복구 중입니다. 잠시 후 자동으로 다시 시도합니다.')
          trackRetry=window.setTimeout(trackProfile,[2000,5000,10000,30000][Math.min(trackFailures-1,3)])
        }
      }
      void presence.track({online:true,...profile.current,profile_at:Date.now()}).then(result=>finish(result==='ok'),()=>finish(false))
    }
    updatePresence.current=trackProfile
    const subscriptions = [chatChannel,stateChannel,presence]
    subscriptions.forEach(channel => channel.subscribe((state) => {
      if (!active) return
      if (state === 'SUBSCRIBED') {
        connected.add(channel.topic)
        if (channel === presence) {cancelTracking();trackFailures=0;trackProfile()}
        void refresh()
      } else {
        connected.delete(channel.topic)
        if (channel === presence) {cancelTracking();setViewers(0);setParticipants([]);setPresenceError('')}
      }
      setStatus(!navigator.onLine ? 'offline' : connected.size === 3 ? 'connected' : 'reconnecting')
    }))
    const onOnline = () => { setStatus(connected.size === 3 ? 'connected' : 'reconnecting');trackProfile(); void refresh() }
    const onOffline = () => { cancelTracking();setPresenceError('');setStatus('offline'); setViewers(0);setParticipants([]) }
    const onVisible = () => { if (document.visibilityState === 'visible') {if(trackFailures>0)trackProfile();void refresh()} }
    window.addEventListener('online',onOnline); window.addEventListener('offline',onOffline); document.addEventListener('visibilitychange',onVisible)
    // Catch quiet Broadcast loss, including a lost deletion. One bounded snapshot per minute.
    const poll = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void refresh() },60000 + Math.random()*15000)
    void refresh()
    return () => {
      active = false;cancelTracking(); refreshRef.current = () => {};updatePresence.current=null; clearInterval(poll)
      window.removeEventListener('online',onOnline); window.removeEventListener('offline',onOffline); document.removeEventListener('visibilitychange',onVisible)
      subscriptions.forEach(c => { void client.removeChannel(c) })
    }
  },[userId])
  const profilesById=new Map(roomProfiles.map(profile=>[profile.user_id,profile]))
  const verifiedParticipants=participants.map(person=>{const saved=profilesById.get(person.id);return saved?{...person,nickname:saved.nickname,color:nicknameColor(person.id,saved.nickname_color),is_admin:saved.is_admin,muted_until:saved.muted_until}:person})
  return {broadcast,messages:chat.messages,viewers,participants:verifiedParticipants,status,error:error||profileError||presenceError,refresh:() => refreshRef.current()}
}
