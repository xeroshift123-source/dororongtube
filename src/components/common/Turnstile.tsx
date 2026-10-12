import { useEffect, useRef } from 'react'
type TurnstileApi = { render: (node:HTMLElement,options:Record<string,unknown>) => string; remove:(id:string)=>void }
declare global { interface Window { turnstile?: TurnstileApi } }
export function Turnstile({onToken,resetKey}:{onToken:(token:string)=>void;resetKey:number}) {
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=> {
    const key=import.meta.env.VITE_TURNSTILE_SITE_KEY
    if (!key) return
    let id:string | undefined,active=true
    const render=()=> { if (active && ref.current && window.turnstile && !id) id=window.turnstile.render(ref.current,{sitekey:key,theme:'dark',callback:onToken,'expired-callback':()=>onToken(''),'error-callback':()=>onToken('')}) }
    let script=document.querySelector<HTMLScriptElement>('script[data-turnstile]')
    if (!script) { script=document.createElement('script'); script.dataset.turnstile='true'; script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async=true; document.head.append(script) }
    script.addEventListener('load',render); render()
    return ()=> { active=false; script?.removeEventListener('load',render); if(id) window.turnstile?.remove(id) }
  },[onToken,resetKey])
  return <div ref={ref}/>
}
