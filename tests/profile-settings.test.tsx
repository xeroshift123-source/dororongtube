import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { ProfileSettings } from '../src/components/common/ProfileSettings'
import { nicknameColor } from '../src/utils/profile'

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal')
beforeAll(()=>Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true}}))
afterAll(()=>{if(originalShow)Object.defineProperty(HTMLDialogElement.prototype,'showModal',originalShow);else Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal')})
afterEach(cleanup)

it('previews a chosen color and saves the trimmed nickname',async()=>{
  const save=vi.fn().mockResolvedValue(undefined),close=vi.fn()
  render(<ProfileSettings nickname="기존이름" color="#9ecbff" onSave={save} onClose={close}/>)
  expect(document.activeElement).toBe(screen.getByLabelText('닉네임'))
  fireEvent.change(screen.getByLabelText('닉네임'),{target:{value:'  새이름  '}})
  fireEvent.click(screen.getByRole('radio',{name:'민트색'}))
  expect(screen.getByText('새이름').style.color).toBe('rgb(117, 213, 206)')
  fireEvent.click(screen.getByRole('button',{name:'저장하기'}))
  await vi.waitFor(()=>expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledWith('새이름','#75d5ce')
})
it('shows server rejection without closing or discarding edits',async()=>{
  const close=vi.fn()
  render(<ProfileSettings nickname="기존이름" color="#9ecbff" onSave={vi.fn().mockRejectedValue(new Error('이미 사용 중인 닉네임입니다'))} onClose={close}/>)
  fireEvent.change(screen.getByLabelText('닉네임'),{target:{value:'중복이름'}})
  fireEvent.click(screen.getByRole('button',{name:'저장하기'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','이미 사용 중인 닉네임입니다')
  expect((screen.getByLabelText('닉네임') as HTMLInputElement).value).toBe('중복이름')
  expect(close).not.toHaveBeenCalled()
})
it('cancel closes without saving',()=>{
  const save=vi.fn(),close=vi.fn()
  render(<ProfileSettings nickname="이름" color="#9ecbff" onSave={save} onClose={close}/>)
  fireEvent.click(screen.getByRole('button',{name:'취소'}))
  expect(close).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled()
})
it('uses a saved allowlisted color, with stable fallback for legacy messages',()=>{
  expect(nicknameColor('u','#75d5ce')).toBe('#75d5ce')
  expect(nicknameColor('u','invalid')).toBe(nicknameColor('u'))
})
