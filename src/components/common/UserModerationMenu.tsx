import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, VolumeX } from 'lucide-react'

interface Props {
  userId: string
  nickname: string
  messageId?: string
  x: number
  y: number
  origin: HTMLElement | null
  onClose: () => void
  onAction: (name: string, args: Record<string, unknown>) => void
}

export function UserModerationMenu({userId,nickname,messageId,x,y,origin,onClose,onAction}:Props) {
  const menu=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const node=menu.current
    if(node){const rect=node.getBoundingClientRect();node.style.left=`${Math.max(8,Math.min(x,window.innerWidth-rect.width-8))}px`;node.style.top=`${Math.max(8,Math.min(y,window.innerHeight-rect.height-8))}px`;node.querySelector('button')?.focus()}
    const dismiss=(event:Event)=>{if(!menu.current?.contains(event.target as Node))onClose()}
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();origin?.focus({preventScroll:true})}}
    document.addEventListener('pointerdown',dismiss,true)
    document.addEventListener('scroll',dismiss,true)
    document.addEventListener('keydown',key,true)
    window.addEventListener('resize',onClose)
    return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('scroll',dismiss,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',onClose)}
  },[x,y,origin,onClose])
  function action(name:string,args:Record<string,unknown>){onClose();origin?.focus({preventScroll:true});onAction(name,args)}
  return createPortal(<div className="chat-context-menu" ref={menu} role="menu" aria-label={`${nickname} ${messageId?'채팅':'사용자'} 관리`} style={{left:x,top:y}} onKeyDown={event=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll('button'));const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus()}
  }}>
    <div className="chat-context-title">{nickname}</div>
    {messageId&&<button role="menuitem" onClick={()=>action('delete_message',{p_id:messageId})}><Trash2 size={14}/>메시지 삭제</button>}
    <button role="menuitem" onClick={()=>action('mute_user',{p_user_id:userId,p_minutes:10})}><VolumeX size={14}/>10분 채팅 제한</button>
    <button role="menuitem" onClick={()=>action('mute_user',{p_user_id:userId,p_minutes:0})}>채팅 제한 해제</button>
    <button role="menuitem" onClick={()=>action('force_rename_user',{p_user_id:userId})}><Pencil size={14}/>닉네임 강제 변경</button>
  </div>,document.body)
}
