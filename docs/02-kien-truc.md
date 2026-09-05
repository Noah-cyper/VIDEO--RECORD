# 02 — Kiến trúc hệ thống

## 1. Luồng dữ liệu tổng thể

```
┌──────────────────────────────────────────────────────────────────────┐
│                          NGUỒN TÍN HIỆU                              │
│                                                                      │
│   Microphone            Loa / thiết bị đầu ra          Màn hình      │
│   (giọng tôi)           (giọng đối phương)             (cửa sổ gọi)  │
└────────┬──────────────────────┬──────────────────────────┬───────────┘
         │                      │                          │
   getUserMedia          getDisplayMedia            getDisplayMedia
                        (audio: 'loopback')            (video)
         │                      │                          │
         ▼                      ▼                          ▼
   ┌───────────┐          ┌───────────┐            ┌─────────────┐
   │ MicTrack  │          │ SysTrack  │            │ VideoTrack  │
   └─────┬─────┘          └─────┬─────┘            └──────┬──────┘
         │                      │                         │
         ├──► AnalyserNode ─────┼──► AnalyserNode         │   (VU meter cho UI)
         │                      │                         │
         ▼                      ▼                         ▼
   ┌───────────┐          ┌───────────┐            ┌─────────────┐
   │ Recorder  │          │ Recorder  │            │  Recorder   │   ← 3 MediaRecorder
   │   (mic)   │          │  (sys)    │            │   (video)   │     độc lập
   └─────┬─────┘          └─────┬─────┘            └──────┬──────┘
         │  chunk 5s            │  chunk 5s               │  chunk 5s
         ▼                      ▼                         ▼
   ┌──────────────────────────────────────────────────────────────┐
   │            THƯ MỤC TẠM  <session-id>/                        │
   │  mic.webm    system.webm    video.webm    session.json       │
   └──────────────────────────┬───────────────────────────────────┘
                              │  khi bấm Dừng
                              ▼
                     ┌─────────────────┐
                     │     FFMPEG      │  mux + loudnorm + bù offset
                     └────────┬────────┘
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  <Thư mục bản ghi>/2026-09-05_1430_Hop-khach-hang/           │
   │    recording.mp4      ← H.264 + 2 audio track                │
   │    metadata.json      ← thời lượng, thiết bị, mốc đánh dấu   │
   │    transcript.json    ← (Phase 4)                            │
   └──────────────────────────────────────────────────────────────┘
```

**Điểm mấu chốt:** mic và system audio đi song song từ đầu tới cuối, chỉ gặp nhau ở bước FFmpeg,
và ngay cả ở đó cũng là hai track riêng trong cùng một file container — không trộn thành một.

## 2. Phân tầng process

Electron có hai loại tiến trình, và việc chia đúng ở đây quyết định app có mượt hay không.

### Main process (Node.js)

Giữ mọi thứ chạm tới hệ điều hành và đĩa cứng:

| Module | Trách nhiệm |
|---|---|
| `main/permissions` | Xin quyền micro, ghi màn hình; kiểm tra trạng thái quyền |
| `main/sources` | Liệt kê màn hình/cửa sổ qua `desktopCapturer`; cấu hình `setDisplayMediaRequestHandler` |
| `main/storage` | Ghi chunk xuống đĩa, quản lý thư mục tạm, dọn rác |
| `main/ffmpeg` | Điều khiển tiến trình FFmpeg, phân tích tiến độ, báo lỗi |
| `main/library` | Chỉ mục bản ghi (SQLite), tìm kiếm, đổi tên, xoá |
| `main/tray` | Icon khay, phím tắt toàn cục |
| `main/whisper` | (Phase 4) tiến trình transcript |

### Renderer process (Chromium)

Giữ mọi thứ chạm tới Web API media và giao diện:

| Module | Trách nhiệm |
|---|---|
| `renderer/capture` | `getUserMedia`, `getDisplayMedia`, quản lý `MediaRecorder` |
| `renderer/meters` | `AudioContext` + `AnalyserNode` cho VU meter |
| `renderer/state` | Máy trạng thái ghi (nguồn sự thật duy nhất) |
| `renderer/ui` | Màn hình chính, thư viện, cài đặt |
| `renderer/overlay` | Cửa sổ overlay riêng, always-on-top |

