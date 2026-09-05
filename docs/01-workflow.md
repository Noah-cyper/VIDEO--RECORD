# 01 — Workflow triển khai

Tài liệu này là **kế hoạch làm việc chính**. Mỗi phase có: mục tiêu, việc cần làm, tiêu chí hoàn thành
(Definition of Done) và rủi ro. Không sang phase sau khi phase trước chưa đạt DoD.

Tổng thời lượng ước tính: **9–12 tuần** cho một người làm toàn thời gian, tới bản phát hành đầu tiên.

```
Phase 0        Phase 1          Phase 2         Phase 3        Phase 4         Phase 5
Spike     →    Âm 2 chiều  →    Video +    →    UI + quản  →   Hậu kỳ:   →    Đóng gói
kỹ thuật       (lõi giá trị)    đồng bộ         lý bản ghi     transcript     & phát hành
1 tuần         2 tuần           2 tuần          2 tuần         2 tuần         1-2 tuần
   │              │                │               │              │              │
   └─ GATE A ─────┴─ GATE B ───────┴─ GATE C ──────┴──────────────┴─ GATE D ─────┘
```

---

## Phase 0 — Spike kỹ thuật (1 tuần)

**Mục tiêu:** chứng minh bằng code rằng lấy được âm thanh cả hai chiều, trước khi đầu tư vào UI.
Đây là phase quan trọng nhất. Nếu phase này thất bại, toàn bộ kiến trúc phải đổi.

### Việc cần làm

- [ ] Dựng project Electron + TypeScript tối thiểu (`electron-vite` hoặc `electron-forge`).
- [ ] Spike 1 — **Windows**: dùng `session.setDisplayMediaRequestHandler` với `audio: 'loopback'`,
      lấy `MediaStream` chứa system audio. Ghi ra file, mở nghe.
- [ ] Spike 2 — **macOS**: cùng API, kiểm tra trên macOS 13+. Xác nhận đúng prompt quyền
      Screen Recording và âm ra được tiếng.
- [ ] Spike 3 — ghi **đồng thời** mic + loopback bằng hai `MediaRecorder` độc lập, đo độ lệch
      giữa hai file bằng cách vỗ tay một cái ở đầu buổi ghi.
- [ ] Spike 4 — nhúng FFmpeg dạng sidecar binary, mux hai file WebM thành MP4 2 track, chạy được
      sau khi đóng gói app (không chỉ chạy trong dev).
- [ ] Ghi lại kết quả từng spike vào `docs/spikes/` — kể cả spike thất bại, nhất là spike thất bại.

### Definition of Done — **GATE A**

- Có một file MP4 chứa 2 audio track, nghe rõ cả tiếng mình lẫn tiếng đầu bên kia.
- Chạy được trên **cả** Windows và macOS.
- Độ lệch giữa hai track đo được < 100 ms.
- Đã trả lời dứt khoát: có cần native addon không? (Kỳ vọng: **không**.)

### Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Loopback macOS không hoạt động như tài liệu Electron mô tả | Dự phòng: hướng dẫn cài BlackHole + Aggregate Device. Ước lượng +1 tuần |
| Hai `MediaRecorder` trôi lệch nhau theo thời gian | Chuyển sang một `AudioContext` chung, ghi 2 kênh vào 1 file stereo, tách khi hậu kỳ |
| FFmpeg sidecar bị chặn bởi code-signing macOS | Ký riêng binary FFmpeg, thêm entitlement phù hợp |

---

## Phase 1 — Lõi ghi âm 2 chiều (2 tuần)

**Mục tiêu:** biến spike thành module chạy được tin cậy, có xử lý lỗi. Chưa cần UI đẹp.

### Việc cần làm

- [ ] Module `capture/` — liệt kê thiết bị, chọn nguồn, mở/đóng stream, dọn tài nguyên.
- [ ] Máy trạng thái ghi: `idle → arming → recording → paused → finalizing → done | error`.
      Mọi chuyển trạng thái đi qua một chỗ duy nhất, không rải rác trong UI.
- [ ] Ghi theo **chunk** (`MediaRecorder` `timeslice` 5 giây), ghi thẳng xuống đĩa từng chunk
      → đáp ứng NFR-03 (app crash vẫn còn dữ liệu).
- [ ] Phát hiện luồng chết: nếu mức âm của một track im lặng tuyệt đối quá 30 giây → cảnh báo
      người dùng, đừng để họ ghi xong 1 tiếng mới biết mất tiếng một bên.
