# Sa bàn chiến trường – Xưởng dựng video cờ tướng

Dựng video bài giảng cờ tướng 2.5D từ thế cờ (FEN) và kịch bản nước đi. Không cần cài đặt gì.

## Chạy

Mở `index.html` bằng Chrome hoặc Edge (nhấp đúp là được). Cần mạng lần đầu để tải font.

## Cấu trúc

```
index.html              Giao diện trang
css/style.css           Giao diện
js/core/
  utils.js              Hàm tiện ích, hằng số màu và font
  engine.js             Luật cờ tướng: đọc FEN, sinh nước hợp lệ, chiếu, ký hiệu X4.5
  ai-core.js            Máy tính cờ: tìm kiếm alpha-beta, lượng giá thế cờ (chạy trong Web Worker)
  pgn.js                Đọc / ghi PGN (ICCS, ký hiệu Việt, WXF, ký hiệu Trung Quốc)
  timeline.js           Biến kịch bản thành dòng thời gian: camera, hiệu ứng, âm thanh
js/render/
  camera.js             Canvas, phép chiếu 3D, chuyển động camera
  environment.js        Khung cảnh: tường, đèn lồng, bàn trà, bụi sáng
  board.js              Bàn cờ gỗ trắc
  pieces.js             Quân cờ (3 chất liệu), rung quân, chén trà
  overlays.js           Vệt đường đi, vòng chân Mã, nhãn, hạt bụi va chạm
  scene.js              Ghép cảnh, làm mờ khi chiếu bí, phụ đề, thẻ tiêu đề
js/audio/
  audio-engine.js       Bộ tổng hợp âm thanh, reverb, bus ghi âm
  sound-packs.js        Các bộ âm thanh (thêm bộ mới ở đây)
js/app/
  controls.js           Nút phát, tua, chương, vòng lặp khung hình
  export.js             Xuất video MP4/WebM
  presets.js            Thế cờ và kịch bản mẫu (thêm bài giảng ở đây)
  board-editor.js       Bàn cờ tương tác: xếp thế cờ và ghi nước đi bằng chuột
  studio.js             Form dựng cảnh
  ai-panel.js           Trợ lý AI: gợi ý nước đi, kiểm duyệt kịch bản, nhập / xuất PGN
tools/build.py          Gộp tất cả thành một file dist/co-tuong-sa-ban.html
```

## Trợ lý AI

Nằm cạnh bàn cờ tương tác. Máy tính cờ chạy ngay trên trình duyệt, không cần mạng hay khóa API.

- **Gợi ý nước đi**: tính 3 nước tốt nhất cho thế cờ ở cuối kịch bản, vẽ mũi tên trên bàn cờ kèm diễn biến dự đoán. Bấm “Đi nước này” để thêm vào kịch bản.
- **Kiểm duyệt kịch bản**: chấm từng nước (tốt nhất, nước tốt, chưa chính xác, sai lầm, sai lầm nghiêm trọng, bỏ lỡ chiếu bí) và chỉ ra nước máy chọn. Bấm vào một dòng để xem thế cờ đó trên bàn. Có thể chèn nhận xét của máy thành lời thoại.
- **Nhập / xuất PGN**: dán hoặc mở file `.pgn`; mọi nước được kiểm tra đúng luật trước khi thành kịch bản. Xuất kịch bản ra PGN dạng tọa độ ICCS.

Độ mạnh chỉnh bằng ô “Nhanh / Vừa / Kỹ” (thời gian suy nghĩ mỗi thế cờ).

## Thêm bài giảng

Mở `js/app/presets.js`, thêm một mục `{ name, title, fen, script }` vào mảng `PRESETS`.

## Thêm bộ âm thanh

Mở `js/audio/sound-packs.js`, thêm một mục vào `SOUND_PACKS` với các hàm
`land`, `capture`, `check`, `mate` (tùy chọn `lift`, `move`, `drop`). Hàm nào thiếu sẽ dùng bộ "Gỗ cổ điển".

## Gộp thành một file

```
python3 tools/build.py
```
File `dist/co-tuong-sa-ban.html` chạy độc lập, tiện gửi cho người khác.
