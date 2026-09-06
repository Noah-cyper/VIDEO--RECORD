# 06 — Gỡ băng, tìm kiếm và tóm tắt (Phase 4)

## 1. Vì sao nhãn người nói ở đây luôn đúng

Hầu hết công cụ gỡ băng phải chạy *speaker diarization*: nghe một luồng âm thanh trộn lẫn rồi đoán
xem chỗ nào là người A, chỗ nào là người B. Đoán thì có lúc sai, và sai nhiều nhất đúng vào lúc
hai người nói chồng lên nhau — tức là những đoạn quan trọng nhất.

CallRec không gặp bài toán đó. Vì mic và system audio được ghi thành **hai track riêng ngay từ đầu**
(quyết định ở Phase 1), ta chỉ cần chạy whisper riêng cho từng track:

```
recording.mp4
├── audio track 0  ──►  whisper  ──►  mọi câu đều là "Tôi"
└── audio track 1  ──►  whisper  ──►  mọi câu đều là "Đối phương"
                                              │
                                              ▼
                                    trộn theo timestamp
```

Nhãn người nói đến từ **chỗ ngồi của track trong file**, không từ thuật toán. Nó đúng tuyệt đối.

Đây chính là khoản lãi của quyết định "không trộn âm khi ghi" — một quyết định tưởng như chỉ là
chi tiết kỹ thuật ở Phase 1 nhưng lại quyết định chất lượng của toàn bộ Phase 4.

> **Cạm bẫy:** track nào là ai phụ thuộc vào việc lúc ghi có mic hay không. Nếu mic hỏng thì track 0
> là đối phương chứ không phải mình. Vì vậy `Recording.audioTracks` lưu lại thứ tự thật; không có
> nó thì transcript sẽ gán nhãn ngược cho cả cuộc gọi mà không ai phát hiện ra.

## 2. Cài whisper.cpp

Ứng dụng gọi binary `whisper-cli` như một sidecar, giống cách gọi FFmpeg.

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

Chép binary vừa build vào `resources/whisper/`:

| Hệ điều hành | File | Đích |
|---|---|---|
| macOS / Linux | `build/bin/whisper-cli` | `resources/whisper/whisper-cli` |
| Windows | `build\bin\Release\whisper-cli.exe` | `resources\whisper\whisper-cli.exe` |

Thứ tự tìm binary: `resources/whisper/` → `PATH`. Không tìm thấy thì nút gỡ băng bị vô hiệu hoá
và giao diện nói rõ lý do, chứ không im lặng hỏng.

Tăng tốc phần cứng đáng làm nếu ghi nhiều: `-DGGML_METAL=1` trên macOS,
`-DGGML_CUDA=1` trên Windows/Linux có card NVIDIA.

## 3. Model

Model tải tự động lần đầu dùng, lưu ở `<userData>/models/` và dùng lại cho những lần sau.
Tải qua file `.part` rồi mới đổi tên — tải dở dang không để lại model hỏng khiến lần sau lỗi khó hiểu.

| Model | Dung lượng | Nhận xét cho tiếng Việt |
|---|---|---|
| `tiny` | 75 MB | Quá kém, chỉ dùng để thử |
| `base` | 142 MB | Đủ để tra cứu đại ý, không đủ làm biên bản |
| `small` | 466 MB | **Mặc định.** Cân bằng tốt nhất cho máy phổ thông |
| `medium` | 1,5 GB | Chính xác nhất, cần khoảng 8 GB RAM |

Không đưa `large` vào: 3 GB và chậm gấp nhiều lần, trong khi mức cải thiện trên hội thoại
điện thoại (băng thông hẹp, nhiều nhiễu) không tương xứng.

## 4. Luồng xử lý

```
recording.mp4
   │  ffmpeg -map 0:a:N -ac 1 -ar 16000 -c:a pcm_s16le     (whisper chỉ nhận WAV 16 kHz mono)
   ▼
.track-0.wav, .track-1.wav
   │  whisper-cli -m model -l vi -oj
   ▼
JSON mỗi track  ──►  parseWhisperJson  ──►  mergeTranscripts  ──►  transcript.json
   │
   └─ WAV tạm bị xoá ngay sau đó: một giờ ghi là ~115 MB mỗi track, không có lý do giữ lại
```

`transcript.json` nằm cạnh bản ghi:

```json
{
  "language": "vi",
  "model": "small",
  "createdAt": "2026-09-05T15:10:22.000Z",
  "segments": [
    { "startMs": 0,     "endMs": 4200,  "speaker": "me",   "text": "Chào anh, em gọi về đơn hàng tuần trước." },
    { "startMs": 4500,  "endMs": 9800,  "speaker": "them", "text": "Ừ, anh cần thêm hai mươi bộ." },
    { "startMs": 10000, "endMs": 12000, "speaker": "me",   "text": "Dạ em kiểm tra tồn kho.", "overlap": true }
  ]
}
```

