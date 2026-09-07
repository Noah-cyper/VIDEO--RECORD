import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { translate, type Lang } from '@shared/i18n'
import type { LiveCaption } from '@shared/live'
import './styles.css'

/** Tốc độ chạy chữ: đủ chậm để đọc kịp, đủ nhanh để không tụt lại sau người đang nói. */
const PIXELS_PER_SECOND = 110
const MIN_SECONDS = 4

/**
 * Thanh phụ đề chạy ngang đầu màn hình. Cửa sổ riêng, xuyên chuột (không chắn cửa sổ cuộc gọi),
 * và tách hẳn khỏi ô chỉ báo đang ghi - ô kia là ràng buộc pháp lý FR-08, thanh này chỉ là tiện ích
 * bật tắt được.
 */
function Captions() {
  const [lang, setLang] = useState<Lang>('vi')
  const [current, setCurrent] = useState<LiveCaption | null>(null)
  const queue = useRef<LiveCaption[]>([])
  const lineRef = useRef<HTMLDivElement>(null)
  const [seconds, setSeconds] = useState(MIN_SECONDS)

  useEffect(() => {
    void window.callrec.settings.get().then((s) => setLang(s.language))
  }, [])

  useEffect(
    () =>
      window.callrec.live.onCaption((c) => {
        // Bản dịch tới sau bản gốc và mang cùng id: thay tại chỗ nếu dòng đó đang chạy, để người
        // đọc không phải xem hai lần cùng một câu.
        setCurrent((prev) => (prev && prev.id === c.id ? c : prev))
        queue.current = [...queue.current.filter((q) => q.id !== c.id), c]
        setCurrent((prev) => prev ?? (queue.current.shift() ?? null))
      }),
    [],
  )

  // Thời gian chạy tính theo chiều dài chữ, không dùng một con số cố định: câu dài mà chạy nhanh
  // như câu ngắn thì không ai đọc kịp.
  useEffect(() => {
    const width = lineRef.current?.scrollWidth ?? 0
    setSeconds(Math.max(MIN_SECONDS, (width + window.innerWidth) / PIXELS_PER_SECOND))
  }, [current])

  const next = () => {
    setCurrent(queue.current.shift() ?? null)
  }

  if (!current) return null
  const who = translate(lang, current.speaker === 'me' ? 'speaker.me' : 'speaker.them')

  return (
    <div className="ticker">
      <span className={`ticker-who ${current.speaker}`}>{who}</span>
      <div className="ticker-track">
        <div
          ref={lineRef}
          className="ticker-line"
          style={{ animationDuration: `${seconds}s` }}
          onAnimationEnd={next}
        >
          {current.translated ?? current.text}
          {current.translated && <span className="ticker-original">{current.text}</span>}
        </div>
      </div>
    </div>
  )
}

document.body.classList.add('overlay')
createRoot(document.getElementById('root') as HTMLElement).render(<Captions />)
