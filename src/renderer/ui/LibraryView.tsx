import { useEffect, useRef, useState } from 'react'
import type { Recording, Settings } from '@shared/types'
import type { TranscriptHitDto } from '@shared/ipc'
import { formatBytes, formatDuration } from '@shared/naming'
import { TranscriptPanel } from './TranscriptPanel'
import { useT } from './i18n'

export function LibraryView({ settings }: { settings: Settings }) {
  const t = useT()
  const [items, setItems] = useState<Recording[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<TranscriptHitDto[]>([])
  const [playing, setPlaying] = useState<Recording | null>(null)
  const [mediaSrc, setMediaSrc] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const open = async (rec: Recording, seekMs?: number) => {
    setPlaying(rec)
    setMediaSrc(await window.callrec.library.mediaUrl(rec.id))
    if (seekMs !== undefined) setPendingSeek(seekMs)
  }

  const [pendingSeek, setPendingSeek] = useState<number | null>(null)

  const seek = (ms: number) => {
    const video = videoRef.current
    if (!video) return setPendingSeek(ms)
    video.currentTime = ms / 1000
    void video.play().catch(() => undefined)
  }

  const refresh = (q = query) => {
    void (q ? window.callrec.library.search(q) : window.callrec.library.list()).then(setItems)
    // Tìm cả trong nội dung đã gỡ băng, không chỉ trong tên bản ghi (T-05).
    void (q ? window.callrec.transcript.searchAll(q) : Promise.resolve([] as TranscriptHitDto[])).then(setHits)
  }

  useEffect(() => {
    refresh('')
  }, [])

  const extractAudio = async (rec: Recording, track: number) => {
    const path = await window.callrec.library.extractAudio(rec.id, track)
    setNotice(path ? t('library.extracted', { path }) : t('library.extractFailed'))
  }

  const rename = async (rec: Recording) => {
    const title = window.prompt(t('library.renamePrompt'), rec.title)
    if (title && title !== rec.title) {
      await window.callrec.library.rename(rec.id, title)
      refresh()
    }
  }

  const remove = async (rec: Recording) => {
    if (!window.confirm(t('library.confirmDelete', { title: rec.title }))) return
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
        placeholder={t('library.search')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          refresh(e.target.value)
        }}
      />

      {playing && (
        <>
        <div className="panel col">
          <div className="row spread">
            <strong>{playing.title}</strong>
            <button className="ghost" onClick={() => { setPlaying(null); setMediaSrc(null) }}>{t('app.close')}</button>
          </div>
          {/* Hai audio track nằm trong cùng file; trình phát chọn track qua menu của chính nó. */}
          {mediaSrc ? (
            <video
              ref={videoRef}
              src={mediaSrc}
              controls
              style={{ width: '100%', borderRadius: 8, background: '#000' }}
              onLoadedMetadata={(e) => {
                // Tua tới mốc người dùng chọn trước khi video kịp load; đặt sớm hơn sẽ bị bỏ qua.
                if (pendingSeek === null) return
                e.currentTarget.currentTime = pendingSeek / 1000
                setPendingSeek(null)
              }}
            />
          ) : (
            <p className="muted">{t('library.cannotOpen')}</p>
          )}
          {playing.bookmarks.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {playing.bookmarks.map((b, i) => (
                <button key={i} className="ghost" onClick={() => seek(b.atMs)}>
                  {formatDuration(b.atMs)} · {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="panel col">
          <strong>{t('library.extractAudio')}</strong>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(playing.audioTracks ?? ['me', 'them']).map((speaker, index) => (
              <button key={speaker} onClick={() => void extractAudio(playing, index)}>
                {t(speaker === 'me' ? 'library.extractMe' : 'library.extractThem')}
              </button>
            ))}
          </div>
          {notice && <span className="muted" style={{ fontSize: 12 }}>{notice}</span>}
        </div>
        <TranscriptPanel recording={playing} settings={settings} onSeek={seek} />
        </>
      )}

      {hits.length > 0 && (
        <div className="panel col">
          <strong>{t('library.hits', { count: hits.length })}</strong>
          {hits.slice(0, 25).map((h, i) => (
            <button
              key={`${h.recordingId}-${i}`}
              className="hit"
              onClick={() => {
                // Bản ghi có thể không nằm trong danh sách đang lọc (tên không khớp truy vấn
                // nhưng nội dung thì khớp), nên phải lấy thẳng theo id.
                void window.callrec.library.get(h.recordingId).then((rec) => rec && open(rec, h.atMs))
              }}
            >
              <span className="seg-meta">
                {h.recordingTitle} · {formatDuration(h.atMs)} · {t(h.speaker === 'me' ? 'speaker.me' : 'speaker.them')}
              </span>
              <span>{h.text}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rec-list">
        {items.map((rec) => (
          <div key={rec.id} className="rec-item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title">{rec.title}</div>
              <div className="meta">
                {new Date(rec.createdAt).toLocaleString('vi-VN')} · {formatDuration(rec.durationMs)} ·{' '}
                {formatBytes(rec.sizeBytes)} · {t(rec.hasVideo ? 'library.withVideo' : 'library.audioOnly')}
              </div>
            </div>
            <button onClick={() => void open(rec)}>{t('library.play')}</button>
            <button onClick={() => void rename(rec)}>{t('library.rename')}</button>
            <button onClick={() => void window.callrec.library.reveal(rec.id)}>{t('record.openFolder')}</button>
            <button className="ghost" onClick={() => void remove(rec)}>{t('app.delete')}</button>
          </div>
        ))}
        {items.length === 0 && <p className="muted">{t('library.empty')}</p>}
      </div>
    </div>
  )
}
