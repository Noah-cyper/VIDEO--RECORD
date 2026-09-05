import type { RecordState } from './types'
import { ACTIVE_STATES } from './types'

export type RecordEvent =
  | { type: 'SELECT_SOURCE' }
  | { type: 'CLEAR_SOURCE' }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'FINALIZED' }
  | { type: 'FAIL'; error: string }
  | { type: 'RESET' }
  /** Khôi phục phiên bị crash: manifest còn ở trạng thái recording khi app khởi động lại. */
  | { type: 'RECOVER' }

/**
 * Bảng chuyển trạng thái là nguồn sự thật duy nhất. Không có đường nào từ recording/paused
 * về idle mà không đi qua finalizing - bỏ qua bước đó là mất dữ liệu đã ghi.
 */
const TRANSITIONS: Record<RecordState, Partial<Record<RecordEvent['type'], RecordState>>> = {
  idle: { SELECT_SOURCE: 'armed', RECOVER: 'finalizing', FAIL: 'error' },
  armed: { CLEAR_SOURCE: 'idle', SELECT_SOURCE: 'armed', START: 'recording', FAIL: 'error' },
  recording: { PAUSE: 'paused', STOP: 'finalizing', FAIL: 'error' },
  paused: { RESUME: 'recording', STOP: 'finalizing', FAIL: 'error' },
  // FAIL khi đang finalizing vẫn giữ nguyên file thô, người dùng xuất lại được từ thư viện.
  finalizing: { FINALIZED: 'done', FAIL: 'error' },
  done: { RESET: 'idle', SELECT_SOURCE: 'armed' },
  error: { RESET: 'idle', SELECT_SOURCE: 'armed' },
}

export function canHandle(state: RecordState, event: RecordEvent['type']): boolean {
  return TRANSITIONS[state][event] !== undefined
}

export function nextState(state: RecordState, event: RecordEvent): RecordState {
  return TRANSITIONS[state][event.type] ?? state
}

export interface RecordContext {
  state: RecordState
  sourceId: string | null
  startedAtMs: number | null
  pauses: { atMs: number; resumedAtMs?: number }[]
  error: string | null
}

export const initialContext: RecordContext = {
  state: 'idle',
  sourceId: null,
  startedAtMs: null,
  pauses: [],
  error: null,
}

export function reduce(ctx: RecordContext, event: RecordEvent, nowMs = 0): RecordContext {
  const state = nextState(ctx.state, event)
  if (state === ctx.state && !canHandle(ctx.state, event.type)) return ctx

  switch (event.type) {
    case 'START':
      return { ...ctx, state, startedAtMs: nowMs, pauses: [], error: null }
    case 'PAUSE':
      return { ...ctx, state, pauses: [...ctx.pauses, { atMs: nowMs }] }
    case 'RESUME': {
      const pauses = ctx.pauses.slice()
      const open = pauses[pauses.length - 1]
      if (open && open.resumedAtMs === undefined) pauses[pauses.length - 1] = { ...open, resumedAtMs: nowMs }
      return { ...ctx, state, pauses }
    }
    case 'STOP': {
      // Đóng khoảng pause còn mở, nếu không thời lượng tính ra sẽ sai.
      const pauses = ctx.pauses.map((p) => (p.resumedAtMs === undefined ? { ...p, resumedAtMs: nowMs } : p))
      return { ...ctx, state, pauses }
    }
    case 'FAIL':
      return { ...ctx, state, error: event.error }
    case 'RESET':
      return { ...initialContext }
    case 'SELECT_SOURCE':
      return { ...ctx, state, error: null }
    case 'CLEAR_SOURCE':
      return { ...ctx, state, sourceId: null }
    default:
      return { ...ctx, state }
  }
}

/** Ràng buộc pháp lý FR-08 nằm ở tầng state, không nằm ở tầng UI. */
export function indicatorRequired(state: RecordState): boolean {
  return ACTIVE_STATES.includes(state)
}

export function isBusy(state: RecordState): boolean {
  return state === 'recording' || state === 'paused' || state === 'finalizing'
}