- [ ] VU meter cho cả hai luồng qua `AnalyserNode`.
- [ ] Xử lý thiết bị bị rút giữa chừng (rút tai nghe USB) — không được crash, phải chuyển thiết bị.
- [ ] Bước hậu kỳ: FFmpeg mux 2 track + `loudnorm` chuẩn hoá âm lượng từng track riêng.
- [ ] Test tự động cho máy trạng thái + test thủ công theo checklist ghi trong `docs/`.

### Definition of Done — **GATE B**

- Ghi 60 phút liên tục, hai track vẫn đồng bộ, không rò bộ nhớ.
- Kill tiến trình giữa chừng → phần đã ghi vẫn phục hồi và mở được.
- Rút tai nghe giữa chừng → app không crash, có thông báo rõ ràng.
- Âm lượng hai bên sau chuẩn hoá tương đương nhau khi nghe.

---

## Phase 2 — Video và đồng bộ A/V (2 tuần)

**Mục tiêu:** thêm hình ảnh mà không phá đồng bộ âm thanh đã có.

### Việc cần làm

- [ ] Bộ chọn nguồn hình: toàn màn hình / một màn hình / một cửa sổ, có xem trước dạng thumbnail.
- [ ] Ghi video qua cùng `MediaStream` của `getDisplayMedia`, encode VP8/VP9 hoặc H.264 nếu có
      tăng tốc phần cứng.
- [ ] Thống nhất mốc thời gian: dùng **một** đồng hồ tham chiếu chung cho cả video và audio,
      ghi lại timestamp bắt đầu của từng luồng, bù lệch ở bước mux bằng `-itsoffset`.
- [ ] Cấu hình chất lượng: 720p30 (tiết kiệm) / 1080p30 (mặc định) / 1080p60 (chỉ khi chia sẻ demo).
- [ ] Xử lý cửa sổ bị đóng giữa chừng khi đang ghi một cửa sổ cụ thể.
- [ ] Đo lại NFR-02 sau 60 phút, có số liệu cụ thể chứ không "thấy ổn".

### Definition of Done — **GATE C**

- Bản ghi 1080p30 dài 60 phút, lệch A/V < 100 ms đo bằng clapperboard đầu và cuối.
- CPU dưới ngưỡng NFR-01.
- Dung lượng đúng ước lượng NFR-04 (±20%).

---

## Phase 3 — Giao diện và quản lý bản ghi (2 tuần)

**Mục tiêu:** người khác dùng được mà không cần hỏi.

### Việc cần làm

- [ ] Màn hình chính: chọn nguồn → nút ghi lớn → đồng hồ + 2 VU meter.
- [ ] Overlay nổi khi đang ghi: thời lượng, nút tạm dừng/dừng, chấm đỏ. **Không tắt được** (FR-08).
- [ ] Icon khay hệ thống đổi trạng thái khi đang ghi.
- [ ] Phím tắt toàn cục: bắt đầu/dừng, tạm dừng, đánh dấu mốc (FR-13).
- [ ] Thư viện bản ghi: danh sách, tìm kiếm, đổi tên, xoá, mở thư mục chứa file.
- [ ] Trình phát trong app: nghe lại, tua tới mốc đã đánh dấu, bật/tắt từng track audio.
- [ ] Onboarding: xin quyền (micro, ghi màn hình), giải thích trách nhiệm pháp lý.
- [ ] Nút phát câu thông báo đồng ý (FR-08).
- [ ] Cài đặt: thư mục lưu, chất lượng mặc định, thiết bị mặc định, ngôn ngữ (Việt/Anh).

### Definition of Done

- Một người chưa từng thấy app tự ghi được cuộc gọi đầu tiên trong dưới 2 phút, không cần hướng dẫn.
- Toàn bộ chuỗi thao tác dùng được bằng bàn phím.
- Không có luồng nào dẫn tới trạng thái đang ghi mà không có chỉ báo.

---

## Phase 4 — Hậu kỳ: transcript & tóm tắt (2 tuần)

**Mục tiêu:** biến bản ghi thành thứ tra cứu được, không phải file nằm im trong thư mục.

### Việc cần làm

- [ ] Nhúng `whisper.cpp` dạng sidecar, tải model theo yêu cầu (`base` / `medium`).
- [ ] Chạy transcript **riêng cho từng track** → nhãn người nói có sẵn, không cần diarization.
- [ ] Trộn hai transcript theo timestamp thành một hội thoại có thứ tự.
- [ ] Trình xem transcript: click vào câu → nhảy tới đúng giây đó trong bản ghi.
- [ ] Tìm kiếm toàn văn xuyên nhiều bản ghi.
- [ ] Xuất: `.txt`, `.srt`, `.md`.
- [ ] Tóm tắt + trích đầu việc — mặc định **tắt**, phải bật thủ công, và nói rõ nếu tính năng
      gửi dữ liệu ra dịch vụ ngoài (NFR-06).

