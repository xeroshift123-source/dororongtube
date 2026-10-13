export interface BroadcastState { id: number; youtube_video_id: string | null; title: string; status: 'waiting' | 'live' | 'ended'; started_at: string | null; updated_at: string; updated_by: string | null; revision: number }
export interface ChatMessage { id: string; user_id: string; nickname: string; nickname_color?: string | null; is_admin?: boolean; message: string; created_at: string; kind: 'chat' | 'announcement' }
export interface UserProfile { nickname: string; nickname_color?: string | null }
export interface Viewer { id: string; nickname: string; color: string; is_admin?: boolean; muted_until?: string | null }
export interface RoomProfile { user_id: string; nickname: string; nickname_color: string | null; is_admin: boolean; muted_until?: string | null }
export interface ChatSnapshot { revision: number; messages: ChatMessage[] }
export interface ChatEvent { revision: number; kind: 'insert' | 'delete'; message?: ChatMessage; id?: string }
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'
