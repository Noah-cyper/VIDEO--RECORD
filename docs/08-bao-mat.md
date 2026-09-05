# 08 — Rà soát bảo mật

Ứng dụng này chạm vào bốn thứ nhạy cảm: **microphone**, **nội dung màn hình**, **file cá nhân của
người dùng**, và một **khoá API**. Vì vậy mọi thứ đi từ renderer xuống main đều phải coi là không
đáng tin — kể cả khi renderer là code của chính mình, vì chỉ cần một lỗ hổng ở tầng đó là toàn bộ
đặc quyền của main process bị mượn.

## 1. Mô hình đe doạ

| Kẻ tấn công | Đi vào bằng đường nào | Lấy được gì nếu thành công |
|---|---|---|
| Nội dung độc hại lọt vào renderer | Tên cửa sổ, tên thiết bị, nội dung transcript, tên file | Toàn bộ quyền của main qua IPC |
| Chỉ mục thư viện bị sửa | `library.json` nằm trên đĩa, người dùng khác trên cùng máy sửa được | Xoá đệ quy thư mục bất kỳ |
| Link trong giao diện | `setWindowOpenHandler` | Hệ điều hành thi hành một scheme tuỳ ý |
| Người dùng khác trên cùng máy | File cấu hình, crash dump | Khoá API, mảnh nội dung cuộc gọi |

## 2. Những lỗ hổng đã tìm ra và sửa

### 2.1. Thoát thư mục qua session id — nghiêm trọng nhất

`sessionDir(id)` ghép thẳng id nhận từ renderer vào đường dẫn:

```ts
const sessionDir = (id: string) => join(sessionsRoot(), id)   // trước
```

`discardSession()` gọi `fs.rm(sessionDir(id), { recursive: true, force: true })`. Một id kiểu
`../../..` là xoá đệ quy ngoài phạm vi. `writeChunk()` cùng đường dẫn đó cho phép ghi đè file bất kỳ.

**Đã sửa:** id phải khớp đúng định dạng do chính app sinh ra (`SESSION_ID_RE`), kiểm tra ngay trong
`sessionDir()` — tức là ở tầng module chứ không chỉ ở tầng IPC, nên không có đường vòng nào bỏ qua
được. Có test cho một loạt biến thể thoát thư mục.

### 2.2. Xoá đệ quy theo đường dẫn lấy từ chỉ mục

`removeRecording()` xoá `target.folder` đọc từ `library.json`. File đó nằm trên đĩa và sửa được.

**Đã sửa:** chỉ xoá khi thư mục nằm trong thư mục bản ghi (`isInside`). Ngoài phạm vi thì gỡ khỏi
danh sách nhưng không đụng vào file.

### 2.3. `recordingsDir` nhận bừa từ renderer

`settings.set()` nhận `Partial<Settings>` bất kỳ. Đặt `recordingsDir` thành `/` sẽ biến scheme
`callrec-media://` thành quyền đọc file toàn ổ đĩa, và biến lệnh xoá bản ghi thành lệnh xoá phân vùng.

**Đã sửa:** kiểm tra đường dẫn tuyệt đối và từ chối gốc ổ đĩa.

### 2.4. `shell.openExternal` với scheme tuỳ ý

```ts
setWindowOpenHandler(({ url }) => { shell.openExternal(url); ... })   // trước
```

Mở bừa mọi scheme nghĩa là `file://`, `ms-msdt:` hay bất cứ handler nào của hệ điều hành cũng được
thi hành giúp.

**Đã sửa:** chỉ `http:` và `https:`. Thêm chặn `will-navigate` để renderer không tự điều hướng
sang trang khác.

### 2.5. Tham số đi vào tên file và URL

- `transcript.export(id, format)` — `format` ghép vào tên file, `../x` ghi ra ngoài. Nay chỉ nhận
  `txt` / `srt` / `md`.
- `whisper.removeModel(name)` / `transcript.start(id, model)` — tên model ghép vào đường dẫn file
  và URL tải. Nay phải nằm trong bảng `WHISPER_MODELS`.
- `library.extractAudio(id, track)` — chỉ nhận số nguyên 0-15.

### 2.6. Bật sandbox cho renderer

Preload chỉ dùng `ipcRenderer`, không cần Node, nên `sandbox: false` là đặc quyền thừa.
Nay `sandbox: true` cho cả cửa sổ chính lẫn overlay.

## 3. Những gì vốn đã đúng, giữ nguyên

- `contextIsolation: true`, `nodeIntegration: false`, không bao giờ bật `webSecurity: false`.
- Renderer không có API tổng quát: `contextBridge` chỉ lộ ra một danh sách kênh cố định.
- CSP trong `index.html` giới hạn `script-src 'self'`; media chỉ qua scheme riêng, không phải `file:`.
- Scheme `callrec-media://` chuẩn hoá đường dẫn rồi mới so tiền tố có dấu phân cách, nên
  `/data/bản-ghi-cũ` không bị coi là nằm trong `/data/bản-ghi`.
- Khoá API mã hoá bằng `safeStorage`, không nằm trong `settings.json`, không bao giờ gửi ngược về
  renderer — renderer chỉ biết `apiKeyConfigured: true/false`.
- Crash dump không rời khỏi máy.
- Không có chế độ ghi ẩn, và điều kiện hiện chỉ báo nằm ở tầng máy trạng thái chứ không ở tầng UI.

## 4. Rủi ro còn lại, chưa xử lý

| Rủi ro | Vì sao chưa làm |
|---|---|
| Model whisper tải về không có kiểm tra checksum | Chưa có bảng hash chính thức từ thượng nguồn; hiện chỉ dựa vào TLS |
| Bản cài chưa ký số | Cần chứng thư trả phí (R-02, R-03) |
| `settings.json` và `library.json` để chữ thường | Không chứa bí mật, nhưng lộ tên cuộc gọi cho người dùng khác trên cùng máy |
| Chưa có rate limit cho lời gọi API tóm tắt | Chi phí do người dùng tự chịu và tự bấm từng lần |

## 5. Nguyên tắc cho lần sửa sau

1. **Mọi giá trị từ renderer đi vào đường dẫn file đều phải kiểm tra**, và kiểm tra ở tầng module
   chứ không chỉ ở handler IPC — handler mới thêm sẽ quên, module thì không.
2. **Không mở rộng `contextBridge` bằng API tổng quát.** Thêm kênh cụ thể, đừng thêm `invoke(channel, ...)`.
3. **Thao tác xoá đệ quy phải đi kèm một lần kiểm tra containment**, không có ngoại lệ.
4. Bất cứ tính năng nào gửi dữ liệu ra ngoài đều mặc định tắt và phải có hành động có ý thức của
   người dùng mới bật được.
