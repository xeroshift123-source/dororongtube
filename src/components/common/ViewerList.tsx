import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, X } from 'lucide-react'
import type { ConnectionStatus, Viewer } from '../../types'
import { AdminBadge } from './AdminBadge'
import { UserModerationMenu } from './UserModerationMenu'
import { rpc } from '../../services/supabase'
import { errorText } from '../../utils/room'

export function ViewerList({participants,status,userId,admin=false,refresh}:{participants:Viewer[];status:ConnectionStatus;userId?:string;admin?:boolean;refresh?:()=>void}) {
  const [open,setOpen]=useState(false)
  const [menu,setMenu]=useState<{person:Viewer;x:number;y:number}|null>(null)
  const [error,setError]=useState(''),[feedback,setFeedback]=useState('')
  const origin=useRef<HTMLElement|null>(null)
  const closeMenu=useCallback(()=>setMenu(null),[])
  useEffect(()=>{if(!open||!admin||status!=='connected'||(menu&&!participants.some(person=>person.id===menu.person.id)))setMenu(null)},[open,admin,status,participants,menu])
  function openMenu(person:Viewer,node:HTMLElement,x:number,y:number){origin.current=node;setMenu({person,x,y})}
  async function moderate(name:string,args:Record<string,unknown>){setError('');setFeedback('');try{const result=await rpc(name,args);refresh?.();setFeedback(name==='force_rename_user'?`닉네임을 ${result}로 변경했습니다.`:'사용자 설정을 변경했습니다.')}catch(e){setError(errorText(e))}}
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    if(!open)return
    const outside=(event:PointerEvent)=>{if((event.target as Element).closest?.('.chat-context-menu'))return;if(!root.current?.contains(event.target as Node))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[open])
  return <div className="viewer-list-wrap" ref={root}>
    <button className="viewer-chip" ref={trigger} aria-expanded={open} aria-controls="viewer-list" aria-label="함께 시청 중인 인원 목록" onClick={()=>setOpen(!open)}><Users size={17}/><strong>{status==='connected'?participants.length:'—'}</strong><span>함께 시청 중</span></button>
    {open&&<section id="viewer-list" className="viewer-popover" aria-label="현재 시청자"><div className="viewer-list-heading"><h2>함께 시청 중 {status==='connected'?`(${participants.length})`:''}</h2><button aria-label="시청자 목록 닫기" onClick={()=>{setOpen(false);trigger.current?.focus()}}><X size={16}/></button></div>
      {status!=='connected'?<p className="viewer-list-empty">연결되면 현재 인원을 확인할 수 있어요.</p>:participants.length===0?<p className="viewer-list-empty">접속 인원을 확인하고 있어요.</p>:<ul>{participants.map(person=><li key={person.id} tabIndex={admin?0:undefined} aria-haspopup={admin?'menu':undefined} onContextMenu={event=>{if(!admin)return;event.preventDefault();openMenu(person,event.currentTarget,event.clientX,event.clientY)}} onKeyDown={event=>{if(admin&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();openMenu(person,event.currentTarget,rect.left+12,rect.bottom)}}}><span className="dot green"/><strong style={{color:person.color}}>{person.nickname}{person.is_admin&&<AdminBadge/>}</strong>{person.id===userId&&<small>나</small>}</li>)}</ul>}
      {error&&<p className="error small" role="alert">{error}</p>}
      {feedback&&<p className="moderation-feedback" role="status">{feedback}</p>}
    </section>}
    {admin&&open&&menu&&<UserModerationMenu userId={menu.person.id} nickname={menu.person.nickname} x={menu.x} y={menu.y} origin={origin.current} onClose={closeMenu} onAction={(name,args)=>void moderate(name,args)}/>}
  </div>
}
