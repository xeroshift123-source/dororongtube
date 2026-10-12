declare global { interface Window { onYouTubeIframeAPIReady?: () => void } }
let loading: Promise<typeof YT> | undefined
export function loadYouTube(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-youtube-api]')
    const script = existing ?? document.createElement('script')
    const timeout = window.setTimeout(() => { loading = undefined; script.remove(); reject(new Error('YouTube 연결 시간이 초과되었습니다.')) }, 15000)
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(window.YT) }
    script.onerror = () => { clearTimeout(timeout); loading = undefined; script.remove(); reject(new Error('YouTube API를 불러오지 못했습니다.')) }
    if (!existing) { script.src = 'https://www.youtube.com/iframe_api'; script.dataset.youtubeApi = 'true'; document.head.append(script) }
  })
  return loading
}
export const recoveryDelays = [5000, 15000, 45000, 120000] as const
// Local-only decisions. No duration/currentTime inputs and no room mutation path.
export function recoveryForState(state: number): boolean { return state === 0 || state === -1 || state === 3 }
