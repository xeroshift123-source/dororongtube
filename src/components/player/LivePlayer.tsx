import { Play, Radio, RotateCw, Volume2, VolumeX } from 'lucide-react'
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer'
import type { BroadcastState } from '../../types'
export function LivePlayer({state}:{state:BroadcastState | null}) {
  const live=state?.status==='live' ? state.youtube_video_id : null
  const p=useYouTubePlayer(live,state?.revision ?? 0)
  return <section className="video-card" aria-label="라이브 플레이어">
    <div className="player-frame">
      {live ? <div className="youtube-mount" ref={p.container}/> : <div className="waiting"><div className="waiting-icon"><Radio size={40}/></div><span className="eyebrow">OUR LITTLE WATCH PARTY</span><h2>{state?.status==='ended' ? '다음 라이브에서 만나요' : '함께 볼 준비, 되셨나요?'}</h2><p>{state?.status==='ended' ? '관리자가 방송을 종료했습니다.' : '방송이 시작되면 이곳에서 함께 시청할 수 있어요.'}</p><span className="waiting-label"><span className="dot"/> 방송 대기 중</span></div>}
    </div>
    {live && <div className="player-tools"><span className="small muted">{p.status}</span><div className="tool-actions">{p.needsPlay && <button onClick={p.play}><Play size={15}/> 재생하기</button>}<button onClick={p.toggleSound}>{p.muted ? <VolumeX size={15}/> : <Volume2 size={15}/>} {p.muted?'소리 켜기':'음소거'}</button><button onClick={p.reload}><RotateCw size={15}/> 라이브 다시 연결</button></div></div>}
    {live && p.error && <p role="alert" className="error player-error">{p.error}</p>}
  </section>
}
