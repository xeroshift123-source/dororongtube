import { Copy, Radio, Settings, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { configured } from './services/supabase'
import { useSession } from './hooks/useSession'
import { useRoom } from './hooks/useRoom'
import { JoinForm } from './components/common/JoinForm'
import { LivePlayer } from './components/player/LivePlayer'
import { ChatPanel } from './components/chat/ChatPanel'
import { AdminPage } from './pages/AdminPage'
import { ProfileSettings } from './components/common/ProfileSettings'
import { ViewerList } from "./components/common/ViewerList"
import { AdminBadge } from './components/common/AdminBadge'
const labels={connecting:'연결 준비 중',connected:'실시간 연결됨',reconnecting:'다시 연결하는 중',offline:'네트워크 오프라인'}
export function App() {
  const session=useSession()
  const room=useRoom(session.user?.id,session.nickname,session.color,session.refreshProfile)
  const [copied,setCopied]=useState('')
  const [settingsOpen,setSettingsOpen]=useState(false)
  const adminPage=window.location.pathname==='/admin'
  const invite=async()=>{try{await navigator.clipboard.writeText(window.location.origin);setCopied('링크를 복사했어요')}catch{setCopied('주소창의 링크를 복사해 주세요')}window.setTimeout(()=>setCopied(''),3000)}
  return <div className="app-shell"><header className="site-header"><a className="brand" href="/"><span className="brand-symbol"><Radio size={24}/></span><span>도로롱<span className="brand-light">튜브</span><small>TOGETHER, LIVE.</small></span></a><nav><a href="/admin" className={adminPage?'active':''}><ShieldCheck size={16}/><span>방송 관리</span></a><button onClick={()=>void invite()}><Copy size={15}/><span>초대 링크</span></button>{session.nickname&&<button className="profile-settings-button" aria-label="내 닉네임과 색상 설정" onClick={()=>setSettingsOpen(true)}><span className="profile-button-name" style={{color:session.color}}>{session.nickname}{session.admin&&<AdminBadge/>}</span><Settings size={16}/></button>}</nav></header>
    <main className={!adminPage&&session.nickname?`watch-container`:undefined}><div className="room-toolbar"><ViewerList participants={room.participants} status={room.status} userId={session.user?.id} admin={session.admin} refresh={room.refresh}/></div>
    {!configured?<section className="setup-card"><Radio size={36}/><h2>시청방을 준비하고 있어요</h2><p>Supabase 연결 설정을 마치면 라이브와 채팅이 열립니다.</p><p className="muted small">프로젝트 README의 초기 설정 절차를 확인해 주세요.</p></section>:adminPage?<AdminPage admin={session.admin} state={room.broadcast} refresh={room.refresh}/>:session.loading?<div className="setup-card" role="status">입장 정보를 확인하는 중…</div>:!session.nickname?<JoinForm join={session.join} loading={session.loading} error={session.error} hasUser={Boolean(session.user)}/>:<div className="watch-layout"><div className="watch-main"><LivePlayer state={room.broadcast}/></div><ChatPanel messages={room.messages} nickname={session.nickname} userId={session.user!.id} admin={session.admin} status={room.status} refresh={room.refresh}/></div>}
    {room.error&&<p className="error connection-error" role="alert">{room.error} <button onClick={room.refresh}>다시 확인</button></p>}
    </main><footer><span className={`connection ${room.status==='connected'?'is-connected':''}`}><span className="dot"/>{configured?labels[room.status]:'시청방 준비 중'}</span><span>조금 더 가까이, 도로롱튜브</span><span className="footer-tag">ONE ROOM. MANY MOMENTS.</span></footer>{settingsOpen&&<ProfileSettings nickname={session.nickname} color={session.color} onSave={session.updateProfile} onClose={()=>setSettingsOpen(false)}/>}{copied&&<div className="toast" role="status">{copied}</div>}</div>
}
