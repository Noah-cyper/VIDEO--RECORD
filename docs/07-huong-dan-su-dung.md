# 07 — Hướng dẫn sử dụng

## 1. Trước khi ghi lần đầu

### Cấp quyền

**Windows.** Không cần cấp quyền gì. Nếu Windows Defender SmartScreen cảnh báo lúc cài, đó là do
bản cài chưa được ký số — xem mục 6.

**macOS.** Vào *System Settings → Privacy & Security* và bật cho CallRec:

- **Screen Recording** — bắt buộc. Không có quyền này thì **không lấy được tiếng đầu bên kia**,
  vì trên macOS âm thanh hệ thống đi kèm quyền ghi màn hình.
- **Microphone** — bắt buộc để ghi giọng của bạn.

> Sau khi bật Screen Recording phải **khởi động lại CallRec**. macOS chỉ nạp quyền này lúc app
> khởi động. Không khởi động lại thì bấm ghi sẽ ra màn hình đen và không có tiếng đối phương.
> Ứng dụng sẽ tự phát hiện và nhắc bạn.

### Kiểm tra một lượt

Trước cuộc gọi quan trọng, hãy thử một lần:

1. Mở một video YouTube bất kỳ cho có tiếng ra loa.
2. Mở CallRec, chọn nguồn, bấm **Bắt đầu ghi**.
3. Nhìn hai thanh mức âm: **cả hai** phải nhảy — "Tôi" khi bạn nói, "Đối phương" khi video phát.
4. Dừng, mở lại file, nghe thử.

Nếu chỉ một thanh nhảy thì xem mục 5.

## 2. Ghi một cuộc gọi

1. Chọn nguồn hình: toàn màn hình, một màn hình, hoặc cửa sổ ứng dụng gọi.
   Chọn đúng cửa sổ cuộc gọi thì file nhẹ hơn và không lộ những gì khác trên màn hình.
2. Chọn micro và chất lượng.
3. Bấm **Bắt đầu ghi**.
4. Một ô nhỏ nổi lên góc màn hình báo đang ghi. **Ô này không tắt được** — đó là chủ đích:
   ai nhìn màn hình bạn cũng phải thấy được là đang có ghi hình.

Trong lúc ghi:

| Thao tác | Phím tắt |
|---|---|
| Bắt đầu / dừng | `Ctrl/Cmd + Shift + R` |
| Tạm dừng / tiếp tục | `Ctrl/Cmd + Shift + P` |
| Đánh dấu mốc | `Ctrl/Cmd + Shift + M` |

Đánh dấu mốc rất đáng dùng: nghe thấy điều quan trọng thì bấm một cái, sau này nhảy thẳng
tới đó thay vì tua mò.

## 3. Xin phép người khác

Nhiều nơi quy định **tất cả các bên** phải đồng ý mới được ghi, không phải chỉ người bấm nút.
CallRec không biết bạn ở đâu và đang gọi cho ai, nên phần này thuộc trách nhiệm của bạn.

Cách đơn giản nhất: bật tuỳ chọn **"Phát câu thông báo khi bắt đầu ghi"** trong Cài đặt.
Ứng dụng sẽ đọc câu *"Xin lưu ý, cuộc gọi này đang được ghi lại"* ra loa — và vì nó ra loa
nên nó nằm luôn trong bản ghi, làm bằng chứng là bạn đã thông báo.

CallRec cố ý **không có** chế độ ghi ẩn, không cho tắt chỉ báo, và sẽ không bao giờ có.

## 4. Sau khi ghi

Bản ghi nằm ở thư mục bạn chọn trong Cài đặt, mỗi buổi một thư mục riêng:

```
2026-09-05_1430_Hop-khach-hang/
├── recording.mp4      hình + 2 track tiếng riêng (Tôi / Đối phương)
├── metadata.json      thông tin buổi ghi và các mốc đã đánh dấu
├── thumbnail.jpg
└── transcript.json    nếu đã gỡ băng
```

