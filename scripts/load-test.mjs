// Explicit opt-in only. Run against your own isolated staging project, with fresh test-user JWTs.
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
if(process.env.LOAD_CONFIRM!=='OWN_STAGING_PROJECT') throw new Error('Read docs/OPERATIONS.md; set LOAD_CONFIRM=OWN_STAGING_PROJECT to opt in.')
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_ANON_KEY,file=process.env.LOAD_SESSIONS_FILE
if(!url||!key||!file) throw new Error('URL, publishable key and LOAD_SESSIONS_FILE are required.')
const sessions=JSON.parse(await readFile(file,'utf8'))
if(!Array.isArray(sessions)||sessions.length<2||sessions.length>200) throw new Error('Supply 2–200 distinct staging sessions.')
if(new Set(sessions.map(s=>s.user_id)).size!==sessions.length) throw new Error('User IDs must be distinct.')
for(const s of sessions){const jwt=JSON.parse(Buffer.from(s.access_token.split('.')[1],'base64url').toString());if(jwt.sub!==s.user_id||jwt.exp*1000<Date.now()+600000)throw new Error('Sessions need matching IDs and at least 10 minutes remaining.')}
const clients=[],sent=new Set(),received=[],latencies=[],issued=new Map()
let joinErrors=0,sendErrors=0
async function subscribe(channel){await new Promise((resolve,reject)=>{let settled=false;const timeout=setTimeout(()=>{settled=true;reject(new Error('Join timeout'))},20000);channel.subscribe(status=>{if(settled)return;if(status==='SUBSCRIBED'){settled=true;clearTimeout(timeout);resolve()}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){settled=true;clearTimeout(timeout);reject(new Error('Join failed'))}})})}
try {
  for(const [i,s] of sessions.entries()) {
    const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${s.access_token}`}},auth:{persistSession:false,autoRefreshToken:false}})
    await client.realtime.setAuth(s.access_token)
    const seen=new Set();received.push(seen)
    const chat=client.channel('room:chat',{config:{private:true}}).on('broadcast',{event:'change'},({payload})=>{const id=payload.message?.id;if(id&&issued.has(id)){seen.add(id);latencies.push(Date.now()-issued.get(id))}})
    const state=client.channel('room:state',{config:{private:true}})
    const presence=client.channel('room:presence',{config:{private:true,presence:{key:s.user_id}}})
    clients.push({client,presence})
    try {
      const {error}=await client.rpc('join_room',{p_nickname:`load_${s.user_id.slice(0,12)}`});if(error)throw error
      await subscribe(chat);await subscribe(state);await subscribe(presence)
      if(await presence.track({online:true})!=='ok')throw new Error('Presence track failed')
    } catch {joinErrors++;throw new Error(`Client ${i+1} failed to join; stopping load.`)}
    await sleep(150) // Limits join and Presence burst; deliberately not a thundering herd.
  }
  await sleep(3000)
  const counts=clients.map(c=>Object.keys(c.presence.presenceState()).length)
  if(counts.some(n=>n!==clients.length))throw new Error(`Presence counts differ from ${clients.length}; observed ${Math.min(...counts)}–${Math.max(...counts)}`)
  // 30 messages, one per second, rotating authenticated senders. ~200 deliveries/sec at 200 users.
  for(let i=0;i<30;i++) {
    const id=randomUUID();issued.set(id,Date.now())
    const {error}=await clients[i%clients.length].client.rpc('send_message',{p_id:id,p_message:`staging-load ${i+1}`})
    if(error)sendErrors++;else sent.add(id)
    await sleep(1000)
  }
  await sleep(5000)
  const deliveries=received.map(seen=>[...sent].filter(id=>seen.has(id)).length)
  latencies.sort((a,b)=>a-b)
  const report={clients:clients.length,sent:sent.size,joinErrors,sendErrors,minDelivered:Math.min(...deliveries),maxDelivered:Math.max(...deliveries),p95Ms:latencies[Math.floor(latencies.length*.95)]??null,presenceVerified:true}
  console.log(JSON.stringify(report,null,2))
  if(sendErrors||deliveries.some(n=>n!==sent.size))process.exitCode=1
}finally{await Promise.allSettled(clients.map(c=>c.client.removeAllChannels()))}
