# 04 — Pipeline xử lý & lưu trữ

## 1. Ghi thô (lúc đang gọi)

Trong lúc ghi, ưu tiên duy nhất là **không mất dữ liệu và không làm nặng máy**. Không encode lại,
không lọc, không trộn — mọi thứ đó để dành cho lúc kết thúc.

```
<userData>/sessions/<session-id>/
├── mic.webm         Opus 128 kbps, ghi nối tiếp theo chunk 5 giây
├── system.webm      Opus 128 kbps
├── video.webm       VP8/VP9 hoặc H.264 nếu có tăng tốc phần cứng
└── session.json     trạng thái, timestamp, mốc đánh dấu
```

`session.json` được cập nhật sau mỗi chunk, nên nếu app chết đột ngột thì vẫn khôi phục được:

```json
{
  "id": "2026-09-05T14-30-12-a3f9",
  "startedAt": "2026-09-05T14:30:12.482Z",
  "state": "recording",
  "streams": {
    "mic":    { "file": "mic.webm",    "offsetMs": 0,   "device": "Blue Yeti" },
    "system": { "file": "system.webm", "offsetMs": 42,  "device": "Loa Realtek" },
    "video":  { "file": "video.webm",  "offsetMs": 118, "source": "Zoom Meeting" }
  },
  "chunks":   { "mic": 361, "system": 361, "video": 361 },
  "bookmarks": [
    { "atMs": 754000,  "label": "Khách chốt số lượng" },
    { "atMs": 1502300, "label": "Cần gửi báo giá" }
  ]
}
```

Ngay khi khởi động, app quét thư mục `sessions/` — nếu gặp session nào còn ở trạng thái
`recording` thì đó là buổi ghi bị crash: đề nghị người dùng khôi phục.

## 2. Hậu kỳ (khi bấm Dừng)

```
mic.webm ─┐
          ├─► loudnorm riêng từng track ─┐
system.webm ┘                            ├─► mux MP4 2 audio track ─► recording.mp4
video.webm ──► copy (không encode lại) ──┘
```

Lệnh FFmpeg đầy đủ, có bù offset:

```bash
ffmpeg \
  -itsoffset 0.000 -i mic.webm \
  -itsoffset 0.042 -i system.webm \
  -itsoffset 0.118 -i video.webm \
  -filter_complex \
    "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a_me]; \
     [1:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a_them]" \
  -map 2:v -map "[a_me]" -map "[a_them]" \
  -c:v copy \
  -c:a aac -b:a 128k \
  -metadata:s:a:0 title="Toi" -metadata:s:a:0 language=vie \
  -metadata:s:a:1 title="Doi phuong" -metadata:s:a:1 language=vie \
  -movflags +faststart \
  recording.mp4
```

Ghi chú:

- `-c:v copy` — video không encode lại, nên bước hậu kỳ chỉ mất vài chục giây cho buổi ghi 1 giờ.
  Nếu cần H.264 mà nguồn là VP9 thì phải encode lại, và đó là lý do nên bật tăng tốc phần cứng
  ngay từ lúc ghi.
- `-movflags +faststart` — cho phép phát ngay khi mới tải một phần, cần thiết nếu sau này chia sẻ file.
- Đặt `title` cho từng track để trình phát hiển thị đúng tên, người dùng biết đang nghe ai.

Hiển thị tiến độ bằng cách phân tích dòng `out_time_ms=` từ `ffmpeg -progress pipe:1`.

## 3. Kết quả cuối

```
<Thư mục bản ghi>/2026-09-05_1430_Hop-khach-hang-ABC/
├── recording.mp4       H.264 + 2 audio track
├── metadata.json       thông tin buổi ghi, mốc đánh dấu
├── transcript.json     (Phase 4) có timestamp và nhãn người nói
└── thumbnail.jpg       khung hình đại diện, lấy ở giây thứ 10
```

Quy tắc đặt tên: `YYYY-MM-DD_HHmm_<tên-do-người-dùng-đặt>`. Nếu chưa đặt tên thì dùng tên
cửa sổ đã ghi (`Zoom Meeting`, `Microsoft Teams`) làm tên tạm.

Thư mục tạm `sessions/<id>/` chỉ được xoá **sau khi** xác nhận file MP4 mở được. Xoá sớm là
cách nhanh nhất để mất một buổi ghi quan trọng.

## 4. Ước lượng dung lượng

| Cấu hình | Dung lượng/giờ |
|---|---|
| Chỉ audio, 2 track Opus 128k | ~ 115 MB |
| 720p30 + 2 track audio | ~ 320 MB |
| 1080p30 + 2 track audio | ~ 500 MB |
| 1080p60 + 2 track audio | ~ 850 MB |

Cần cảnh báo khi ổ đĩa còn dưới 5 GB, và **chặn không cho bắt đầu ghi** khi còn dưới 1 GB —
tốt hơn là báo trước còn hơn để người dùng ghi 40 phút rồi mới hỏng.

## 5. Transcript (Phase 4)

Vì mic và system audio là hai track riêng, việc nhận diện người nói trở nên tầm thường:
chạy transcript riêng cho từng track thì nhãn người nói đã có sẵn, không cần thuật toán
diarization nào cả. Đây chính là phần thưởng cho quyết định không trộn âm ở Phase 1.

```bash
whisper-cli -m models/ggml-medium.bin -l vi -oj -f mic.wav    # → nhãn "Tôi"
whisper-cli -m models/ggml-medium.bin -l vi -oj -f system.wav # → nhãn "Đối phương"
```

Trộn hai kết quả theo timestamp:

```json
{
  "segments": [
    { "start": 0.0,  "end": 4.2,  "speaker": "Tôi",        "text": "Chào anh, em gọi về đơn hàng tuần trước." },
    { "start": 4.5,  "end": 9.8,  "speaker": "Đối phương", "text": "Vâng, anh đang cần thêm 20 bộ cảm biến." },
    { "start": 10.1, "end": 14.0, "speaker": "Tôi",        "text": "Dạ em ghi nhận, để em kiểm tra tồn kho." }
  ]
}
```

Xử lý trường hợp hai bên nói chồng lên nhau: giữ nguyên cả hai segment, sắp xếp theo `start`,
và đánh dấu `overlap: true` để giao diện hiển thị khác đi. Đừng cố ghép chúng thành một dòng.

## 6. Tóm tắt và trích đầu việc (tuỳ chọn)

Mặc định **tắt**. Khi người dùng bật, phải hỏi rõ:

- Chạy local (model nhỏ, chậm hơn, dữ liệu không rời khỏi máy) — mặc định khi có thể.
- Hoặc gửi transcript tới API bên ngoài — chỉ khi người dùng chủ động chọn, và phải hiện
  cảnh báo rõ rằng nội dung cuộc gọi sẽ rời khỏi máy.

Đây là nội dung cuộc gọi riêng tư của người khác nữa, không chỉ của người dùng. Mặc định
phải là phương án an toàn nhất, và mọi lựa chọn gửi dữ liệu ra ngoài phải là hành động
có ý thức, không phải một checkbox bật sẵn.