Vì tiếng hai bên nằm ở **hai track riêng**, trình phát (VLC, QuickTime) cho bạn bật tắt từng bên.
Muốn nghe lại chỉ lời khách hàng thì tắt track của mình đi.

### Cắt bỏ khoảng thừa đầu/cuối

Trong Thư viện, mở bản ghi rồi dùng phần **Cắt đầu/cuối**. Nút ⏱ lấy luôn vị trí đang phát,
nên cách nhanh nhất là tua tới chỗ muốn cắt rồi bấm nó.

Bản gốc **không bị đụng tới** — kết quả lưu thành một bản ghi mới. Mốc đánh dấu và biên bản gỡ băng
(nếu đã có) được dời theo, phần nằm ngoài khoảng cắt thì bỏ đi. Riêng bản tóm tắt cũ không mang sang
vì nó nói về cả những đoạn vừa bị cắt bỏ.

Cắt gần như tức thì kể cả với bản ghi một giờ, đổi lại điểm cắt bám vào keyframe gần nhất nên có thể
lệch vài giây. Với việc cắt bỏ khoảng lặng đầu/cuối thì mức đó không ảnh hưởng gì.

### Gỡ băng

Trong Thư viện, chọn bản ghi → **Gỡ băng bản ghi này**. Lần đầu sẽ mất thêm thời gian tải model.

Vì mỗi track được nhận dạng riêng nên nhãn "Tôi" / "Đối phương" **luôn đúng**, kể cả những đoạn
hai bên nói chồng lên nhau. Sau đó bạn có thể:

- Nhấn vào bất kỳ câu nào để tua tới đúng giây đó.
- Tìm một câu trong **tất cả** bản ghi bằng ô tìm kiếm — gõ không dấu vẫn ra.
- Xuất ra `.txt`, `.srt` hoặc `.md`.
- Bấm **Tóm tắt trên máy** để lấy các ý chính và danh sách việc cần làm.

### Dịch sang ngôn ngữ khác

Gỡ băng xong, phần **Dịch biên bản** cho chọn ngôn ngữ đích (hoặc gõ tên ngôn ngữ bất kỳ). Bản dịch
giữ nguyên mốc thời gian nên nhấn vào câu nào vẫn tua đúng chỗ đó, và bản gốc không bị mất — có nút
chuyển qua lại.

Chức năng này gửi lời thoại ra dịch vụ bên ngoài nên phải tự bật trong Cài đặt và nhập khoá API,
giống như tóm tắt qua API.

## 5. Xử lý sự cố

### Không nghe thấy tiếng đầu bên kia

Đây là sự cố hay gặp nhất. Đi lần lượt:

1. **macOS: đã cấp quyền Screen Recording và đã khởi động lại app chưa?** Chiếm phần lớn các ca.
2. **Thiết bị phát có đúng không?** Nếu bạn nghe cuộc gọi bằng tai nghe nhưng lúc bắt đầu ghi
   máy đang đặt loa là thiết bị mặc định, luồng ghi sẽ bám vào loa và không có tiếng.
   Đặt đúng thiết bị *trước* khi bấm ghi.
3. **Có cắm/rút tai nghe giữa chừng không?** Việc đó làm đứt luồng đang ghi. CallRec sẽ cảnh báo
   sau 30 giây im lặng, nhưng phần đã mất thì không lấy lại được.
4. **Chọn nguồn hình là một cửa sổ cụ thể?** Thử chọn *toàn màn hình* — một số ứng dụng gọi
   phát âm thanh không gắn với cửa sổ mà bạn đã chọn.

### Chỉ có tiếng đối phương, không có tiếng mình

Micro bị ứng dụng gọi chiếm độc quyền, hoặc chọn sai thiết bị đầu vào. Chọn lại micro trong
CallRec, và kiểm tra micro không bị tắt tiếng ở phần cứng.