### Cầu nối IPC

Renderer **không** được bật `nodeIntegration`. Mọi thao tác đặc quyền đi qua `contextBridge`
với danh sách kênh cố định:

```ts
// preload.ts — chỉ những kênh này, không mở API tổng quát
window.callrec = {
  sources:  { list, pickDisplayMedia },
  storage:  { openSession, writeChunk, closeSession },
  export:   { start, onProgress },
  library:  { list, search, rename, remove, revealInFolder },
  settings: { get, set },
}
```

Lý do siết chặt: app này đụng tới micro, màn hình và file cá nhân của người dùng. Một lỗ hổng
trong renderer không được phép biến thành quyền đọc toàn bộ đĩa.

## 3. Máy trạng thái ghi

Toàn bộ UI đọc từ một máy trạng thái duy nhất. Không có `isRecording` rải rác trong component.

```
        ┌───────┐  chọn nguồn xong   ┌────────┐
        │ idle  │ ─────────────────► │ armed  │
        └───────┘                    └───┬────┘
             ▲                           │ bấm Ghi
             │                           ▼
             │                    ┌─────────────┐ ◄──── resume ────┐
             │                    │  recording  │                  │
             │                    └──────┬──────┘ ──── pause ───► ┌┴────────┐
             │                           │                        │ paused  │
             │                     bấm Dừng                       └─────────┘
             │                           ▼
             │                    ┌─────────────┐
             │                    │ finalizing  │  (FFmpeg đang chạy)
             │                    └──────┬──────┘
             │                           ▼
        ┌────┴────┐  đóng     ┌─────────────────┐
        │  done   │ ◄─────────│  ok / error     │
        └─────────┘           └─────────────────┘
```

Quy tắc bất biến:

- Ở `recording` hoặc `paused` → overlay **bắt buộc** hiển thị, icon khay **bắt buộc** đổi màu.
  Đây là ràng buộc pháp lý (FR-08) nên nó nằm ở tầng state, không nằm ở tầng UI.
- Chuyển sang `error` bất cứ lúc nào cũng phải giữ được dữ liệu đã ghi.
- Không có đường nào từ `recording` về `idle` mà không đi qua `finalizing`.

## 4. Cấu trúc thư mục dự án

```
VIDEO--RECORD/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts
│   │   ├── permissions.ts
│   │   ├── sources.ts
│   │   ├── storage.ts
│   │   ├── ffmpeg.ts
│   │   ├── library.ts
│   │   └── tray.ts
│   ├── preload/
│   │   └── index.ts          # contextBridge
│   ├── renderer/
│   │   ├── capture/
│   │   ├── state/
│   │   ├── ui/
│   │   └── overlay/
│   └── shared/               # type dùng chung main ↔ renderer
│       ├── ipc.ts
│       └── types.ts
├── resources/
│   ├── ffmpeg/               # sidecar binary theo từng OS
│   └── icons/
├── docs/
├── tests/
└── package.json
```

## 5. Những quyết định đã cân nhắc và loại bỏ

| Phương án | Vì sao không chọn |
|---|---|
| **Tauri + Rust** | Nhẹ hơn Electron thật, nhưng phải tự viết binding loopback cho từng OS. Đổi 4–6 tuần lấy ~80 MB dung lượng cài đặt — không đáng ở giai đoạn này |
| **OBS Studio + plugin** | Ghi rất tốt nhưng người dùng phải cài OBS và cấu hình scene. Không phải sản phẩm dùng được ngay |
| **FFmpeg gọi trực tiếp thiết bị** | Trên Windows cần cài `virtual-audio-capturer`, trên macOS cần BlackHole. Bắt người dùng cài driver ảo là rào cản lớn nhất khiến họ bỏ cuộc |
| **Native app riêng cho từng OS** | Chất lượng cao nhất nhưng gấp đôi khối lượng công việc. Cân nhắc lại ở phiên bản 2.0 nếu Electron gặp trần hiệu năng |
| **Trộn 2 luồng audio khi ghi** | Đơn giản hơn nhưng mất khả năng tách người nói. Một quyết định không thể đảo ngược — dứt khoát không làm |
