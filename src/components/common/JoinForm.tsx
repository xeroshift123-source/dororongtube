import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Turnstile } from './Turnstile'
export function JoinForm({join,loading,error,hasUser}:{join:(name:string,token?:string)=>Promise<void>;loading:boolean;error:string;hasUser:boolean}) {
  const [name,setName]=useState(()=>sessionStorage.getItem('dororong:nickname')??'')
  const [token,setToken]=useState('')
  const [reset,setReset]=useState(0)
  const captcha=Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY) && !hasUser
  return <div className="join-card">
    <div className="eyebrow">WELCOME TO THE ROOM</div>
    <h2>도로롱튜브에 오신 걸 환영합니다!</h2>
    <div className="join-rules">
      <p>모두가 즐겁게 방송을 시청할 수 있도록 입장 전 아래 사항을 확인해 주세요.</p>
      <ul>
        <li>펨코 닉네임과 동일하거나 유추할 수 있는 닉네임은 사용할 수 없습니다.</li>
        <li>특정 유저를 알아보거나 언급하는 행위, 사적인 친목 활동은 금지됩니다.</li>
        <li>부적절한 닉네임 및 운영 방해 행위는 제재될 수 있습니다.</li>
      </ul>
      <p>서로 배려하며 즐거운 단관을 만들어 주세요!</p>
    </div>
    <form onSubmit={e=>{e.preventDefault(); void join(name,token || undefined).catch(()=>{setToken('');setReset(v=>v+1)})}}><label htmlFor="nickname">닉네임</label><div className="join-input"><input id="nickname" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={20} placeholder="2~20자 닉네임" required autoComplete="nickname"/><button className="primary" disabled={loading || (captcha && !token)}>{loading?'입장 중':'입장하기'}<ArrowRight size={17}/></button></div>{captcha && <Turnstile onToken={setToken} resetKey={reset}/>}<p className="hint">입장 후 우측 상단의 내 설정에서 닉네임과 색상을 바꿀 수 있어요.</p>{error && <p className="error" role="alert">{error}</p>}</form>
  </div>
}
