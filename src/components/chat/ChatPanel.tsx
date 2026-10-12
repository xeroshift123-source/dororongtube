import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, MessageCircle, Send, ShieldCheck, Trash2, VolumeX } from 'lucide-react'
import type { ChatMessage, ConnectionStatus } from '../../types'
import { rpc } from '../../services/supabase'
import { errorText } from '../../utils/room'
import { nicknameColor } from '../../utils/profile'
export function ChatPanel({messages,nickname,userId,admin,status,refresh}:{messages:ChatMessage[];nickname:string;userId:string;admin:boolean;status:ConnectionStatus;refresh:()=>void}) {
  const [text,setText]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState(''),[unread,setUnread]=useState(false)
  const [clearing,setClearing]=useState(false)
  const list=useRef<HTMLDivElement>(null),atBottom=useRef(true),draft=useRef<{id:string;text:string}|null>(null)
  const [cooldownUntil,setCooldownUntil]=useState(0),[remaining,setRemaining]=useState(0)
  useEffect(()=>{
    if(!cooldownUntil)return
    const update=()=>setRemaining(Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000)))
    update()
    const timer=window.setInterval(()=>{update();if(Date.now()>=cooldownUntil)window.clearInterval(timer)},100)
    document.addEventListener('visibilitychange',update)
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update)}
  },[cooldownUntil])
  const input=useRef<HTMLTextAreaElement>(null),restoreFocus=useRef(false)
  const [menu,setMenu]=useState<{message:ChatMessage;x:number;y:number}|null>(null)
  const menuRef=useRef<HTMLDivElement>(null),menuOrigin=useRef<HTMLElement|null>(null)
  useEffect(()=>{
    if(!menu) return
    const node=menuRef.current
    if(node){const rect=node.getBoundingClientRect();node.style.left=`${Math.max(8,Math.min(menu.x,window.innerWidth-rect.width-8))}px`;node.style.top=`${Math.max(8,Math.min(menu.y,window.innerHeight-rect.height-8))}px`;node.querySelector('button')?.focus()}
    const dismiss=(event:Event)=>{if(!menuRef.current?.contains(event.target as Node))setMenu(null)}
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMenu(null);menuOrigin.current?.focus({preventScroll:true})}}
    document.addEventListener('pointerdown',dismiss,true)
    document.addEventListener('scroll',dismiss,true)
    document.addEventListener('keydown',key)
    window.addEventListener('resize',dismiss)
    return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('scroll',dismiss,true);document.removeEventListener('keydown',key);window.removeEventListener('resize',dismiss)}
  },[menu])
  useEffect(()=>{if(!admin || (menu&&!messages.some(message=>message.id===menu.message.id)))setMenu(null)},[admin,messages,menu])
  function openMenu(message:ChatMessage,node:HTMLElement,x:number,y:number){menuOrigin.current=node;setMenu({message,x,y})}
  function menuAction(name:string,args:Record<string,unknown>){setMenu(null);menuOrigin.current?.focus({preventScroll:true});void moderate(name,args)}
  useEffect(()=>{if(!sending&&restoreFocus.current){restoreFocus.current=false;input.current?.focus({preventScroll:true})}},[sending])
  useEffect(()=> { if(atBottom.current) { list.current?.scrollTo?.({top:list.current.scrollHeight,behavior:'instant'}); setUnread(false) } else setUnread(true) },[messages])
  async function send() {
    const message=text.trim()
    if(!message || sending || status!=='connected') return
    if(Date.now()<cooldownUntil) return
    const attempt=draft.current?.text===message ? draft.current : {id:crypto.randomUUID(),text:message}
    draft.current=attempt;restoreFocus.current=true;setSending(true);setError('')
    try { await rpc('send_message',{p_id:attempt.id,p_message:message}); setText('');draft.current=null;setRemaining(3);setCooldownUntil(Date.now()+3000);atBottom.current=true;refresh() }
    catch(e) { setError(`${errorText(e)} 같은 내용으로 재전송하면 중복 저장되지 않습니다.`) } finally {setSending(false)}
  }
  async function moderate(name:string,args:Record<string,unknown>) {try{await rpc(name,args);refresh();setError('')}catch(e){setError(errorText(e))}}
  async function clearChat(){
    if(clearing||!window.confirm('모든 채팅 기록을 삭제할까요? 모든 시청자에게 적용되며 복구할 수 없습니다.'))return
    setClearing(true);setMenu(null);setError('')
    try{await rpc('clear_chat');refresh()}
    catch(e){setError((e as {code?:string})?.code==='PGRST202'?'채팅 전체 삭제 기능의 추가 SQL을 먼저 실행해 주세요.':errorText(e))}
    finally{setClearing(false)}
  }
  return <aside className="chat-panel" aria-label="실시간 채팅"><div className="chat-header"><h2><MessageCircle size={18}/> 실시간 채팅</h2><div className="chat-header-actions"><span className="small muted">최근 100개</span>{admin&&<button className="clear-chat-button" disabled={clearing||status!=='connected'} onClick={()=>void clearChat()} aria-label="채팅 전체 삭제"><Trash2 size={13}/>{clearing?'삭제 중…':'전체 삭제'}</button>}</div></div><div className="chat-guideline"><span className="dot green"/> 서로를 존중하는 따뜻한 대화</div>
    <div className="message-list" ref={list} role="log" aria-label="채팅 메시지" aria-live="polite" aria-relevant="additions" onScroll={()=>{const node=list.current;if(node){atBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<70;if(atBottom.current)setUnread(false)}}}>
      {messages.length===0 && <div className="empty-chat"><MessageCircle size={30}/><p>오늘의 첫 인사를 남겨보세요.</p><span>함께 보면 더 즐거우니까요.</span></div>}
      {messages.map(m=><article key={m.id} tabIndex={admin?0:undefined} aria-haspopup={admin?'menu':undefined} onContextMenu={event=>{if(!admin)return;event.preventDefault();openMenu(m,event.currentTarget,event.clientX,event.clientY)}} onKeyDown={event=>{if(admin&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();openMenu(m,event.currentTarget,rect.left+12,rect.bottom)}}} className={`message ${m.kind==='announcement'?'announcement':''} ${m.user_id===userId?'own':''}`}><div className="message-line"><strong className="message-nickname" style={{color:nicknameColor(m.user_id,m.nickname_color)}}>{m.kind==='announcement' && <ShieldCheck size={13} aria-label="관리자 공지"/>}{m.nickname}</strong>{' '}<span className="message-content">{m.message}</span>{' '}<time className="message-time" dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}</time></div></article>)}
    </div>{unread && <button className="new-messages" onClick={()=>{atBottom.current=true;list.current?.scrollTo?.({top:list.current.scrollHeight});setUnread(false)}}><ArrowDown size={14}/> 새 메시지 보기</button>}
    <form className="chat-composer" onSubmit={e=>{e.preventDefault();void send()}}><div className="composer-identity"><span className="dot green"/>{nickname}<span>님으로 대화 중</span></div><label className="sr-only" htmlFor="message">채팅 메시지</label><textarea ref={input} id="message" placeholder={status==='connected'?'다 같이 이야기해요…':'연결을 기다리고 있어요…'} value={text} readOnly={sending} aria-busy={sending} maxLength={500} rows={2} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><div className="composer-bottom"><span>{text.length}/500 · Shift+Enter 줄바꿈</span><button className="primary" disabled={sending || remaining>0 || !text.trim() || status!=='connected'} aria-label={remaining>0?`메시지 전송 (${remaining}초 후 가능)`: `메시지 전송`} title={remaining>0?`${remaining}초 후 다시 전송할 수 있어요`: `메시지 전송`}>{remaining>0?<span className="send-countdown">{remaining}초</span>:<Send size={16}/>}</button></div>{error&&<p className="error small" role="alert">{error}</p>}</form>
    {admin&&menu&&createPortal(<div className="chat-context-menu" ref={menuRef} role="menu" aria-label={`${menu.message.nickname} 채팅 관리`} style={{left:menu.x,top:menu.y}} onKeyDown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll('button'));const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus()}}}>
      <div className="chat-context-title">{menu.message.nickname}</div>
      <button role="menuitem" onClick={()=>menuAction('delete_message',{p_id:menu.message.id})}><Trash2 size={14}/>메시지 삭제</button>
      <button role="menuitem" onClick={()=>menuAction('mute_user',{p_user_id:menu.message.user_id,p_minutes:10})}><VolumeX size={14}/>10분 채팅 제한</button>
      <button role="menuitem" onClick={()=>menuAction('mute_user',{p_user_id:menu.message.user_id,p_minutes:0})}>채팅 제한 해제</button>
    </div>,document.body)}
  </aside>
}
