import { describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from '@shared/async'

const later = <T>(value: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(value), ms))

describe('thôi chờ một việc treo', () => {
  it('xong trước hạn thì trả kết quả bình thường', async () => {
    await expect(withTimeout(later('xong', 5), 200, 'Việc')).resolves.toBe('xong')
  })

  it('quá hạn thì ném TimeoutError nói rõ đang chờ cái gì và bao lâu', async () => {
    const timedOut = await withTimeout(later('muộn', 5000), 30, 'Thư mục đích').catch((e) => e)
    expect(timedOut).toBeInstanceOf(TimeoutError)
    expect((timedOut as Error).message).toContain('Thư mục đích')
  })

  it('việc hỏng thật thì giữ nguyên lỗi gốc, không nuốt thành lỗi hết giờ', async () => {
    const boom = Promise.reject(new Error('EACCES'))
    await expect(withTimeout(boom, 1000, 'Việc')).rejects.toThrow('EACCES')
  })

  it('không để lại timer treo sau khi việc đã xong', async () => {
    vi.useFakeTimers()
    try {
      const promise = withTimeout(Promise.resolve('xong'), 10_000, 'Việc')
      await expect(promise).resolves.toBe('xong')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
