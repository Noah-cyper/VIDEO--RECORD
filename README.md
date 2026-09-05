# CallRec — Ghi âm & ghi hình cuộc gọi trên máy tính

Ứng dụng desktop ghi lại cuộc gọi (Zoom, Teams, Google Meet, Zalo, Discord, hoặc điện thoại kết nối qua PC)
với **âm thanh đầy đủ của cả hai bên**:

- **Giọng của mình** — lấy từ microphone.
- **Giọng đầu bên kia** — lấy từ *loopback / system audio* (âm thanh đang phát ra loa), không cần bên kia cài gì.
- **Hình ảnh** — ghi màn hình (cửa sổ cuộc gọi hoặc toàn màn hình) + webcam tuỳ chọn.

> **Trạng thái:** Phase 0-3 đã viết xong code — build sạch, typecheck sạch, 56 unit test cho phần
> logic thuần đều pass. **Chưa chạy thử trên máy có thiết bị âm thanh thật**, nên phần bắt âm
> loopback vẫn ở mức "đúng theo API", chưa phải "đã nghe được tiếng". Việc đầu tiên cần làm là chạy
> checklist test thủ công. Phase 4 (transcript) và Phase 5 (ký số, phát hành) chưa làm.

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
│   ├── naming.ts    đặt tên file/thư mục, ước lượng dung lượng đĩa
│   └── ipc.ts       hợp đồng IPC giữa main và renderer
├── main/        Electron main - chạm hệ điều hành và đĩa cứng
│   ├── sources.ts   desktopCapturer + setDisplayMediaRequestHandler (audio: 'loopback')
│   ├── storage.ts   ghi chunk, session.json, khôi phục phiên crash
│   ├── exporter.ts  điều phối ffmpeg, tạo thư mục đích, ghi vào thư viện
│   ├── windows.ts   cửa sổ chính + overlay bắt buộc
│   └── ...          permissions, library, settings, tray, ipc
├── preload/     contextBridge, danh sách kênh cố định
└── renderer/    Chromium - Web API media và giao diện
    ├── capture/engine.ts    lõi ghi: 3 MediaRecorder, VU meter, phát hiện im lặng
    ├── state/useRecorder.ts nối máy trạng thái với engine và IPC
    └── ui/                  RecordView, LibraryView, SettingsView
```

## Trạng thái từng phase

| Phase | Trạng thái | Ghi chú |
|---|---|---|
| 0 — Spike | Code xong, **chưa qua GATE A** | GATE A cần một file MP4 nghe rõ cả hai bên trên máy thật |
| 1 — Lõi ghi 2 chiều | Code xong, **chưa qua GATE B** | Chunk 5s, khôi phục crash, phát hiện im lặng, loudnorm riêng track |
| 2 — Video + đồng bộ | Code xong, **chưa qua GATE C** | Offset đo bằng `performance.now()`, bù bằng `-itsoffset` |
| 3 — UI + thư viện | Code xong | Overlay không tắt được, tray, phím tắt, thư viện, cài đặt |
| 4 — Transcript | Chưa làm | whisper.cpp, xem `docs/05-backlog.md` |
| 5 — Phát hành | Một phần | Có cấu hình electron-builder + CI; chưa ký số, chưa notarize |

### Đã kiểm chứng được gì

| Kiểm chứng | Kết quả |
|---|---|
| `npm run lint`, `npm run typecheck` | Sạch |
| 56 unit test (máy trạng thái, offset, đặt tên, dựng tham số ffmpeg) | Pass |
| 3 test tích hợp chạy FFmpeg thật, kiểm tra file đích | Pass — MP4 ra đúng 1 video + **2 audio track có nhãn** |
| `npm run smoke` — bật app thật dưới Xvfb | Pass — cửa sổ load, contextBridge hoạt động, renderer dựng đủ 3 tab, không lỗi console |

### Chưa kiểm chứng được — việc đầu tiên cần làm

Phần bắt âm loopback **chưa từng chạy trên máy có thiết bị âm thanh thật**. Môi trường dựng repo này
không có card âm thanh, không có Windows/macOS. Cụ thể những thứ còn là giả định:

- `audio: 'loopback'` có thực sự trả về tiếng đầu bên kia trên Windows và macOS 13+ hay không.
- Độ lệch thật giữa ba luồng sau 60 phút (NFR-02).
- CPU khi ghi 1080p30 (NFR-01).
- Luồng cấp quyền trên macOS và tình huống cần khởi động lại app.

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
