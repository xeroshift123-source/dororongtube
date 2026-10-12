import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Turnstile } from './Turnstile'
export function JoinForm({join,loading,error,hasUser}:{join:(name:string,token?:string)=>Promise<void>;loading:boolean;error:string;hasUser:boolean}) {
  const [name,setName]=useState(()=>sessionStorage.getItem('dororong:nickname')??'')
  const [token,setToken]=useState('')
  const [reset,setReset]=useState(0)
  const captcha=Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY) && !hasUser
  return <div className="join-card"><div className="eyebrow">WELCOME TO THE ROOM</div><h2>어떤 이름으로 함께할까요?</h2><p className="muted">가입 없이 닉네임 하나면 충분해요.</p><form onSubmit={e=>{e.preventDefault(); void join(name,token || undefined).catch(()=>{setToken('');setReset(v=>v+1)})}}><label htmlFor="nickname">닉네임</label><div className="join-input"><input id="nickname" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={20} placeholder="2~20자 닉네임" required autoComplete="nickname"/><button className="primary" disabled={loading || (captcha && !token)}>{loading?'입장 중':'입장하기'}<ArrowRight size={17}/></button></div>{captcha && <Turnstile onToken={setToken} resetKey={reset}/>}<p className="hint">입장 후 우측 상단의 내 설정에서 닉네임과 색상을 바꿀 수 있어요.</p>{error && <p className="error" role="alert">{error}</p>}</form></div>
}