Khi hai bên nói đè lên nhau, cả hai câu được giữ nguyên và đánh dấu `overlap` để giao diện hiển thị
khác đi. **Không gộp** — gộp hai câu chồng nhau là bịa ra một câu chưa ai từng nói.

## 5. Tìm kiếm

Ô tìm kiếm ở màn hình Thư viện tìm cả tên bản ghi lẫn **nội dung đã gỡ băng của mọi bản ghi**.
Cả truy vấn lẫn nội dung đều được bỏ dấu trước khi so, nên gõ `bao gia` vẫn ra `báo giá`.

Nhấn vào một kết quả sẽ mở bản ghi và tua thẳng tới đúng giây đó.

## 6. Tóm tắt

Hai đường, và mặc định là đường không rời khỏi máy.

### Đường cục bộ (mặc định, luôn dùng được)

Tóm tắt theo hướng **trích xuất**: chọn ra những câu đã có sẵn trong cuộc gọi, không sinh câu mới.

- Điểm chính: chấm điểm từng câu theo mật độ từ khoá (đã bỏ stopword tiếng Việt), chia cho
  căn bậc hai độ dài để câu dài không tự động thắng, nhân hệ số cho ba câu đầu và ba câu cuối.
- Việc cần làm: dò các cụm báo hiệu cam kết (`sẽ gửi`, `cần kiểm tra`, `chốt lại`…) và các cụm
  chỉ thời hạn (`trước ngày`, `hạn chót`, `trong tuần`…). Một câu khớp cả hai loại được đánh dấu
  "có hạn" và làm nổi bật hơn.

Kém mượt hơn tóm tắt bằng LLM, nhưng chạy offline, không tốn tiền, và **không bao giờ bịa ra thứ
chưa ai nói**. Với biên bản cuộc gọi thì đó là đánh đổi đúng.

### Đường qua API (phải tự bật)

Chỉ chạy khi **cả hai** điều kiện thoả:

1. Người dùng bật công tắc "Cho phép gửi transcript tới dịch vụ tóm tắt bên ngoài" trong Cài đặt.
2. Người dùng đã nhập khoá API.

Lý do siết chặt: nội dung cuộc gọi có cả lời của người khác, không chỉ của người dùng. Việc nó
rời khỏi máy phải là một hành động có ý thức, không phải hệ quả phụ của một tính năng bật sẵn.

Khi đường này không chạy được (chưa bật, chưa có khoá, hoặc bị từ chối), ứng dụng **quay về tóm tắt
cục bộ** và hiện thông báo nói rõ lý do — chứ không trả về một ô trống.

Cấu hình lời gọi: model `claude-opus-5`, adaptive thinking, `effort: medium` (tóm tắt không phải
bài toán suy luận nặng), có bật server-side fallback để một lần từ chối chính sách không làm hỏng
cả thao tác. Dùng streaming vì transcript một giờ gọi có thể rất dài.

### Khoá API được cất ở đâu

Không nằm trong `settings.json`. Khoá được mã hoá bằng `safeStorage` của Electron (dùng keychain
của hệ điều hành) và ghi vào `<userData>/secrets.bin`. Máy nào không có kho khoá an toàn thì
ứng dụng **từ chối lưu** — thà mất tính năng còn hơn ghi khoá ra đĩa dưới dạng chữ thường.

Khoá không bao giờ được gửi ngược qua IPC về phần giao diện. Renderer chỉ biết `apiKeyConfigured:
true/false`.

## 7. Dịch biên bản

Sau khi gỡ băng, có thể dịch toàn bộ biên bản sang ngôn ngữ khác: danh sách có sẵn Việt, Anh, Nhật,
Hàn, Trung, Pháp, Đức, Tây Ban Nha, Thái, Nga — và một ô nhập tự do cho bất kỳ ngôn ngữ nào khác.

Bản dịch **giữ nguyên mốc thời gian và nhãn người nói**, nên nhấn vào một câu vẫn tua đúng chỗ.
Nó được lưu thành `transcript.<mã>.json` cạnh bản ghi, không đè lên bản gốc; giao diện có nút
chuyển qua lại giữa bản gốc và từng bản dịch.

### Vì sao dịch theo mẻ

Gửi cả buổi gọi một lượt thì mô hình dễ gộp dòng hoặc bỏ dòng, mà bản dịch lệch một dòng là **mọi
mốc thời gian sau đó sai hết**. Nên transcript được cắt thành mẻ ~4000 ký tự, mỗi mẻ yêu cầu trả về
đúng một mảng JSON có số phần tử bằng số dòng gửi đi. Số phần tử không khớp thì **từ chối ghép** và
báo lỗi rõ mẻ nào — thà không có bản dịch còn hơn có một bản dịch lệch mốc mà không ai phát hiện.

### Điều kiện

Dịch dùng cùng một cánh cửa với tóm tắt qua API: phải **bật công tắc** "cho phép gửi transcript tới
dịch vụ ngoài" **và** đã nhập khoá API. Dịch gửi toàn bộ lời thoại ra ngoài — còn nhiều hơn tóm tắt —
nên không có lý do gì nới lỏng hơn. Chưa đủ điều kiện thì giao diện nói rõ cần bật gì.

