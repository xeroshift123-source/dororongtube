import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { nicknameColors } from '../../utils/profile'
import { errorText } from '../../utils/room'

interface Props {
  nickname: string
  color: string
  onSave: (nickname: string, color: string) => Promise<void>
  onClose: () => void
}

export function ProfileSettings({ nickname, color, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(nickname)
  const [selected, setSelected] = useState(color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dialog.current?.showModal()
    input.current?.focus()
  }, [])

  async function save() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(name.trim(), selected)
      onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return <dialog className="profile-dialog" ref={dialog} aria-labelledby="profile-title" onCancel={event => {
    event.preventDefault()
    if (!saving) onClose()
  }}>
    <div className="profile-dialog-heading">
      <h2 id="profile-title">내 설정</h2>
      <button type="button" aria-label="설정 닫기" onClick={onClose} disabled={saving}><X size={18}/></button>
    </div>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <label htmlFor="profile-nickname">닉네임</label>
      <input ref={input} id="profile-nickname" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={20} required readOnly={saving} autoComplete="nickname"/>
      <fieldset disabled={saving} className="profile-colors">
        <legend>닉네임 색상</legend>
        <div className="profile-swatches">
          {nicknameColors.map(option => <label className="profile-swatch" key={option.value} style={{ color: option.value }}>
            <input type="radio" name="nickname-color" value={option.value} aria-label={option.label} checked={selected === option.value} onChange={() => setSelected(option.value)}/>
            <span style={{ backgroundColor: option.value }}>{selected === option.value && <Check size={16}/>}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="profile-preview"><strong style={{ color: selected }}>{name.trim() || '닉네임'}</strong> 함께 시청해요!</div>
      <p className="hint">변경한 닉네임과 색상은 앞으로 보내는 채팅에 적용돼요.</p>
      {error && <p role="alert" className="error small">{error}</p>}
      <div className="profile-actions"><button type="button" onClick={onClose} disabled={saving}>취소</button><button className="primary" disabled={saving || name.trim().length < 2}>{saving ? '저장 중…' : '저장하기'}</button></div>
    </form>
  </dialog>
}