### Tiếng lệch hình

Thường xảy ra với buổi ghi rất dài. Báo lại kèm độ dài buổi ghi và độ lệch đo được ở cuối file —
đó là dữ liệu cần để chỉnh.

### Chất lượng tiếng tệ khi dùng tai nghe Bluetooth

Khi micro Bluetooth được kích hoạt, hệ điều hành chuyển tai nghe sang chế độ đàm thoại và
**mọi thứ** phát ra tai nghe tụt xuống chất lượng điện thoại. Bản ghi ghi lại đúng cái tiếng tệ đó.

Không có cách khắc phục triệt để. Với cuộc gọi quan trọng, dùng micro rời hoặc micro máy tính,
và nghe bằng tai nghe có dây.

### Ứng dụng bị đóng đột ngột giữa lúc đang ghi

Mở lại CallRec — nó sẽ phát hiện phiên chưa hoàn tất và mời bạn **Xuất file**. Phần đã ghi vẫn còn,
mất nhiều nhất là vài giây cuối.

### Đổi thư mục lưu không được

Bấm **Chọn…** để mở hộp thoại. Nếu hộp thoại không mở được vì lý do nào đó, gõ thẳng đường dẫn vào ô
rồi bấm **Áp dụng** — ô đó sửa tay được.

Ứng dụng sẽ thử tạo và ghi thử vào thư mục ngay lúc đó. Nếu không được (thư mục chỉ đọc, ổ mạng đã
ngắt, thiếu quyền) thì báo lỗi kèm nguyên nhân thật của hệ điều hành.

Chọn thẳng gốc ổ đĩa (`D:\`) thì ứng dụng **tự đưa vào `D:\CallRec`**. Nó không đổ file thẳng ra
gốc ổ: vừa bẩn, vừa khiến phạm vi thao tác xoá của ứng dụng rộng bằng cả phân vùng.

### Nút "Cấp quyền" không làm gì

Trên Windows và Linux thì đúng là không làm gì, vì hai hệ này không có cửa xin quyền riêng cho micro
và ghi màn hình. Từ bản 0.1.1 nút đó không hiện nữa, thay bằng một dòng nói rõ. Chỉ macOS mới cần
cấp quyền thật.

### Không đủ dung lượng

CallRec cảnh báo khi ổ còn dưới 5 GB và **không cho bắt đầu ghi** khi còn dưới 1 GB. Ước lượng:
1080p30 tốn khoảng 500 MB mỗi giờ, chỉ ghi tiếng thì khoảng 115 MB.

## 6. Cài đặt và cập nhật

Ứng dụng tự kiểm tra bản mới và tải sẵn, nhưng **không bao giờ khởi động lại giữa lúc bạn đang ghi**.
Bản cập nhật nằm chờ tới khi bạn thoát ứng dụng.

Bản cài hiện **chưa được ký số**, nên:

- **Windows:** SmartScreen sẽ cảnh báo. Bấm *More info → Run anyway* nếu bạn tin nguồn tải.
- **macOS:** Gatekeeper sẽ chặn. Chuột phải vào app → *Open* → *Open* lần nữa.

Đây là hạn chế đã biết, không phải dấu hiệu file có vấn đề. Ký số cần chứng thư trả phí và nằm
trong phần việc còn lại của dự án.

## 7. Quyền riêng tư

- Bản ghi nằm trên máy bạn. Không có đồng bộ cloud.
- Gỡ băng chạy hoàn toàn trên máy bằng whisper.cpp.
- Tóm tắt mặc định chạy trên máy. Chỉ khi bạn **tự bật** công tắc và **tự nhập** khoá API thì
  transcript mới được gửi ra ngoài — và giao diện luôn nói rõ bản tóm tắt bạn đang đọc đến từ đâu.
- Khoá API được mã hoá bằng kho khoá của hệ điều hành.
- Crash dump được giữ trên máy, không gửi đi đâu cả.
