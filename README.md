# CallRec — Ghi âm & ghi hình cuộc gọi trên máy tính

Ứng dụng desktop ghi lại cuộc gọi (Zoom, Teams, Google Meet, Zalo, Discord, hoặc điện thoại kết nối qua PC)
với **âm thanh đầy đủ của cả hai bên**:

- **Giọng của mình** — lấy từ microphone.
- **Giọng đầu bên kia** — lấy từ *loopback / system audio* (âm thanh đang phát ra loa), không cần bên kia cài gì.
- **Hình ảnh** — ghi màn hình (cửa sổ cuộc gọi hoặc toàn màn hình) + webcam tuỳ chọn.

> Trạng thái repo: **giai đoạn thiết kế**. Ở đây mới có workflow và tài liệu kiến trúc, chưa có code.
> Bắt đầu đọc từ [`docs/01-workflow.md`](docs/01-workflow.md).

---

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
