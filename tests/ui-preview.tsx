// Dev-server-only visual fixture; not a production build entry. No backend requests.
import { createRoot } from 'react-dom/client'
import { Radio, Users } from 'lucide-react'
import { ChatPanel } from '../src/components/chat/ChatPanel'
import { LivePlayer } from '../src/components/player/LivePlayer'
import '../src/styles.css'
const messages=[
  {id:'1',user_id:'one',nickname:'방송지기',message:'오늘도 찾아주셔서 반가워요. 잠시 후 라이브가 시작됩니다!',kind:'announcement' as const,created_at:'2026-10-12T10:00:00Z'},
  {id:'2',user_id:'two',nickname:'구름한조각',message:'안녕하세요! 오늘도 같이 봐요 ☁️',kind:'chat' as const,created_at:'2026-10-12T10:01:00Z'},
  {id:'3',user_id:'three',nickname:'도로롱',message:'좋아요. 따뜻한 차 한 잔 준비했어요.',kind:'chat' as const,created_at:'2026-10-12T10:02:00Z'},
  {id:'4',user_id:'me',nickname:'달빛산책',message:'다들 반가워요 :)',kind:'chat' as const,created_at:'2026-10-12T10:02:10Z'}
]
createRoot(document.getElementById('root')!).render(<div className="app-shell"><header className="site-header"><a href="/" className="brand"><span className="brand-symbol"><Radio size={24}/></span><span>도로롱<span className="brand-light">튜브</span><small>TOGETHER, LIVE.</small></span></a><span className="small muted">UI 테스트용 샘플 · 실제 접속 아님</span></header><main><div className="room-toolbar"><div className="viewer-chip"><Users size={17}/><strong>4</strong><span>샘플 시청자</span></div></div><div className="watch-layout"><div className="watch-main"><LivePlayer state={null}/></div><ChatPanel messages={messages} nickname="달빛산책" userId="me" admin={false} status="offline" refresh={()=>{}}/></div></main><footer><span>디자인 검증 전용 · 전송 비활성</span><span>조금 더 가까이, 도로롱튜브</span><span className="footer-tag">ONE ROOM. MANY MOMENTS.</span></footer></div>)
