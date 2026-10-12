import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ViewerList } from '../src/components/common/ViewerList'
import { presenceViewers } from '../src/utils/presence'
afterEach(cleanup)
it('deduplicates tabs and uses the latest available nickname and safe color',()=>{
  const people=presenceViewers({u:[{nickname:'이전',profile_at:1},{nickname:'새닉네임',color:'#75d5ce',profile_at:2}],v:[{}],gone:[]})
  expect(people).toHaveLength(2)
  expect(people.find(person=>person.id==='u')).toEqual({id:'u',nickname:'새닉네임',color:'#75d5ce'})
  expect(people.find(person=>person.id==='v')?.nickname).toBe('입장 중')
})
it('opens the current viewer list, marks self and closes on Escape',()=>{
  render(<ViewerList participants={[{id:'u',nickname:'내이름',color:'#75d5ce'}]} status="connected" userId="u"/>)
  const button=screen.getByRole('button',{name:'함께 시청 중인 인원 목록'})
  fireEvent.click(button)
  expect(screen.getByText('내이름')).toBeTruthy();expect(screen.getByText('나')).toBeTruthy()
  fireEvent.keyDown(document,{key:'Escape'})
  expect(screen.queryByText('내이름')).toBeNull()
  expect(document.activeElement).toBe(button)
})
it('does not show stale names while disconnected and closes on outside click',()=>{
  render(<ViewerList participants={[{id:'u',nickname:'오래된이름',color:'#75d5ce'}]} status="offline"/>)
  fireEvent.click(screen.getByRole('button',{name:'함께 시청 중인 인원 목록'}))
  expect(screen.queryByText('오래된이름')).toBeNull()
  expect(screen.getByText('연결되면 현재 인원을 확인할 수 있어요.')).toBeTruthy()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('region',{name:'현재 시청자'})).toBeNull()
})
