import type { BroadcastState, ChatEvent, ChatMessage, ChatSnapshot } from '../types'
export function parseVideoId(input: string): string | null {
  const value = input.trim()
  if (/^[\w-]{11}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0] : ['youtube.com','youtube-nocookie.com'].includes(host) ? url.searchParams.get('v') ?? (/^\/(live|embed|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : null) : null
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch { return null }
}
export function latestBroadcast(current: BroadcastState | null, next: BroadcastState): BroadcastState {
  return !current || next.revision > current.revision ? next : current
}
export function orderedMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...new Map(messages.map(m => [m.id, m])).values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).slice(-100)
}
// Ignore stale events; a gap needs an authoritative snapshot, never guessed history.
export function applyChatEvent(state: ChatSnapshot, event: ChatEvent): { state: ChatSnapshot; gap: boolean } {
  if (event.revision <= state.revision) return { state, gap: false }
  if (event.revision !== state.revision + 1) return { state, gap: true }
  const messages = event.kind === 'delete' ? state.messages.filter(m => m.id !== event.id) : event.message ? orderedMessages([...state.messages, event.message]) : state.messages
  return { state: { revision: event.revision, messages }, gap: false }
}
export function presenceCount(state: Record<string, unknown[]>): number { return Object.values(state).filter(v => v.length > 0).length }
export function errorText(error: unknown): string { return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }
