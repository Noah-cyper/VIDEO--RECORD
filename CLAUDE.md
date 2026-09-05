# CallRec — ghi chú cho phiên làm việc sau

Ứng dụng Electron ghi cuộc gọi trên desktop, thu **âm cả hai bên**: mic (giọng mình) và
loopback/system audio (giọng đầu bên kia), kèm video màn hình.

## Quy ước

- **Trả lời và viết commit bằng tiếng Việt.** Comment trong code cũng tiếng Việt.
- Comment giải thích **tại sao**, không nhắc lại **cái gì**. Xem `token-efficient-coding`.
- Chuỗi hiển thị cho người dùng **luôn đi qua `src/shared/i18n.ts`**, không hardcode.
  Thêm khoá là phải thêm ở **cả hai** từ điển — có test đối chiếu bắt được nếu quên.

## Ba bất biến không được phá

1. **Mic và system audio là hai luồng riêng từ đầu tới cuối.** Chỉ gặp nhau ở bước FFmpeg, và
   ngay cả ở đó cũng là hai track riêng trong cùng file. Trộn là mất khả năng tách người nói —
   không đảo ngược được, và đó là toàn bộ giá trị của app.
2. **Chỉ báo đang ghi không tắt được** (FR-08). Điều kiện hiện nó nằm ở tầng máy trạng thái
   (`shared/machine.ts` → `indicatorRequired`), không ở tầng UI. Không có chế độ ghi ẩn, và
   sẽ không bao giờ có — nếu ai đề xuất, đó là dấu hiệu phải dừng lại bàn lại.
3. **Mọi giá trị từ renderer đi vào đường dẫn file phải được kiểm tra**, và kiểm ở tầng module
   chứ không chỉ ở handler IPC. Xem `docs/08-bao-mat.md`.

## Lệnh

```bash
npm run dev        # chạy app
npm test           # 132 test; cần ffmpeg-static (đã có trong devDependencies)
npm run typecheck
npm run lint
npm run smoke      # bật app thật dưới Xvfb, kiểm cả việc đổi ngôn ngữ
```

Trước khi coi là xong: `lint`, `typecheck`, `test`, `smoke` — cả bốn.

## Bố cục

- `src/shared/` — logic thuần, **không** import electron. Đây là phần có unit test.
- `src/main/` — chạm hệ điều hành và đĩa cứng.
- `src/preload/` — `contextBridge`, danh sách kênh cố định. Không thêm API tổng quát.
- `src/renderer/` — Web API media và giao diện.

## Sidecar

- **FFmpeg**: bắt buộc. Khi dev tự lấy từ `node_modules/ffmpeg-static`. Khi đóng gói phải nằm ở
  `resources/ffmpeg/`.
- **whisper.cpp**: chỉ cần cho gỡ băng. Đặt ở `resources/whisper/`. Không có thì mọi tính năng
  ghi vẫn chạy, chỉ nút gỡ băng bị vô hiệu hoá.

## Điều quan trọng nhất cần biết

**Phần bắt âm loopback chưa từng chạy trên máy có thiết bị âm thanh thật.** Toàn bộ code được viết
và kiểm trong container không có card âm thanh, không có Windows/macOS. Những thứ sau vẫn là giả
định theo tài liệu Electron, chưa phải sự thật đã đo:

- `audio: 'loopback'` có thật sự trả về tiếng đầu bên kia trên Windows và macOS 13+ không
- Độ lệch A/V sau 60 phút, mức CPU khi ghi 1080p30
- Luồng cấp quyền macOS
- `runWhisper` (chưa có binary whisper.cpp trong môi trường dựng)

Trước khi hứa hẹn gì với người dùng, chạy checklist ở
`docs/01-workflow.md#checklist-test-thủ-công-chạy-trước-mỗi-lần-lên-gate` trên máy thật.

## Tài liệu

`docs/00` phạm vi · `01` workflow và các gate · `02` kiến trúc · `03` kỹ thuật bắt âm 2 chiều và
các cạm bẫy · `04` pipeline và lưu trữ · `05` backlog · `06` gỡ băng và tóm tắt ·
`07` hướng dẫn người dùng · `08` bảo mật.
