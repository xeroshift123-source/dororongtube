import { describe, expect, it } from 'vitest'
import { applyChatEvent, latestBroadcast, orderedMessages, parseVideoId, presenceCount } from '../src/utils/room'
import type { BroadcastState, ChatMessage } from '../src/types'
const message=(id:string):ChatMessage=>({id,user_id:'u',nickname:'시청자',message:'안녕 <script>alert(1)</script>',created_at:'2026-10-12T00:00:00Z',kind:'chat'})
describe('YouTube input',()=>{
  it.each(['abcdefghijk','https://youtube.com/watch?v=abcdefghijk&t=60','https://youtu.be/abcdefghijk','https://www.youtube.com/live/abcdefghijk','https://m.youtube.com/watch?v=abcdefghijk'])('accepts %s',url=>expect(parseVideoId(url)).toBe('abcdefghijk'))
  it.each(['https://youtube.com.evil.test/watch?v=abcdefghijk','javascript:alert(1)','https://evil.test/abcdefghijk','short'])('rejects %s',url=>expect(parseVideoId(url)).toBeNull())
})
describe('authoritative state',()=>{
  it('never overwrites a newer revision',()=>{const newer={revision:4,status:'live'} as BroadcastState;expect(latestBroadcast(newer,{revision:3,status:'ended'} as BroadcastState)).toBe(newer)})
  it('deduplicates and bounds 200 senders to the newest 100 records',()=>{const all=Array.from({length:200},(_,i)=>message(String(i).padStart(3,'0')));const result=orderedMessages([...all,...all]);expect(result).toHaveLength(100);expect(result[0].id).toBe('100')})
  it('detects event loss and ignores delayed duplicates',()=>{const state={revision:1,messages:[message('a')]};expect(applyChatEvent(state,{revision:3,kind:'insert',message:message('b')}).gap).toBe(true);expect(applyChatEvent(state,{revision:1,kind:'insert',message:message('a')}).state).toBe(state)})
  it('deletion cannot be undone by stale events',()=>{const state=applyChatEvent({revision:1,messages:[message('a')]},{revision:2,kind:'delete',id:'a'}).state;expect(applyChatEvent(state,{revision:1,kind:'insert',message:message('a')}).state.messages).toEqual([])})
  it('counts one auth identity across tabs, ignores departed keys',()=>expect(presenceCount({user1:[{},{}],user2:[{}],departed:[]})).toBe(2))
})
