import { useEffect, useRef, useState } from 'react'
import type { Recording } from '@shared/types'
import { formatBytes, formatDuration } from '@shared/naming'

export function LibraryView() {
  const [items, setItems] = useState<Recording[]>([])
  const [query, setQuery] = useState('')
  const [playing, setPlaying] = useState<Recording | null>(null)
  const [mediaSrc, setMediaSrc] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const open = async (rec: Recording) => {
    setPlaying(rec)
    setMediaSrc(await window.callrec.library.mediaUrl(rec.id))
  }

  const refresh = (q = query) =>
    void (q ? window.callrec.library.search(q) : window.callrec.library.list()).then(setItems)

  useEffect(() => {
    refresh('')
  }, [])

  const rename = async (rec: Recording) => {
    const title = window.prompt('Tên bản ghi', rec.title)
    if (title && title !== rec.title) {
      await window.callrec.library.rename(rec.id, title)
      refresh()
    }
  }

  const remove = async (rec: Recording) => {
    if (!window.confirm(`Xoá vĩnh viễn "${rec.title}"? Không khôi phục được.`)) return
    await window.callrec.library.remove(rec.id)
    if (playing?.id === rec.id) {
      setPlaying(null)
      setMediaSrc(null)
    }
    refresh()
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <input
        placeholder="Tìm theo tên hoặc ngày…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          refresh(e.target.value)
        }}
      />

      {playing && (
        <div className="panel col">
          <div className="row spread">
            <strong>{playing.title}</strong>
            <button className="ghost" onClick={() => { setPlaying(null); setMediaSrc(null) }}>Đóng</button>
          </div>
          {/* Hai audio track nằm trong cùng file; trình phát chọn track qua menu của chính nó. */}
          {mediaSrc ? (
            <video ref={videoRef} src={mediaSrc} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
          ) : (
            <p className="muted">Không mở được file bản ghi.</p>
          )}
          {playing.bookmarks.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {playing.bookmarks.map((b, i) => (
                <button
                  key={i}
                  className="ghost"
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = b.atMs / 1000
                  }}
                >
                  {formatDuration(b.atMs)} · {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rec-list">
        {items.map((rec) => (
          <div key={rec.id} className="rec-item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title">{rec.title}</div>
              <div className="meta">
                {new Date(rec.createdAt).toLocaleString('vi-VN')} · {formatDuration(rec.durationMs)} ·{' '}
                {formatBytes(rec.sizeBytes)} · {rec.hasVideo ? 'có hình' : 'chỉ tiếng'}
              </div>
            </div>
            <button onClick={() => void open(rec)}>Nghe lại</button>
            <button onClick={() => void rename(rec)}>Đổi tên</button>
            <button onClick={() => void window.callrec.library.reveal(rec.id)}>Mở thư mục</button>
            <button className="ghost" onClick={() => void remove(rec)}>Xoá</button>
          </div>
        ))}
        {items.length === 0 && <p className="muted">Chưa có bản ghi nào.</p>}
      </div>
    </div>
  )
}
