# 03 — Bắt âm thanh hai chiều

Đây là phần khó nhất và cũng là phần quyết định app có giá trị hay không. Ghi micro thì dễ, ai cũng
làm được. Ghi **giọng của người ở đầu dây bên kia** mới là vấn đề, vì âm thanh đó chỉ tồn tại
trên đường ra loa, không đi qua bất kỳ thiết bị đầu vào nào.

Kỹ thuật cần dùng gọi là **loopback** (hoặc *system audio capture*, *what-U-hear*): lấy lại luồng
âm thanh mà hệ điều hành đang gửi tới loa.

---

## 1. Đường chính: Electron `loopback` (khuyến nghị)

Từ Electron 31, `setDisplayMediaRequestHandler` hỗ trợ `audio: 'loopback'` trên **cả Windows và
macOS**. Bên dưới, Chromium dùng WASAPI loopback trên Windows và ScreenCaptureKit trên macOS.
Người dùng không phải cài driver ảo nào.

### Main process

```ts
import { session, desktopCapturer } from 'electron'

session.defaultSession.setDisplayMediaRequestHandler(
  async (request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
    callback({
      video: sources[0],      // thực tế: nguồn người dùng đã chọn trong UI
      audio: 'loopback',      // ← system audio, đây là mấu chốt
    })
  },
  { useSystemPicker: false }, // tự làm bộ chọn nguồn để kiểm soát giao diện
)
```

### Renderer

```ts
// Luồng 1 — đối phương (system audio) + hình
const system = await navigator.mediaDevices.getDisplayMedia({
  video: { frameRate: 30 },
  audio: true,
})

// Luồng 2 — mình (microphone), lấy riêng để giữ track độc lập
const mic = await navigator.mediaDevices.getUserMedia({
  audio: {
    deviceId: selectedMicId,
    echoCancellation: false,   // QUAN TRỌNG — xem mục 4
    noiseSuppression: false,
    autoGainControl: false,
  },
})

// Tách track ra ghi riêng
const systemAudio = new MediaStream(system.getAudioTracks())
const videoOnly   = new MediaStream(system.getVideoTracks())
const micAudio    = new MediaStream(mic.getAudioTracks())
```

### Ba MediaRecorder độc lập

```ts
const t0 = performance.now()   // mốc thời gian tham chiếu chung

function record(stream: MediaStream, name: string) {
  const rec = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128_000,
  })
  const startedAt = performance.now() - t0   // offset để bù khi mux
  rec.ondataavailable = (e) => window.callrec.storage.writeChunk(name, e.data)
  rec.start(5000)                            // chunk 5 giây, chống mất dữ liệu
  return { rec, startedAt }
}
```

`startedAt` của từng luồng phải được lưu vào `session.json`. FFmpeg sẽ dùng nó với `-itsoffset`
để bù lệch. Bỏ qua bước này là nguồn gốc của hầu hết các lỗi "tiếng lệch hình".

---

## 2. Đường dự phòng theo hệ điều hành

Dùng khi đường chính không chạy (macOS 12 trở xuống, hoặc Electron loopback lỗi trên máy cụ thể).

### Windows — WASAPI loopback

Windows hỗ trợ loopback sẵn từ Vista, không cần driver ảo. Nếu phải làm native addon:

```
IAudioClient::Initialize(
    AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK,   // ← cờ này lấy được luồng ra loa
    ...)
```

Thư viện gợi ý: crate `wasapi` hoặc `cpal` (Rust, dùng qua napi-rs), hoặc `naudiodon` (Node).

Kiểm tra nhanh bằng FFmpeg (cần cài `screen-capture-recorder` để có `virtual-audio-capturer`):

```bash
ffmpeg -f gdigrab -framerate 30 -i desktop \
       -f dshow -i audio="Microphone (Realtek Audio)" \
       -f dshow -i audio="virtual-audio-capturer" \
       -map 0:v -map 1:a -map 2:a \
       -c:v libx264 -preset veryfast -crf 23 \
       -c:a aac -b:a 128k \
       -metadata:s:a:0 title="Toi" \
       -metadata:s:a:1 title="Doi-phuong" \
       output.mp4
```

### macOS — ScreenCaptureKit (13+)

`SCStream` với `capturesAudio = true` trả về system audio. Đây chính là thứ Electron dùng bên dưới.
Cần quyền **Screen Recording** trong System Settings → Privacy & Security, và app phải được ký số.

macOS 14.4+ còn có Core Audio Taps API (`AudioHardwareCreateProcessTap`) cho phép bắt âm của
**từng ứng dụng cụ thể** — tức là chỉ lấy tiếng Zoom, bỏ qua tiếng Spotify. Đáng cân nhắc cho v2.

### macOS 12 trở xuống — thiết bị ảo

Không có API chính thức. Phải hướng dẫn người dùng:

