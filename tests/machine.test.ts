import { describe, expect, it } from 'vitest'
import { canHandle, indicatorRequired, initialContext, nextState, reduce } from '@shared/machine'
import type { RecordState } from '@shared/types'

describe('chuyển trạng thái', () => {
  it('idle -> armed -> recording', () => {
    expect(nextState('idle', { type: 'SELECT_SOURCE' })).toBe('armed')
    expect(nextState('armed', { type: 'START' })).toBe('recording')
  })

  it('không cho ghi khi chưa chọn nguồn', () => {
    expect(canHandle('idle', 'START')).toBe(false)
    expect(nextState('idle', { type: 'START' })).toBe('idle')
  })

  it('không có đường từ recording/paused về idle mà bỏ qua finalizing', () => {
    for (const state of ['recording', 'paused'] as RecordState[]) {
      for (const event of ['RESET', 'SELECT_SOURCE', 'CLEAR_SOURCE', 'FINALIZED'] as const) {
        expect(nextState(state, { type: event } as never)).not.toBe('idle')
      }
      expect(nextState(state, { type: 'STOP' })).toBe('finalizing')
    }
  })

  it('lỗi khi đang finalizing vẫn giữ được đường xử lý', () => {
    expect(nextState('finalizing', { type: 'FAIL', error: 'x' })).toBe('error')
    expect(nextState('error', { type: 'RESET' })).toBe('idle')
  })

  it('phiên crash được đưa thẳng vào finalizing để xuất lại', () => {
    expect(nextState('idle', { type: 'RECOVER' })).toBe('finalizing')
  })
})

describe('chỉ báo bắt buộc (FR-08)', () => {
  it('bật ở mọi trạng thái đang hoạt động', () => {
    expect(indicatorRequired('recording')).toBe(true)
    expect(indicatorRequired('paused')).toBe(true)
    expect(indicatorRequired('finalizing')).toBe(true)
  })
  it('tắt khi không còn ghi', () => {
    for (const s of ['idle', 'armed', 'done', 'error'] as RecordState[]) {
      expect(indicatorRequired(s)).toBe(false)
    }
  })
})

describe('reduce', () => {
  const armed = reduce(initialContext, { type: 'SELECT_SOURCE' })

  it('ghi lại mốc bắt đầu', () => {
    const ctx = reduce(armed, { type: 'START' }, 1_000)
    expect(ctx.state).toBe('recording')
    expect(ctx.startedAtMs).toBe(1_000)
  })

  it('mở và đóng khoảng tạm dừng', () => {
    let ctx = reduce(armed, { type: 'START' }, 0)
    ctx = reduce(ctx, { type: 'PAUSE' }, 2_000)
    expect(ctx.pauses).toEqual([{ atMs: 2_000 }])
    ctx = reduce(ctx, { type: 'RESUME' }, 5_000)
    expect(ctx.pauses).toEqual([{ atMs: 2_000, resumedAtMs: 5_000 }])
  })

  it('STOP đóng khoảng tạm dừng còn mở để thời lượng không bị tính sai', () => {
    let ctx = reduce(armed, { type: 'START' }, 0)
    ctx = reduce(ctx, { type: 'PAUSE' }, 3_000)
    ctx = reduce(ctx, { type: 'STOP' }, 9_000)
    expect(ctx.pauses).toEqual([{ atMs: 3_000, resumedAtMs: 9_000 }])
    expect(ctx.state).toBe('finalizing')
  })

  it('bỏ qua sự kiện không hợp lệ mà không đổi tham chiếu', () => {
    const ctx = reduce(initialContext, { type: 'START' }, 0)
    expect(ctx).toBe(initialContext)
  })

  it('RESET xoá sạch ngữ cảnh', () => {
    let ctx = reduce(armed, { type: 'START' }, 0)
    ctx = reduce(ctx, { type: 'FAIL', error: 'hỏng' }, 1)
    expect(ctx.error).toBe('hỏng')
    expect(reduce(ctx, { type: 'RESET' }).error).toBeNull()
  })
})
