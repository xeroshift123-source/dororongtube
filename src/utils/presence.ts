import type { Viewer } from '../types'
import { nicknameColor } from './profile'

export function presenceViewers(state: Record<string, unknown[]>): Viewer[] {
  return Object.entries(state).filter(([, entries]) => entries.length > 0).map(([id, entries]) => {
    const profiles = entries.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    const profile = profiles.filter(entry => typeof entry.nickname === 'string' && entry.nickname.trim()).sort((a,b) => Number(b.profile_at || 0) - Number(a.profile_at || 0))[0]
    return { id, nickname: profile ? String(profile.nickname).slice(0,20) : '입장 중', color: nicknameColor(id, typeof profile?.color === 'string' ? profile.color : undefined) }
  }).sort((a,b) => a.nickname.localeCompare(b.nickname,'ko'))
}
