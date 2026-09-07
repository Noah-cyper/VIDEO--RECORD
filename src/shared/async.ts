export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} không phản hồi sau ${Math.round(ms / 1000)} giây.`)
    this.name = 'TimeoutError'
  }
}

/**
 * Không huỷ được việc đang chạy - chỉ thôi chờ nó. Đủ cho thao tác đĩa: ổ USB bị rút hay ổ mạng
 * đứt thì lời gọi fs có thể treo hàng phút, và một lời gọi treo ở giữa đường xuất file nghĩa là
 * giao diện đứng ở "Đang xuất file… 0%" vĩnh viễn, không nút nào bấm được.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
