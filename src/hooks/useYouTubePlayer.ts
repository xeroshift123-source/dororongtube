import { useCallback, useEffect, useRef, useState } from 'react'
import { loadYouTube, recoveryDelays, recoveryForState } from '../services/youtube'
import { errorText } from '../utils/room'
export function useYouTubePlayer(videoId: string | null, revision: number) {
  const container = useRef<HTMLDivElement>(null)
  const player = useRef<YT.Player | null>(null)
  const attempts = useRef(0)
  const [generation,setGeneration] = useState(0)
  const [status,setStatus] = useState('플레이어 준비 중')
  const [needsPlay,setNeedsPlay] = useState(false)
  const [muted,setMuted] = useState(true)
  const [error,setError] = useState('')
  useEffect(() => { attempts.current=0 },[videoId,revision])
  const reload = useCallback(() => { attempts.current=0; setGeneration(v=>v+1) },[])
  useEffect(() => {
    if (!videoId || !container.current) return
    let active=true, retry: number | undefined, watchdog: number | undefined
    const clearRecovery = () => { clearTimeout(retry); clearTimeout(watchdog); retry=undefined; watchdog=undefined }
    const recover = () => {
      if (!active || retry !== undefined || !navigator.onLine) return
      if (attempts.current >= recoveryDelays.length) { setError('자동 복구를 멈췄습니다. 방송 상태를 확인하고 직접 다시 연결해 주세요.'); return }
      const delay = recoveryDelays[attempts.current++]
      setStatus(`${Math.round(delay/1000)}초 후 라이브에 다시 연결`)
      retry=window.setTimeout(() => { if (active) setGeneration(v=>v+1) },delay)
    }
    setStatus('플레이어 준비 중'); setError(''); setNeedsPlay(false); setMuted(true)
    // YouTube replaces this child with an iframe. React owns only the outer container.
    const target=document.createElement('div'); container.current.replaceChildren(target)
    void loadYouTube().then(api => {
      if (!active) return
      player.current = new api.Player(target, {
        videoId, width:'100%',height:'100%',
        playerVars:{autoplay:1,mute:1,controls:0,disablekb:1,playsinline:1,rel:0,fs:1,origin:window.location.origin},
        events: {
          onReady: event => { if (!active) return; event.target.mute(); event.target.playVideo(); setStatus('라이브 연결 중'); watchdog=window.setTimeout(recover,20000) },
          onStateChange: event => {
            if (!active) return
            clearRecovery()
            if (event.data === 1) { setStatus('라이브 재생 중'); setNeedsPlay(false); setError('') }
            else if (event.data === 2 || event.data === 5) { setNeedsPlay(true); setStatus('클릭하여 라이브 재생') }
            else if (recoveryForState(event.data)) { setStatus(event.data === 3 ? '버퍼링 중' : '라이브 응답 대기 중'); watchdog=window.setTimeout(recover,20000) }
          },
          onAutoplayBlocked: () => { if (active) { clearRecovery(); setNeedsPlay(true); setStatus('클릭하여 라이브 재생') } },
          onError: event => {
            if (!active) return
            clearRecovery()
            if ([2,100,101,150,153].includes(event.data)) { setError(`YouTube 재생 오류 (${event.data}). 공개·임베드 허용 여부와 사이트 Referer 설정을 확인해 주세요.`); setStatus('재생 불가') }
            else { setError(`YouTube 연결 오류 (${event.data})`); recover() }
          }
        }
      })
    }).catch(e => { if (active) { setError(errorText(e)); recover() } })
    const online=()=>recover()
    let hiddenAt=0
    const visible=()=>{ if (document.visibilityState==='hidden') hiddenAt=Date.now(); else if (hiddenAt && Date.now()-hiddenAt>60000) { hiddenAt=0; recover() } }
    window.addEventListener('online',online); document.addEventListener('visibilitychange',visible)
    return ()=> { active=false; clearRecovery(); player.current?.destroy(); player.current=null; window.removeEventListener('online',online); document.removeEventListener('visibilitychange',visible) }
  },[videoId,revision,generation])
  const play = () => { player.current?.playVideo(); setNeedsPlay(false) }
  const toggleSound = () => { if (!player.current) return; if (muted) player.current.unMute(); else player.current.mute(); setMuted(!muted) }
  return {container,status,error,needsPlay,muted,reload,play,toggleSound}
}
