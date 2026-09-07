import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { RecordState } from '@shared/types'
import { formatDuration } from '@shared/naming'
import { translate, type Lang } from '@shared/i18n'
import { mergeCaption, type LiveCaption } from '@shared/live'
import './styles.css'

/**
 * Overlay không có nút đóng và không nhận lệnh ẩn: đây là chỉ báo bắt buộc (FR-08).
 * Nó chỉ biến mất khi main process huỷ cửa sổ vì trạng thái đã rời khỏi nhóm đang ghi.
 */
function Overlay() {
  const [state, setState] = useState<RecordState>('recording')
  const [elapsed, setElapsed] = useState(0)
  const [lang, setLang] = useState<Lang>('vi')
  const [captions, setCaptions] = useState<LiveCaption[]>([])
  // Khoá nút ngay khi bấm: lệnh đi một chiều nên bấm chồng là gửi hai lệnh cho cùng một việc.
  const [sent, setSent] = useState(false)

  useEffect(() => {
    void window.callrec.settings.get().then((s) => setLang(s.language))
  }, [])

  useEffect(
    () =>
      window.callrec.onIndicator((p) => {
        setState(p.state)
        setElapsed(p.elapsedMs)
        // Trạng thái đổi nghĩa là lệnh đã tới nơi; mở khoá để còn tạm dừng / tiếp tục tiếp.
        setSent(false)
      }),
    [],
  )

  // Chế độ ghi ngầm giấu cửa sổ chính, nên đây là chỗ duy nhất còn đọc được phụ đề lúc đang gọi.
  useEffect(
    () => window.callrec.live.onCaption((c) => setCaptions((prev) => mergeCaption(prev, c, 2))),
    [],
  )

  const paused = state === 'paused'
  const finalizing = state === 'finalizing'
  const T = (key: Parameters<typeof translate>[1]) => translate(lang, key)
  return (
    <div className="overlay-card">
      <div className="row" style={{ gap: 10, width: '100%' }}>
        <span className={`dot ${paused || finalizing ? 'paused' : 'blink'}`} />
        <span className="overlay-time">{formatDuration(elapsed)}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {T(finalizing ? 'overlay.saving' : paused ? 'overlay.paused' : 'overlay.recording')}
        </span>
      </div>
      {/* Ghi ngầm giấu cửa sổ chính, nên đây là chỗ duy nhất còn bấm được. Không có nút nào ẩn
          hay tắt chỉ báo - danh sách lệnh bị chặn ở cả preload lẫn main (FR-08). */}
      {!finalizing && (
        <div className="row" style={{ gap: 6 }}>
          <button
            disabled={sent}
            onClick={() => {
              setSent(true)
              window.callrec.sendOverlayCommand('pause')
            }}
          >
            {T(paused ? 'overlay.resume' : 'overlay.pause')}
          </button>
          <button onClick={() => window.callrec.sendOverlayCommand('bookmark')}>{T('overlay.bookmark')}</button>
          <button
            className="danger"
            disabled={sent}
            onClick={() => {
              setSent(true)
              window.callrec.sendOverlayCommand('stop')
            }}
          >
            {T('overlay.stop')}
          </button>
        </div>
      )}
      {captions.length > 0 && (
        <div className="overlay-captions">
          {captions.map((c) => (
            <div key={c.id}>
              <span className="live-who">{translate(lang, c.speaker === 'me' ? 'speaker.me' : 'speaker.them')}</span>
              <span>{c.translated ?? c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

document.body.classList.add('overlay')
createRoot(document.getElementById('root') as HTMLElement).render(<Overlay />)
