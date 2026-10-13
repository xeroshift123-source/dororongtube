import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useYouTubePlayer } from '../src/hooks/useYouTubePlayer'
const mocks=vi.hoisted(()=>({players:[] as Array<{options:YT.PlayerOptions;isMuted:ReturnType<typeof vi.fn>;getVolume:ReturnType<typeof vi.fn>;setVolume:ReturnType<typeof vi.fn>;unMute:ReturnType<typeof vi.fn>;getPlayerState:ReturnType<typeof vi.fn>;events:YT.Events;destroy:ReturnType<typeof vi.fn>;getDuration:ReturnType<typeof vi.fn>;getCurrentTime:ReturnType<typeof vi.fn>;playVideo:ReturnType<typeof vi.fn>;mute:ReturnType<typeof vi.fn>}>, loader:vi.fn()}))
vi.mock('../src/services/youtube',async original=>({...await original<typeof import('../src/services/youtube')>(),loadYouTube:mocks.loader}))
function Harness({revision=1}:{revision?:number}) { const p=useYouTubePlayer('abcdefghijk',revision);return <><div ref={p.container}/><output>{p.status}</output><button onClick={p.reload}>reload</button>{p.needsPlay&&<button onClick={p.play}>play</button>}{p.error&&<span>{p.error}</span>}</> }
beforeEach(()=>{
  vi.useFakeTimers();mocks.players.length=0
  mocks.loader.mockResolvedValue({Player:class {
    options:YT.PlayerOptions;isMuted=vi.fn(()=>true);getVolume=vi.fn(()=>100);setVolume=vi.fn();unMute=vi.fn();getPlayerState=vi.fn(()=>1);events:YT.Events;destroy=vi.fn();getDuration=vi.fn(()=>3600);getCurrentTime=vi.fn(()=>10800);playVideo=vi.fn();mute=vi.fn()
    constructor(_target:unknown,options:YT.PlayerOptions){this.options=options;this.events=options.events!;mocks.players.push(this)}
  }})
})
afterEach(()=>{cleanup();vi.useRealTimers()})
const start=async()=>{render(<Harness/>);await act(async()=>{});const p=mocks.players[0];act(()=>{p.events.onReady?.({target:p} as unknown as YT.PlayerEvent);p.events.onStateChange?.({data:1,target:p} as unknown as YT.OnStateChangeEvent)});return p}
describe('long running live playback',()=>{
  it('restores native sound and volume after automatic recovery',async()=>{
    const p=await start()
    p.isMuted.mockReturnValue(false);p.getVolume.mockReturnValue(37)
    act(()=>vi.advanceTimersByTime(1000))
    act(()=>p.events.onStateChange?.({data:0,target:p} as unknown as YT.OnStateChangeEvent))
    await act(async()=>vi.advanceTimersByTime(25000))
    const next=mocks.players[1]
    expect(next.options.playerVars?.mute).toBe(0)
    act(()=>next.events.onReady?.({target:next} as unknown as YT.PlayerEvent))
    expect(next.setVolume).toHaveBeenCalledWith(37)
    expect(next.unMute).toHaveBeenCalledOnce()
    expect(next.mute).not.toHaveBeenCalled()
  })
  it('preserves intentional mute and captures changes immediately before manual reconnect',async()=>{
    const p=await start()
    p.getVolume.mockReturnValue(18)
    await act(async()=>screen.getByText('reload').click())
    const next=mocks.players[1]
    act(()=>next.events.onReady?.({target:next} as unknown as YT.PlayerEvent))
    expect(next.setVolume).toHaveBeenCalledWith(18)
    expect(next.mute).toHaveBeenCalledOnce()
    expect(next.unMute).not.toHaveBeenCalled()
  })
  it('does not reconnect healthy playback after network or tab return',async()=>{
    const p=await start()
    act(()=>window.dispatchEvent(new Event('online')))
    const visibility=vi.spyOn(document,'visibilityState','get')
    visibility.mockReturnValue('hidden')
    act(()=>document.dispatchEvent(new Event('visibilitychange')))
    act(()=>vi.advanceTimersByTime(5*60000))
    visibility.mockReturnValue('visible')
    act(()=>document.dispatchEvent(new Event('visibilitychange')))
    act(()=>vi.advanceTimersByTime(60000))
    expect(mocks.players).toHaveLength(1)
    expect(p.mute).toHaveBeenCalledOnce()
    visibility.mockRestore()
  })
  it.each([60,120,180])('does not end or reload after %i minutes even when duration is 3600',async minutes=>{const p=await start();act(()=>vi.advanceTimersByTime(minutes*60000));expect(mocks.players).toHaveLength(1);expect(p.destroy).not.toHaveBeenCalled();expect(p.getDuration).not.toHaveBeenCalled();expect(p.getCurrentTime).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toBe('라이브 재생 중')})
  it('ENDED only recreates this browser player without changing shared state',async()=>{const p=await start();act(()=>p.events.onStateChange?.({data:0,target:p} as unknown as YT.OnStateChangeEvent));await act(async()=>vi.advanceTimersByTime(25000));expect(mocks.players).toHaveLength(2);expect(p.destroy).toHaveBeenCalledOnce()})
  it('recovers a transient buffer without reloading if playback resumes',async()=>{const p=await start();act(()=>p.events.onStateChange?.({data:3,target:p} as unknown as YT.OnStateChangeEvent));act(()=>vi.advanceTimersByTime(10000));act(()=>p.events.onStateChange?.({data:1,target:p} as unknown as YT.OnStateChangeEvent));act(()=>vi.advanceTimersByTime(180*60000));expect(mocks.players).toHaveLength(1)})
  it('stops after four automatic recoveries',async()=>{await start();for(let i=0;i<5;i++){const p=mocks.players.at(-1)!;act(()=>p.events.onStateChange?.({data:0,target:p} as unknown as YT.OnStateChangeEvent));await act(async()=>vi.advanceTimersByTime(145000))}expect(mocks.players).toHaveLength(5);expect(screen.getByText(/자동 복구를 멈췄습니다/)).toBeTruthy()})
  it('offers user playback when autoplay is blocked',async()=>{const p=await start();act(()=>p.events.onAutoplayBlocked?.({target:p} as unknown as YT.PlayerEvent));expect(screen.getByText('play')).toBeTruthy();act(()=>vi.advanceTimersByTime(180*60000));expect(mocks.players).toHaveLength(1)})
})
