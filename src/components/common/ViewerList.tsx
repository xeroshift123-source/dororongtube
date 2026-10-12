import { useEffect, useRef, useState } from 'react'
import { Users, X } from 'lucide-react'
import type { ConnectionStatus, Viewer } from '../../types'

export function ViewerList({participants,status,userId}:{participants:Viewer[];status:ConnectionStatus;userId?:string}) {
  const [open,setOpen]=useState(false)
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    if(!open)return
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[open])
  return <div className="viewer-list-wrap" ref={root}>
    <button className="viewer-chip" ref={trigger} aria-expanded={open} aria-controls="viewer-list" aria-label="함께 시청 중인 인원 목록" onClick={()=>setOpen(!open)}><Users size={17}/><strong>{status==='connected'?participants.length:'—'}</strong><span>함께 시청 중</span></button>
    {open&&<section id="viewer-list" className="viewer-popover" aria-label="현재 시청자"><div className="viewer-list-heading"><h2>함께 시청 중 {status==='connected'?`(${participants.length})`:''}</h2><button aria-label="시청자 목록 닫기" onClick={()=>{setOpen(false);trigger.current?.focus()}}><X size={16}/></button></div>
      {status!=='connected'?<p className="viewer-list-empty">연결되면 현재 인원을 확인할 수 있어요.</p>:participants.length===0?<p className="viewer-list-empty">접속 인원을 확인하고 있어요.</p>:<ul>{participants.map(person=><li key={person.id}><span className="dot green"/><strong style={{color:person.color}}>{person.nickname}</strong>{person.id===userId&&<small>나</small>}</li>)}</ul>}
    </section>}
  </div>
}
