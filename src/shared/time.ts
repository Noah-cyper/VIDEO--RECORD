import type { StreamKind } from './types'

export interface StreamStart {
  kind: StreamKind
  /** performance.now() lúc MediaRecorder thực sự bắt đầu, so với t0 của phiên. */
  startedAtMs: number
}

/**
 * Ba MediaRecorder không bao giờ khởi động cùng lúc. Luồng nào bắt đầu sớm nhất là mốc 0,
 * các luồng còn lại nhận offset dương để bù bằng -itsoffset khi mux.
 */
export function computeOffsets(starts: StreamStart[]): Record<string, number> {
  if (starts.length === 0) return {}
  const base = Math.min(...starts.map((s) => s.startedAtMs))
  const out: Record<string, number> = {}
  for (const s of starts) out[s.kind] = Math.round(s.startedAtMs - base)
  return out
}

/** FFmpeg nhận offset theo giây, 3 chữ số thập phân là đủ (1ms). */
export function offsetToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}

export interface PauseSpan {
  atMs: number
  resumedAtMs?: number
}

/** Thời lượng thực = thời gian trôi qua trừ đi các khoảng đã tạm dừng. */
export function elapsedMs(startedAtMs: number, nowMs: number, pauses: PauseSpan[]): number {
  let paused = 0
  for (const p of pauses) {
    const end = p.resumedAtMs ?? nowMs
    paused += Math.max(0, end - p.atMs)
  }
  return Math.max(0, nowMs - startedAtMs - paused)
}

/**
 * Card âm thanh và card màn hình chạy trên hai bộ dao động khác nhau nên trôi dần theo thời gian.
 * Tỉ lệ này dùng cho filter asetrate khi buổi ghi dài (> 2 giờ) vượt ngưỡng NFR-02.
 */
export function driftRatio(expectedMs: number, actualMs: number): number {
  if (actualMs <= 0) return 1
  return expectedMs / actualMs
}

export const MAX_ACCEPTABLE_DRIFT_MS = 100

export function needsDriftCorrection(expectedMs: number, actualMs: number): boolean {
  return Math.abs(expectedMs - actualMs) > MAX_ACCEPTABLE_DRIFT_MS
}
