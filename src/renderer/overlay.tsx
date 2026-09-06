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

  useEffect(() => {
    void window.callrec.settings.get().then((s) => setLang(s.language))
  }, [])

  useEffect(
    () =>
      window.callrec.onIndicator((p) => {
        setState(p.state)
        setElapsed(p.elapsedMs)
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
  return (
    <div className="overlay-card">
      <div className="row" style={{ gap: 10, width: '100%' }}>
        <span className={`dot ${paused || finalizing ? 'paused' : 'blink'}`} />
        <span className="overlay-time">{formatDuration(elapsed)}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {translate(lang, finalizing ? 'overlay.saving' : paused ? 'overlay.paused' : 'overlay.recording')}
        </span>
      </div>
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