## 8. Xuất

| Định dạng | Dùng khi |
|---|---|
| `.txt` | Dán nhanh vào email hoặc chat |
| `.srt` | Làm phụ đề cho file video |
| `.md` | Biên bản có định dạng, đánh dấu rõ chỗ nói chồng |

File được ghi ngay cạnh bản ghi trong cùng thư mục.

## 9. Phụ đề trực tiếp (dịch theo thời gian thực)

Gỡ băng ở các mục trên chạy **sau** khi ghi xong. Phụ đề trực tiếp chạy **trong lúc** đang ghi:
nghe ké hai luồng, gỡ băng từng đoạn ngắn rồi dịch ngay, hiện ở màn hình Ghi và trên ô chỉ báo.

### Đường đi của một câu

```
mic / loopback ─▶ LiveTap (renderer)   cắt đoạn theo khoảng lặng, hạ 16 kHz, PCM 16 bit
                        │
                        ▼  live:audio (send, không đợi trả lời)
                  hàng đợi ở main      tối đa 3 đoạn, đầy thì bỏ đoạn cũ nhất
                        │
                        ▼  một tiến trình whisper.cpp tại một thời điểm
                   nguyên văn ──▶ live:caption  (hiện ngay)
                        │
                        ▼  (chỉ khi chọn ngôn ngữ ngoài tiếng Anh)
                   API dịch ───▶ live:caption cùng id  (thay tại chỗ)
```

`LiveTap` là nhánh **song song**, không nằm trên đường ghi: nó nghe cùng `MediaStreamTrack` qua
một `ScriptProcessorNode` nối vào `GainNode` với gain 0. Phụ đề hỏng hay bị tắt không ảnh hưởng
gì tới file bản ghi, và mic với loopback vẫn là hai đường riêng — nhãn `Tôi` / `Đối phương` của
phụ đề lấy từ track, đúng như biên bản gỡ băng sau này.

Gain 0 là bắt buộc, không phải cho gọn: `ScriptProcessorNode` chỉ chạy khi có đường tới
`destination`, mà nối thẳng ra loa thì micro nghe lại tiếng loa thành vòng hú — và tiếng hú đó
đi vào luồng loopback, tức là vào chính bản ghi.

### Cắt đoạn ở đâu

Cắt theo khoảng lặng (im 700 ms là dứt câu), không theo đồng hồ cố định: cắt giữa câu thì whisper
mất vế sau và đoán bừa, còn chờ đủ 8 giây mới cắt thì phụ đề luôn trễ 8 giây kể cả khi người ta
chỉ nói một từ. Nói liên tục không nghỉ thì vẫn bị cắt cưỡng bức ở 8 giây. Giữ lại 3 khung trước
lúc phát hiện có tiếng, nếu không âm đầu của từ đầu tiên bị cụt.

### Ba đường dịch

| Chọn | Chạy ở đâu | Điều kiện |
|---|---|---|
| Không dịch | — | Chỉ hiện nguyên văn |
| Tiếng Anh | Ngay trên máy, cờ `-tr` của whisper.cpp | Không cần mạng, không cần khoá API |
| Ngôn ngữ khác | API | Phải bật gửi ra dịch vụ ngoài **và** có khoá API, giống hệt tóm tắt |

whisper.cpp chỉ dịch được đúng một hướng là sang tiếng Anh. Muốn tiếng Nhật, tiếng Trung… thì
buộc phải qua API, và khi đó **lời thoại rời khỏi máy này** — mặc định tắt (NFR-06), giao diện
nói thẳng điều đó ở ngay dòng chọn ngôn ngữ.

Ở chế độ tiếng Anh, whisper trả về thẳng bản tiếng Anh nên không có nguyên văn để đối chiếu:
chạy hai lượt để có cả hai sẽ tốn gấp đôi CPU, không đáng. Ở chế độ API thì có cả hai — nguyên
văn hiện ngay, bản dịch thay vào chỗ đó vài giây sau.

### Giới hạn phải nói trước

- **Trễ 2-6 giây** tuỳ máy và model. Đây là bản nghe nhanh để bám cuộc gọi, không phải biên bản.
  Biên bản chính xác vẫn là bản gỡ băng chạy sau khi ghi xong, với model lớn hơn.
- **Model riêng, chọn nhẹ**: mặc định `tiny`. `small` trở lên sẽ tụt lại trên máy yếu vì nó tranh
  CPU với chính việc ghi hình (NFR-01).
- **Máy không theo kịp thì bỏ đoạn cũ nhất** và báo ra giao diện. Bản ghi không mất gì — chỉ phụ
  đề bị thiếu, vì phụ đề trễ hai phút thì vô dụng.
- Không có whisper.cpp thì phụ đề không bật được, nhưng **việc ghi vẫn chạy bình thường**.