1. Cài [BlackHole 2ch](https://existential.audio/blackhole/).
2. Mở Audio MIDI Setup → tạo **Multi-Output Device** = Loa thật + BlackHole
   (để vừa nghe được vừa ghi được).
3. Tạo **Aggregate Device** = Microphone + BlackHole.
4. Trong app chọn Aggregate Device, kênh 1–2 là mic, kênh 3–4 là system.

Đây là trải nghiệm tệ. Phải cân nhắc nghiêm túc việc chỉ hỗ trợ macOS 13+ và hiện thông báo
rõ ràng cho máy cũ hơn, thay vì bắt người dùng tự cấu hình 4 bước.

### Linux — PipeWire / PulseAudio

Mọi thiết bị đầu ra đều có sẵn một *monitor source* tương ứng:

```bash
pactl list sources short | grep monitor
# ví dụ: alsa_output.pci-0000_00_1f.3.analog-stereo.monitor

ffmpeg -f x11grab -framerate 30 -i :0.0 \
       -f pulse -i default \
       -f pulse -i alsa_output.pci-0000_00_1f.3.analog-stereo.monitor \
       -map 0:v -map 1:a -map 2:a ... output.mp4
```

Trên Wayland dùng portal `xdg-desktop-portal` thay cho `x11grab`.

---

## 3. Bảng tổng hợp

| OS | Cách chính | Cần cài thêm | Độ khó |
|---|---|---|---|
| Windows 10/11 | Electron loopback (WASAPI) | Không | Dễ |
| macOS 13+ | Electron loopback (ScreenCaptureKit) | Không, chỉ cần cấp quyền | Trung bình |
| macOS 12- | BlackHole + Aggregate Device | Có, người dùng tự cài | Khó |
| Linux (PipeWire) | Monitor source | Không | Trung bình |

---

## 4. Những cái bẫy phải biết trước

### 4.1. Echo cancellation ăn mất tiếng đối phương

Đây là lỗi hay gặp nhất và khó đoán nhất.

Nếu bật `echoCancellation: true` khi lấy micro, trình duyệt sẽ **chủ động xoá khỏi luồng mic
những gì đang phát ra loa** — mà đó chính là giọng đối phương. Kết quả: track mic sạch,
track system nghe được, nhưng nếu người dùng dùng loa ngoài thì phần tiếng đối phương lọt vào
mic bị triệt mất, tạo ra hiện tượng âm thanh "hụt" từng đoạn.

Vì đã tách hai track riêng nên **luôn tắt** `echoCancellation`, `noiseSuppression` và
`autoGainControl` ở tầng ghi. Muốn khử tiếng vọng thì làm ở bước hậu kỳ, khi vẫn còn đủ tư liệu gốc.

### 4.2. Trôi đồng hồ (clock drift)

Card âm thanh và card màn hình chạy trên hai bộ dao động khác nhau. Sau 60 phút, chênh lệch
50–200 ms là chuyện bình thường. Cách xử lý:

- Ghi timestamp thật (`performance.now()`) của mỗi chunk vào `session.json`.
- Ở bước mux dùng `-itsoffset` bù cho từng luồng.
- Với buổi ghi dài (> 2 giờ) thì `asetrate` chỉnh nhẹ tốc độ audio để khớp lại.
- Luôn đo bằng clapperboard (vỗ tay) ở đầu **và** cuối buổi test, không đo mỗi đầu.

### 4.3. Người dùng đổi thiết bị đầu ra giữa chừng

Cắm tai nghe vào lúc đang ghi → luồng loopback đang gắn với loa cũ sẽ im tiếng, và người dùng
không hề biết cho tới khi mở file ra nghe.

Xử lý: lắng nghe `navigator.mediaDevices.ondevicechange`, đồng thời theo dõi mức âm qua
`AnalyserNode`. Im lặng tuyệt đối quá 30 giây trên một track → cảnh báo ngay trên overlay.

### 4.4. Chênh lệch âm lượng hai bên

Mic thường to hơn hoặc nhỏ hơn hẳn so với system audio. Chuẩn hoá **riêng từng track** ở bước
hậu kỳ, đừng chuẩn hoá sau khi đã trộn:

```bash
ffmpeg -i mic.webm -i system.webm -i video.webm \
  -filter_complex "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a0]; \
                   [1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a1]" \
  -map 2:v -map "[a0]" -map "[a1]" \
  -c:v copy -c:a aac -b:a 128k \
  -metadata:s:a:0 title="Toi" \
  -metadata:s:a:1 title="Doi-phuong" \
  -movflags +faststart \
  recording.mp4
```

### 4.5. Quyền hệ thống trên macOS

Quyền Screen Recording chỉ có hiệu lực sau khi **khởi động lại ứng dụng**. Nếu không xử lý,
người dùng sẽ cấp quyền xong, bấm ghi, và nhận về màn hình đen. Phải phát hiện trạng thái này
và chủ động đề nghị khởi động lại app.

### 4.6. Bluetooth làm tụt chất lượng

Khi micro Bluetooth được kích hoạt, macOS/Windows chuyển tai nghe sang profile HFP/HSP —
chất lượng âm ra loa tụt xuống mức điện thoại (8–16 kHz), và loopback ghi lại đúng cái tiếng tệ đó.

Không có cách khắc phục triệt để. Nên phát hiện thiết bị Bluetooth và gợi ý dùng micro rời
hoặc micro máy tính cho các buổi ghi quan trọng.
