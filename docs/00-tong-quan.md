# 00 — Tổng quan & phạm vi

## 1. Bài toán

Người dùng họp/gọi trên máy tính qua nhiều nền tảng khác nhau (Zoom, Teams, Meet, Zalo PC, Discord,
Slack Huddle, hoặc điện thoại cắm qua PC). Công cụ ghi sẵn có của từng nền tảng có ba vấn đề:

1. Không phải nền tảng nào cũng cho ghi, hoặc chỉ cho khi trả phí / khi là host.
2. Bản ghi nằm trên cloud của nhà cung cấp, không nằm trong tay người dùng.
3. Mỗi nền tảng một định dạng, một nơi lưu, không tra cứu tập trung được.

Cần một ứng dụng **độc lập với nền tảng gọi**: cứ có âm thanh phát ra loa và có micro là ghi được.

## 2. Người dùng mục tiêu

| Nhóm | Nhu cầu chính |
|---|---|
| Kinh doanh / chăm sóc khách hàng | Ghi lại cam kết với khách, trích lại yêu cầu kỹ thuật |
| Kỹ sư / tư vấn kỹ thuật | Ghi lại buổi khảo sát, thông số khách đọc qua điện thoại |
| Quản lý | Xem lại họp đã bỏ lỡ, lấy biên bản |
| Cá nhân | Lưu phỏng vấn, buổi học trực tuyến |

## 3. Yêu cầu chức năng (FR)

### Bắt buộc cho MVP

- **FR-01** — Ghi đồng thời microphone và system audio (loopback) thành **hai luồng riêng biệt**.
- **FR-02** — Ghi video: toàn màn hình, một màn hình cụ thể, hoặc một cửa sổ ứng dụng.
- **FR-03** — Bắt đầu / tạm dừng / tiếp tục / dừng ghi.
- **FR-04** — Chọn thiết bị micro và thiết bị đầu ra để lấy loopback trước khi ghi.
- **FR-05** — Đồng hồ đếm thời lượng + đồ thị mức âm (VU meter) cho **cả hai** luồng, để người dùng thấy
  ngay là cả hai bên đều đang vào tiếng.
- **FR-06** — Lưu bản ghi ra file MP4 có 2 audio track, kèm file metadata JSON.
- **FR-07** — Danh sách bản ghi trong app: tìm kiếm theo tên, ngày, thời lượng; mở thư mục chứa file.
- **FR-08** — Chỉ báo "đang ghi" luôn hiện + câu thông báo đồng ý phát đầu bản ghi.

### Giai đoạn 2

- **FR-09** — Ghi webcam song song, ghép dạng picture-in-picture.
- **FR-10** — Tự động phát hiện cuộc gọi bắt đầu (theo tiến trình Zoom/Teams đang chạy) và nhắc ghi.
- **FR-11** — Transcript chạy local bằng `whisper.cpp`, có nhãn người nói dựa trên track (`Tôi` / `Đối phương`).
- **FR-12** — Tóm tắt cuộc gọi và trích các đầu việc.
- **FR-13** — Đánh dấu mốc thời gian (bookmark) ngay trong lúc ghi bằng phím tắt.
- **FR-14** — Xuất riêng file audio (MP3/M4A) cho bản ghi chỉ cần tiếng.

## 4. Yêu cầu phi chức năng (NFR)

| Mã | Yêu cầu | Ngưỡng chấp nhận |
|---|---|---|
| NFR-01 | CPU khi đang ghi | < 15% trên máy 4 nhân đời 2020 |
| NFR-02 | Lệch đồng bộ tiếng/hình | < 100 ms sau 60 phút ghi liên tục |
| NFR-03 | Mất dữ liệu khi app crash | Giữ được phần đã ghi, tối đa mất 10 giây cuối |
| NFR-04 | Dung lượng | ~ 500 MB/giờ ở 1080p30 + 2 track audio |
| NFR-05 | Ghi liên tục | Ổn định 4 giờ không rò bộ nhớ, không lệch tiếng |
| NFR-06 | Riêng tư | Mặc định **không** gửi bất kỳ dữ liệu nào ra ngoài máy |
| NFR-07 | Thời gian khởi động | < 3 giây tới lúc sẵn sàng bấm ghi |

## 5. Ràng buộc pháp lý và đạo đức

Đây là ràng buộc thiết kế, không phải phần "chính sách" viết cho có.

- Luật ghi âm cuộc gọi khác nhau theo vùng. Có nơi chỉ cần **một bên** đồng ý, có nơi cần **tất cả các bên**.
  Ứng dụng không thể biết người dùng đang ở đâu và gọi cho ai, nên thiết kế phải nghiêng về phía an toàn.
- **Bắt buộc**: chỉ báo đang ghi hiển thị thường trực, không tắt được.
- **Bắt buộc**: nút phát câu thông báo "Cuộc gọi này đang được ghi lại" vào đầu bản ghi.
- **Không làm**: chế độ ghi ẩn, hẹn giờ ghi lén, tắt chỉ báo, hay bất cứ thứ gì giúp giấu việc đang ghi.
- Onboarding phải nói rõ: trách nhiệm xin phép các bên còn lại thuộc về người dùng.

Nếu về sau có ai đề xuất tính năng "ghi im lặng", đó là dấu hiệu cần dừng lại và bàn lại, không phải
một task bình thường trong backlog.

## 6. Ngoài phạm vi (Non-goals)

- Không làm ứng dụng gọi. Đây là công cụ ghi, không phải softphone.
- Không can thiệp vào tiến trình của Zoom/Teams (không inject, không hook API nội bộ). Chỉ dùng
  API ghi màn hình và ghi âm chính thức của hệ điều hành.
- Không đồng bộ cloud ở phiên bản đầu. Bản ghi nằm trên máy người dùng.
- Không hỗ trợ di động (iOS/Android) — hệ điều hành di động không cho phép loopback audio.
- Không làm trình chỉnh sửa video. Chỉ cắt đầu/cuối là đủ.

## 7. Ma trận hệ điều hành

| OS | Phiên bản tối thiểu | System audio | Ghi chú |
|---|---|---|---|
| Windows | 10 (1903) | WASAPI loopback — sẵn có | Đường dễ nhất, làm trước |
| macOS | 13 Ventura | ScreenCaptureKit qua Electron | Cần quyền Screen Recording |
| macOS | 12 trở xuống | Cần thiết bị ảo (BlackHole) | Hỗ trợ giới hạn, có hướng dẫn cài |
| Linux | PipeWire / PulseAudio | Monitor source | Ưu tiên thấp, làm sau |

Thứ tự triển khai: **Windows → macOS → Linux**.
