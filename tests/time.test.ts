import { describe, expect, it } from 'vitest'
import { computeOffsets, driftRatio, elapsedMs, needsDriftCorrection, offsetToSeconds } from '@shared/time'

describe('computeOffsets', () => {
  it('lấy luồng sớm nhất làm mốc 0', () => {
    expect(
      computeOffsets([
        { kind: 'mic', startedAtMs: 12 },
        { kind: 'system', startedAtMs: 54 },
        { kind: 'video', startedAtMs: 130 },
      ]),
    ).toEqual({ mic: 0, system: 42, video: 118 })
  })
  it('không sinh offset âm', () => {
    const out = computeOffsets([
      { kind: 'mic', startedAtMs: 100 },
      { kind: 'system', startedAtMs: 20 },
    ])
    expect(Object.values(out).every((v) => v >= 0)).toBe(true)
  })
  it('xử lý danh sách rỗng', () => {
    expect(computeOffsets([])).toEqual({})
  })
})

describe('offsetToSeconds', () => {
  it('đủ độ chính xác 1ms cho ffmpeg', () => {
    expect(offsetToSeconds(42)).toBe('0.042')
    expect(offsetToSeconds(0)).toBe('0.000')
    expect(offsetToSeconds(1500)).toBe('1.500')
  })
})

describe('elapsedMs', () => {
  it('trừ khoảng đã tạm dừng', () => {
    expect(elapsedMs(0, 10_000, [{ atMs: 2_000, resumedAtMs: 5_000 }])).toBe(7_000)
  })
  it('tính cả khoảng tạm dừng còn đang mở', () => {
    expect(elapsedMs(0, 10_000, [{ atMs: 4_000 }])).toBe(4_000)
  })
  it('cộng dồn nhiều lần tạm dừng', () => {
    expect(
      elapsedMs(0, 20_000, [
        { atMs: 2_000, resumedAtMs: 4_000 },
        { atMs: 8_000, resumedAtMs: 11_000 },
      ]),
    ).toBe(15_000)
  })
  it('không trả về số âm', () => {
    expect(elapsedMs(5_000, 1_000, [])).toBe(0)
  })
})

describe('drift', () => {
  it('bỏ qua lệch trong ngưỡng NFR-02', () => {
    expect(needsDriftCorrection(3_600_000, 3_600_080)).toBe(false)
  })
  it('phát hiện lệch vượt ngưỡng', () => {
    expect(needsDriftCorrection(3_600_000, 3_600_400)).toBe(true)
  })
  it('tỉ lệ hiệu chỉnh nhỏ hơn 1 khi audio dài hơn dự kiến', () => {
    expect(driftRatio(1000, 1010)).toBeCloseTo(0.990, 3)
    expect(driftRatio(1000, 0)).toBe(1)
  })
})
