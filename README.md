# CallRec — Ghi âm & ghi hình cuộc gọi trên máy tính

Ứng dụng desktop ghi lại cuộc gọi (Zoom, Teams, Google Meet, Zalo, Discord, hoặc điện thoại kết nối qua PC)
với **âm thanh đầy đủ của cả hai bên**:

- **Giọng của mình** — lấy từ microphone.
- **Giọng đầu bên kia** — lấy từ *loopback / system audio* (âm thanh đang phát ra loa), không cần bên kia cài gì.
- **Hình ảnh** — ghi màn hình (cửa sổ cuộc gọi hoặc toàn màn hình) + webcam tuỳ chọn.
- **Phụ đề trực tiếp** — gỡ băng ngay trong lúc ghi, có thể dịch sang ngôn ngữ khác; hiện ở cửa sổ
  chính và trên ô chỉ báo, kể cả khi đang ghi ngầm.

> **Trạng thái:** toàn bộ Phase 0-5 đã viết xong code, trừ ký số (cần chứng thư trả phí).
> Build sạch, typecheck sạch, 100 test pass, bản đóng gói chạy được.
> **Chưa chạy thử trên máy có thiết bị âm thanh thật**, nên phần bắt âm loopback vẫn ở mức
> "đúng theo API", chưa phải "đã nghe được tiếng" — đó là việc đầu tiên cần làm.

---

## Chạy thử

```bash
npm install
npm run dev          # chạy app ở chế độ phát triển
npm test             # 56 unit test cho phần logic thuần
npm run typecheck
npm run lint
npm run smoke        # bật app thật dưới Xvfb, kiểm tra khởi động + renderer
npm run build        # dựng bundle vào out/
npm run package:win  # đóng gói installer (cần chứng thư ký số để không bị SmartScreen chặn)
```

