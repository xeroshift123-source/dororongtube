import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRoom } from '../src/hooks/useRoom'
import type { BroadcastState } from '../src/types'
type Channel={topic:string;handlers:Record<string,(event:{payload:unknown})=>void>;callback?:(state:string)=>void;track:ReturnType<typeof vi.fn>;presenceState:()=>Record<string,unknown[]>;on:(type:string,filter:{event:string},fn:(event:{payload:unknown})=>void)=>Channel;subscribe:(fn:(state:string)=>void)=>Channel}
const mock=vi.hoisted(()=>({channels:[] as Channel[],rpc:vi.fn(),single:vi.fn(),remove:vi.fn()}))
vi.mock('../src/services/supabase',()=>({rpc:mock.rpc,db:()=>({from:()=>({select:()=>({eq:()=>({single:mock.single})})}),removeChannel:mock.remove,channel:(topic:string)=>{const c:Channel={topic,handlers:{},track:vi.fn().mockResolvedValue('ok'),presenceState:()=>({u:[{},{}],v:[{}]}),on(type,filter,fn){this.handlers[`${type}:${filter.event}`]=fn;return this},subscribe(fn){this.callback=fn;return this}};mock.channels.push(c);return c}})}))
const state=(revision:number):BroadcastState=>({id:1,youtube_video_id:'abcdefghijk',title:'live',status:'live',started_at:null,updated_at:'',updated_by:null,revision})
beforeEach(()=>{mock.channels.length=0;mock.rpc.mockReset().mockResolvedValue({revision:0,messages:[]});mock.single.mockReset().mockResolvedValue({data:state(1),error:null});mock.remove.mockReset()})
afterEach(cleanup)
it('updates Presence nickname without recreating subscriptions',async()=>{
  const {rerender}=renderHook(({nickname})=>useRoom('u',nickname,'#75d5ce'),{initialProps:{nickname:'처음'}})
  act(()=>mock.channels.forEach(channel=>channel.callback?.('SUBSCRIBED')))
  await waitFor(()=>expect(mock.channels[2].track).toHaveBeenCalledWith(expect.objectContaining({nickname:'처음',color:'#75d5ce'})))
  rerender({nickname:'변경'})
  await waitFor(()=>expect(mock.channels[2].track).toHaveBeenLastCalledWith(expect.objectContaining({nickname:'변경'})))
  expect(mock.channels).toHaveLength(3)
})
it('hydrates shared state then re-fetches on channel reconnect',async()=>{const {result}=renderHook(()=>useRoom('u'));await waitFor(()=>expect(result.current.broadcast?.revision).toBe(1));mock.single.mockResolvedValue({data:state(2),error:null});act(()=>mock.channels.forEach(c=>c.callback?.('SUBSCRIBED')));await waitFor(()=>expect(result.current.broadcast?.revision).toBe(2));expect(result.current.status).toBe('connected');expect(mock.channels[2].track).toHaveBeenCalledTimes(1)})
it('restores missed/deleted messages with an authoritative snapshot after an event gap',async()=>{const {result}=renderHook(()=>useRoom('u'));await waitFor(()=>expect(result.current.broadcast).not.toBeNull());mock.rpc.mockResolvedValue({revision:3,messages:[]});act(()=>mock.channels[0].handlers['broadcast:change']({payload:{revision:3,kind:'delete',id:'lost'}}));await waitFor(()=>expect(mock.rpc).toHaveBeenCalledTimes(2));expect(result.current.messages).toEqual([])})
it('never applies a stale broadcast response and reacts to network return',async()=>{const {result}=renderHook(()=>useRoom('u'));await waitFor(()=>expect(result.current.broadcast?.revision).toBe(1));mock.single.mockResolvedValue({data:state(0),error:null});act(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>expect(mock.single).toHaveBeenCalledTimes(2));expect(result.current.broadcast?.revision).toBe(1)})
it('deduplicates tabs in Presence, clears count on loss and releases channels',async()=>{const {result,unmount}=renderHook(()=>useRoom('u'));await waitFor(()=>expect(result.current.broadcast).not.toBeNull());act(()=>{mock.channels.forEach(c=>c.callback?.('SUBSCRIBED'));mock.channels[2].handlers['presence:sync']({payload:{}})});expect(result.current.viewers).toBe(2);act(()=>mock.channels[2].callback?.('CHANNEL_ERROR'));expect(result.current.viewers).toBe(0);expect(result.current.status).toBe('reconnecting');unmount();expect(mock.remove).toHaveBeenCalledTimes(3)})
it('does not get stuck reconnecting when the browser returns online with healthy channels',async()=>{const {result}=renderHook(()=>useRoom('u'));await waitFor(()=>expect(result.current.broadcast).not.toBeNull());act(()=>mock.channels.forEach(c=>c.callback?.('SUBSCRIBED')));act(()=>window.dispatchEvent(new Event('online')));expect(result.current.status).toBe('connected')})