### Definition of Done

- Transcript tiếng Việt đạt độ chính xác dùng được với model `medium` trên máy có 8 GB RAM.
- Nhãn người nói đúng 100% (vì tách theo track, không phải đoán).
- Transcript 60 phút chạy xong trong dưới 10 phút trên CPU đời 2020.

---

## Phase 5 — Đóng gói & phát hành (1–2 tuần)

### Việc cần làm

- [ ] `electron-builder`: cài đặt NSIS cho Windows, DMG cho macOS.
- [ ] Ký số Windows (EV certificate) — nếu không có thì SmartScreen sẽ chặn.
- [ ] Ký số + notarize macOS, khai đủ entitlement cho micro và ghi màn hình.
- [ ] Tự cập nhật qua `electron-updater`.
- [ ] Báo lỗi crash — **phải hỏi ý kiến người dùng trước**, mặc định tắt, và không bao giờ
      đính kèm nội dung bản ghi.
- [ ] Tài liệu người dùng: cài đặt, cấp quyền, xử lý sự cố "không nghe thấy đầu bên kia".
- [ ] Đóng băng backlog, làm bản beta với 5–10 người dùng thật.

### Definition of Done — **GATE D**

- Cài từ file installer trên máy sạch, chạy được ngay, không cần thao tác thủ công thêm.
- Không cảnh báo bảo mật khi cài trên Windows và macOS.
- Beta tester ghi được cuộc gọi thật mà không cần hỗ trợ.

---

## Quy trình làm việc hằng ngày

### Nhánh Git

```
main                     ← luôn ở trạng thái phát hành được
└── develop              ← tích hợp
    ├── feat/capture-loopback-windows
    ├── feat/ui-recording-overlay
    ├── fix/audio-drift-long-session
    └── spike/macos-screencapturekit
```

Tiền tố nhánh: `feat/`, `fix/`, `spike/`, `chore/`, `docs/`.

### Commit

Theo Conventional Commits, viết mô tả bằng tiếng Việt cũng được:

```
feat(capture): bắt system audio qua loopback trên Windows
fix(sync): bù lệch 40ms giữa track mic và track loopback
docs(workflow): bổ sung gate cho phase 2
```

### Vòng đời một task

1. Lấy task từ `docs/05-backlog.md`, tạo nhánh từ `develop`.
2. Viết test trước cho phần logic thuần (máy trạng thái, tính toán offset, đặt tên file).
   Phần chạm tới thiết bị âm thanh thì test thủ công theo checklist — đừng cố mock cả tầng audio.
3. Code, chạy `npm run lint && npm run typecheck && npm test` trước khi push.
4. Mở PR vào `develop`, tự đọc lại diff của mình một lượt trước khi nhờ review.
5. Merge khi CI xanh.

### CI (GitHub Actions)

| Job | Chạy khi | Nội dung |
|---|---|---|
| `lint-and-test` | mọi PR | eslint, tsc, unit test |
| `build-matrix` | PR vào `develop` | build thử trên `windows-latest` và `macos-latest` |
| `release` | tag `v*` | build, ký, tạo GitHub Release |

### Checklist test thủ công (chạy trước mỗi lần lên gate)

Phần dùng thiết bị âm thanh thật không tự động hoá được, nên phải có checklist cố định:

- [ ] Ghi thử qua Zoom — nghe rõ cả hai bên.
- [ ] Ghi thử qua Google Meet trên trình duyệt.
- [ ] Ghi thử qua Teams.
- [ ] Cắm tai nghe Bluetooth → ghi → vẫn ra tiếng cả hai bên.
- [ ] Rút tai nghe giữa chừng → không crash.
- [ ] Tạm dừng 30 giây rồi tiếp tục → đồng bộ không lệch.
- [ ] Ghi 60 phút → kiểm tra lệch A/V ở phút cuối.
- [ ] Đổi thiết bị đầu ra giữa chừng → có thông báo.

---

## Thứ tự ưu tiên khi thiếu thời gian

Nếu phải cắt, cắt theo thứ tự này từ dưới lên:

1. **Không cắt** — âm 2 chiều tách track (Phase 1). Đây là toàn bộ lý do app tồn tại.
2. **Không cắt** — chỉ báo đang ghi và thông báo đồng ý (Phase 3). Ràng buộc pháp lý.
3. Ghi video (Phase 2) — có thể ra bản chỉ ghi âm trước, vẫn dùng được.
4. Transcript (Phase 4) — hoãn sang bản 1.1.
5. Tóm tắt, webcam PiP, tự phát hiện cuộc gọi — hoãn thoải mái.