**whisper.cpp** (chỉ cần cho tính năng gỡ băng): tự build rồi đặt binary vào `resources/whisper/`.
Hướng dẫn ở [`docs/06-transcript.md`](docs/06-transcript.md#2-cài-whispercpp). Không có nó thì mọi
tính năng ghi vẫn chạy bình thường, chỉ nút gỡ băng bị vô hiệu hoá.

**FFmpeg.** Khi dev không cần làm gì: `ffmpeg-static` đi kèm devDependencies nên `npm run dev` chạy
được ngay. Khi **đóng gói** thì phải tự đặt binary vào `resources/ffmpeg/ffmpeg` (`ffmpeg.exe` trên
Windows) — bản static từ [ffmpeg.org](https://ffmpeg.org/download.html) — vì devDependency không đi
theo installer. Thứ tự tìm: `resources/ffmpeg/` → `node_modules/ffmpeg-static/` → `PATH`.

**Lưu ý về môi trường phát triển.** Toàn bộ phần chạm tới thiết bị âm thanh chỉ kiểm chứng được trên
Windows hoặc macOS thật. Checklist test thủ công nằm ở
[`docs/01-workflow.md`](docs/01-workflow.md#checklist-test-thủ-công-chạy-trước-mỗi-lần-lên-gate).

---

## Cấu trúc code

```
src/
├── shared/      logic thuần, không phụ thuộc Electron - đây là phần có unit test
│   ├── types.ts     kiểu dùng chung, bảng chất lượng
│   ├── machine.ts   máy trạng thái ghi (nguồn sự thật duy nhất)
│   ├── time.ts      tính offset giữa các luồng, thời lượng trừ pause, drift
│   ├── ffmpeg.ts    dựng tham số ffmpeg, đọc tiến độ
│   ├── transcript.ts đọc JSON whisper, trộn 2 track, xuất txt/srt/md
│   ├── summary.ts   tóm tắt trích xuất và dò việc cần làm, chạy offline
│   ├── trim.ts      cắt đầu/cuối, dời mốc và biên bản theo
│   ├── naming.ts    đặt tên file/thư mục, ước lượng dung lượng đĩa
│   └── ipc.ts       hợp đồng IPC giữa main và renderer
├── main/        Electron main - chạm hệ điều hành và đĩa cứng
│   ├── sources.ts   desktopCapturer + setDisplayMediaRequestHandler (audio: 'loopback')
│   ├── storage.ts   ghi chunk, session.json, khôi phục phiên crash
│   ├── exporter.ts  điều phối ffmpeg, tạo thư mục đích, ghi vào thư viện
│   ├── windows.ts   cửa sổ chính + overlay bắt buộc
│   └── ...          permissions, library, settings, tray, ipc
│   ├── whisper.ts   sidecar whisper.cpp, tải model theo yêu cầu
│   ├── transcribe.ts gỡ băng riêng từng track rồi trộn theo timestamp
│   ├── summarize.ts tóm tắt cục bộ, tuỳ chọn gọi API
│   └── secrets.ts   khoá API mã hoá bằng safeStorage, không lộ về renderer
├── preload/     contextBridge, danh sách kênh cố định
└── renderer/    Chromium - Web API media và giao diện
    ├── capture/engine.ts    lõi ghi: 3 MediaRecorder, VU meter, phát hiện im lặng
    ├── capture/livetap.ts   nhánh phụ đề: cắt đoạn theo khoảng lặng, hạ 16 kHz, không đụng bản ghi
    ├── state/useRecorder.ts nối máy trạng thái với engine và IPC
    └── ui/                  RecordView, LibraryView, SettingsView
```

## Trạng thái từng phase

| Phase | Trạng thái | Ghi chú |
|---|---|---|
| 0 — Spike | Code xong, **chưa qua GATE A** | GATE A cần một file MP4 nghe rõ cả hai bên trên máy thật |
| 1 — Lõi ghi 2 chiều | Code xong, **chưa qua GATE B** | Chunk 5s, khôi phục crash, phát hiện im lặng, loudnorm riêng track |
| 2 — Video + đồng bộ | Code xong, **chưa qua GATE C** | Offset đo bằng `performance.now()`, bù bằng `-itsoffset` |
| 3 — UI + thư viện | Code xong | Overlay không tắt được, tray, phím tắt, thư viện, cài đặt, giao diện Việt/Anh |
| 4 — Transcript | Code xong | whisper.cpp riêng từng track, tìm toàn văn, xuất txt/srt/md, tóm tắt |
| 4b — Phụ đề trực tiếp | Code xong, **chưa nghe thử trên máy thật** | Nghe ké 2 luồng song song với bản ghi, dịch trên máy (tiếng Anh) hoặc qua API |
| 5 — Phát hành | Code xong, trừ ký số | Đóng gói, tự cập nhật, crash dump cục bộ, CI release, tài liệu người dùng |

### Đã kiểm chứng được gì

| Kiểm chứng | Kết quả |
|---|---|
| `npm run lint`, `npm run typecheck` | Sạch |
| 96 unit test (máy trạng thái, offset, đặt tên, tham số ffmpeg/whisper, trộn transcript, tóm tắt) | Pass |
| 4 test tích hợp chạy FFmpeg thật, kiểm tra file đích | Pass — MP4 ra đúng 1 video + **2 audio track có nhãn**, tách WAV 16 kHz đúng từng track |
| `npm run smoke` — bật app thật dưới Xvfb | Pass — cửa sổ load, contextBridge hoạt động, renderer dựng đủ 3 tab, đổi Việt→Anh qua đúng ô chọn thì nhãn đổi thật, không lỗi console |
| `electron-builder` dựng bản đóng gói | Pass — sidecar FFmpeg nằm đúng `resources/ffmpeg/`, app đã đóng gói khởi động được |
| Rà bảo mật bề mặt IPC | 6 lỗ hổng đã sửa, xem [`docs/08-bao-mat.md`](docs/08-bao-mat.md) |

### Chưa kiểm chứng được — việc đầu tiên cần làm

Phần bắt âm loopback **chưa từng chạy trên máy có thiết bị âm thanh thật**. Môi trường dựng repo này
không có card âm thanh, không có Windows/macOS. Cụ thể những thứ còn là giả định:

- `audio: 'loopback'` có thực sự trả về tiếng đầu bên kia trên Windows và macOS 13+ hay không.
- Độ lệch thật giữa ba luồng sau 60 phút (NFR-02).
- CPU khi ghi 1080p30 (NFR-01).
- Luồng cấp quyền trên macOS và tình huống cần khởi động lại app.
- Toàn bộ tính năng gỡ băng: chưa có binary whisper.cpp trong môi trường này nên phần
  `runWhisper` chưa từng chạy thật (phần dựng tham số và diễn giải kết quả thì có test).

Và hai việc cần chứng thư trả phí, không làm được nếu không mua:

- **Ký số Windows** (R-02) — thiếu thì SmartScreen cảnh báo mỗi lần cài.
- **Ký số + notarize macOS** (R-03) — thiếu thì Gatekeeper chặn.

Workflow `.github/workflows/release.yml` đã dựng sẵn chỗ cắm chứng thư: thêm các secret
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
là electron-builder tự ký, không phải sửa code.

Chạy checklist ở [`docs/01-workflow.md`](docs/01-workflow.md#checklist-test-thủ-công-chạy-trước-mỗi-lần-lên-gate)
trước khi coi Phase 0-2 là qua gate.

## Tài liệu

| File | Nội dung |
|---|---|
| [`docs/00-tong-quan.md`](docs/00-tong-quan.md) | Phạm vi, yêu cầu chức năng/phi chức năng, những gì **không** làm |
| [`docs/01-workflow.md`](docs/01-workflow.md) | **Workflow chính** — 6 phase, mốc bàn giao, quy trình làm việc hằng ngày |
| [`docs/02-kien-truc.md`](docs/02-kien-truc.md) | Kiến trúc hệ thống, các module, luồng dữ liệu |
| [`docs/03-capture-2-chieu.md`](docs/03-capture-2-chieu.md) | Phần khó nhất: bắt âm 2 chiều trên Windows / macOS / Linux |
| [`docs/04-pipeline-va-luu-tru.md`](docs/04-pipeline-va-luu-tru.md) | Encode, đồng bộ A/V, cấu trúc file, transcript & tóm tắt |
| [`docs/05-backlog.md`](docs/05-backlog.md) | Backlog chi tiết theo task, có ước lượng |
| [`docs/06-transcript.md`](docs/06-transcript.md) | Gỡ băng, tìm kiếm toàn văn, tóm tắt, xử lý khoá API |
| [`docs/07-huong-dan-su-dung.md`](docs/07-huong-dan-su-dung.md) | **Hướng dẫn cho người dùng cuối** + xử lý sự cố |
| [`docs/08-bao-mat.md`](docs/08-bao-mat.md) | Mô hình đe doạ, các lỗ hổng đã sửa, rủi ro còn lại |

---

## Tóm tắt các quyết định kỹ thuật

| Hạng mục | Chọn | Lý do |
|---|---|---|
| Khung ứng dụng | **Electron 31+** | `setDisplayMediaRequestHandler({ audio: 'loopback' })` cho system audio trên **cả Windows và macOS** — đây là thứ tiết kiệm nhiều tháng công nhất |
| Ngôn ngữ | TypeScript | Chung một ngôn ngữ cho main process, renderer và script build |
| Bắt màn hình + system audio | Chromium `getDisplayMedia` qua Electron | Không cần driver ảo, không cần user cài BlackHole |
| Bắt microphone | `getUserMedia` | Tách riêng để giữ 2 track độc lập |
| Ghi thô | `MediaRecorder` → 2 file WebM (mic, system) + 1 file video | Không mix sớm, giữ nguyên tư liệu gốc |
| Hậu kỳ | **FFmpeg** (sidecar binary) | Mux, chuẩn hoá âm lượng, xuất MP4 |
| Định dạng đầu ra | MP4 (H.264 + AAC), **2 audio track riêng** | Track riêng cho phép tách người nói khi làm transcript |
| Transcript (tuỳ chọn) | `whisper.cpp` chạy máy local | Riêng tư, không đẩy nội dung cuộc gọi lên mạng |

Nguyên tắc xuyên suốt: **không trộn âm thanh khi ghi**. Mic và loopback được ghi thành hai đường độc lập,
chỉ trộn ở bước xuất file. Sai lầm này rất khó sửa về sau — một khi đã trộn thì không tách lại được nữa,
mà tách được người nói chính là thứ làm nên giá trị của bản ghi.

---

## Lưu ý pháp lý — đọc trước khi code

Ghi âm cuộc gọi có người khác tham gia là hoạt động chịu ràng buộc pháp luật, khác nhau theo từng nước
và từng bang. Nhiều nơi yêu cầu **tất cả các bên** phải đồng ý, không phải chỉ người bấm nút ghi.

Vì vậy các tính năng sau là **bắt buộc trong MVP**, không phải "để sau":

1. Chỉ báo đang ghi luôn hiển thị, không thể ẩn (overlay + icon khay hệ thống).
2. Nút chèn câu thông báo đồng ý vào đầu bản ghi ("Cuộc gọi này đang được ghi lại...").
3. Không có chế độ ghi ẩn, không có tuỳ chọn tắt chỉ báo.
4. Màn hình onboarding nêu rõ trách nhiệm xin phép thuộc về người dùng.

Chi tiết ở [`docs/00-tong-quan.md`](docs/00-tong-quan.md#5-ràng-buộc-pháp-lý-và-đạo-đức).
