# 05 — Backlog

Ước lượng theo **điểm** (1 điểm ≈ nửa ngày làm việc). Ưu tiên: P0 bắt buộc cho MVP,
P1 quan trọng, P2 để sau.

## Phase 0 — Spike (GATE A)

| ID | Task | Điểm | Ưu tiên |
|---|---|---|---|
| S-01 | Dựng project Electron + TypeScript + electron-vite | 2 | P0 |
| S-02 | Spike loopback trên Windows, ghi ra file nghe được | 2 | P0 |
| S-03 | Spike loopback trên macOS 13+, xử lý luồng cấp quyền | 3 | P0 |
| S-04 | Ghi đồng thời mic + system, đo lệch bằng clapperboard | 2 | P0 |
| S-05 | Nhúng FFmpeg sidecar, mux 2 track, chạy sau khi đóng gói | 3 | P0 |
| S-06 | Viết kết luận spike vào `docs/spikes/` | 1 | P0 |

## Phase 1 — Lõi ghi âm (GATE B)

| ID | Task | Điểm | Ưu tiên |
|---|---|---|---|
| C-01 | Module `capture/` — liệt kê và chọn thiết bị | 3 | P0 |
| C-02 | Máy trạng thái ghi + unit test | 3 | P0 |
| C-03 | Ghi theo chunk 5s, ghi thẳng xuống đĩa | 3 | P0 |
| C-04 | `session.json` cập nhật liên tục + khôi phục sau crash | 3 | P0 |
| C-05 | VU meter 2 luồng qua `AnalyserNode` | 2 | P0 |
| C-06 | Phát hiện luồng im lặng > 30s → cảnh báo | 2 | P0 |
| C-07 | Xử lý rút/cắm thiết bị giữa chừng | 3 | P0 |
| C-08 | Hậu kỳ FFmpeg: loudnorm riêng track + mux + bù offset | 3 | P0 |
| C-09 | Tạm dừng / tiếp tục không làm lệch đồng bộ | 3 | P0 |
| C-10 | Kiểm tra dung lượng ổ trước khi ghi | 1 | P0 |
| C-11 | Test ghi 60 phút, đo drift, đo rò bộ nhớ | 2 | P0 |

## Phase 2 — Video (GATE C)

| ID | Task | Điểm | Ưu tiên |
|---|---|---|---|
| V-01 | Bộ chọn nguồn hình có thumbnail xem trước | 3 | P0 |
| V-02 | Ghi video + phát hiện tăng tốc phần cứng | 3 | P0 |
| V-03 | Đồng hồ tham chiếu chung cho cả 3 luồng | 3 | P0 |
| V-04 | Cấu hình chất lượng 720p/1080p30/1080p60 | 2 | P0 |
| V-05 | Xử lý cửa sổ đang ghi bị đóng | 2 | P0 |
| V-06 | Sinh thumbnail đại diện cho bản ghi | 1 | P1 |
| V-07 | Đo và ghi nhận số liệu NFR-01, NFR-02, NFR-04 | 2 | P0 |

## Phase 3 — Giao diện

| ID | Task | Điểm | Ưu tiên |
|---|---|---|---|
| U-01 | Màn hình chính: chọn nguồn, nút ghi, đồng hồ, VU meter | 4 | P0 |
| U-02 | Overlay đang ghi, always-on-top, không tắt được | 3 | P0 |
| U-03 | Icon khay hệ thống đổi trạng thái | 2 | P0 |
| U-04 | Phím tắt toàn cục (ghi/dừng/tạm dừng/đánh dấu) | 2 | P1 |
| U-05 | Thư viện bản ghi: danh sách, tìm kiếm, đổi tên, xoá | 4 | P0 |
| U-06 | Trình phát trong app, bật/tắt từng audio track | 3 | P1 |
| U-07 | Onboarding + xin quyền + giải thích pháp lý | 3 | P0 |
| U-08 | Nút phát câu thông báo đồng ý | 2 | P0 |
| U-09 | Màn hình cài đặt | 3 | P0 |
| U-10 | Đa ngôn ngữ Việt/Anh | 2 | P1 |
| U-11 | Đánh dấu mốc trong lúc ghi | 2 | P1 |

## Phase 4 — Transcript

| ID | Task | Điểm | Ưu tiên |
|---|---|---|---|
| T-01 | Nhúng whisper.cpp + tải model theo yêu cầu | 4 | P1 |
| T-02 | Transcript riêng từng track, gán nhãn người nói | 3 | P1 |
| T-03 | Trộn 2 transcript theo timestamp, đánh dấu overlap | 2 | P1 |
| T-04 | Trình xem transcript, click câu để tua | 3 | P1 |
| T-05 | Tìm kiếm toàn văn xuyên nhiều bản ghi | 3 | P2 |
| T-06 | Xuất txt / srt / md | 2 | P2 |
| T-07 | Tóm tắt + trích đầu việc (mặc định tắt) | 4 | P2 |

## Phase 5 — Phát hành (GATE D)

| ID | Task | Điểm | Ưu tiên |
|---|---|---|---|
| R-01 | electron-builder: NSIS + DMG | 3 | P0 |
| R-02 | Ký số Windows | 2 | P0 |
| R-03 | Ký số + notarize macOS, khai entitlements | 3 | P0 |
| R-04 | Tự cập nhật qua electron-updater | 3 | P1 |
| R-05 | Báo lỗi crash (opt-in, không kèm nội dung bản ghi) | 2 | P2 |
| R-06 | Tài liệu người dùng + xử lý sự cố | 3 | P0 |
| R-07 | CI GitHub Actions: lint, test, build matrix, release | 3 | P0 |
| R-08 | Beta với 5–10 người dùng thật | 4 | P0 |

## Phase 2+ — Đã ghi nhận, chưa lên lịch

| ID | Task | Ghi chú |
|---|---|---|
| X-01 | Webcam picture-in-picture | FR-09 |
| X-02 | Tự phát hiện cuộc gọi đang diễn ra | FR-10, cần theo dõi tiến trình |
| X-03 | Bắt âm theo từng ứng dụng (macOS 14.4+ Core Audio Taps) | Chỉ ghi tiếng Zoom, bỏ tiếng nhạc |
| X-04 | Cắt đầu/cuối bản ghi | Không làm trình dựng phim đầy đủ |
| X-05 | Xuất riêng file audio MP3/M4A | FR-14 |
| X-06 | Hỗ trợ Linux | Ưu tiên thấp |

---

## Tổng hợp

| Phase | Điểm | Ước lượng |
|---|---|---|
| Phase 0 | 13 | ~1 tuần |
| Phase 1 | 28 | ~2 tuần |
| Phase 2 | 16 | ~1,5 tuần |
| Phase 3 | 30 | ~2,5 tuần |
| Phase 4 | 21 | ~2 tuần |
| Phase 5 | 23 | ~2 tuần |
| **Tổng** | **131** | **~11 tuần** |

Con số này giả định một người làm toàn thời gian và không gặp sự cố lớn ở Phase 0.
Nếu spike macOS thất bại và phải đi đường BlackHole, cộng thêm 1–2 tuần cho Phase 0 và Phase 3.
