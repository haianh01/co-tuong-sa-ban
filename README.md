# Sa bàn chiến trường – Xưởng dựng video cờ tướng

Dựng video bài giảng cờ tướng 2.5D từ thế cờ (FEN) và kịch bản nước đi. Không cần cài đặt gì.

## Chạy

Mở `index.html` bằng Chrome hoặc Edge (nhấp đúp là được). Cần mạng lần đầu để tải font.

Muốn Pikafish chạy đa luồng (nhanh hơn nhiều lần), mở trang qua máy chủ cục bộ đi kèm:

```
python3 tools/serve.py
```
rồi vào http://localhost:8000.

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
  pikafish.js           Cầu nối tới máy Pikafish (Web Worker, UCI)
engine/pikafish.js      Pikafish đơn luồng (WebAssembly, tạo bằng tools/pikafish/build.sh)
engine/pikafish-mt.js   Pikafish đa luồng (cần mở trang qua tools/serve.py)
tools/build.py          Gộp tất cả thành một file dist/co-tuong-sa-ban.html
tools/serve.py          Máy chủ cục bộ kèm header COOP/COEP để Pikafish chạy đa luồng
tools/pikafish/         Vá và biên dịch Pikafish sang WebAssembly
```

## Trợ lý AI

Nằm cạnh bàn cờ tương tác. Máy tính cờ chạy ngay trên trình duyệt, không cần mạng hay khóa API.

- **Gợi ý nước đi**: tính 3 nước tốt nhất cho thế cờ ở cuối kịch bản, vẽ mũi tên trên bàn cờ kèm diễn biến dự đoán. Bấm “Đi nước này” để thêm vào kịch bản.
- **Kiểm duyệt kịch bản**: chấm từng nước (tốt nhất, nước tốt, chưa chính xác, sai lầm, sai lầm nghiêm trọng, bỏ lỡ chiếu bí) và chỉ ra nước máy chọn. Bấm vào một dòng để xem thế cờ đó trên bàn. Có thể chèn nhận xét của máy thành lời thoại.
- **Nhập / xuất PGN**: dán hoặc mở file `.pgn`; mọi nước được kiểm tra đúng luật trước khi thành kịch bản. Xuất kịch bản ra PGN dạng tọa độ ICCS.

Độ mạnh chỉnh bằng ô “Nhanh / Vừa / Kỹ” (thời gian suy nghĩ mỗi thế cờ).

### Chọn máy tính cờ

- **Máy có sẵn**: nhẹ, dùng được ngay, mức nghiệp dư khá.
- **Pikafish (mạnh)**: [Pikafish](https://github.com/official-pikafish/Pikafish) là máy cờ tướng mã nguồn mở mạnh nhất hiện nay (mạng nơ-ron NNUE), vượt xa kỳ thủ người. Pikafish tuân theo luật châu Á về chiếu dai / đuổi dai.
  Lần đầu chọn Pikafish, trang sẽ hướng dẫn:
  1. Tải file mạng nơ-ron `pikafish.nnue` (khoảng 50 MB) từ bản phát hành chính thức.
  2. Chọn file vừa tải. Trình duyệt lưu file này lại, những lần sau dùng được ngay.

  Nếu chạy trang qua máy chủ web, có thể đặt sẵn file tại `engine/pikafish.nnue`, trang sẽ tự nạp.

Chọn **số luồng** ngay trong khung Trợ lý AI (hiện ra khi chọn Pikafish). Cách chạy nhiều luồng tùy cách mở trang:

| Cách mở trang | Nhiều luồng chạy thế nào | Gợi ý nước đi | Kiểm duyệt kịch bản |
|---|---|---|---|
| `python3 tools/serve.py` rồi vào http://localhost:8000 | **Chung bộ nhớ**: một bản Pikafish chạy N luồng (tối đa 16) | Nhanh gấp khoảng N lần | Tính sâu hơn |
| Nhấp đúp `index.html`, hoặc file gộp trong `dist/` | **Nhiều bản song song**: N bản Pikafish độc lập (tối đa 4, mỗi bản khoảng 450 MB bộ nhớ) | Chia các nước đi cho N bản rồi gộp | Chấm N nước cùng lúc, nhanh gần gấp N lần |

Đa luồng chung bộ nhớ cần `SharedArrayBuffer`, mà trình duyệt chỉ bật khi trang được gửi kèm header
`Cross-Origin-Opener-Policy: same-origin` và `Cross-Origin-Embedder-Policy`. Mở file trực tiếp thì không có header
(và không thể bật bằng code trong trang), nên trang dùng cách nhiều bản song song. Nếu đưa trang lên máy chủ web khác,
hãy cấu hình hai header này (`tools/serve.py` dùng `credentialless` để font Google Fonts vẫn tải được).

Để biên dịch lại (cần [Emscripten](https://emscripten.org/)):

```
source /đường/dẫn/emsdk/emsdk_env.sh
bash tools/pikafish/build.sh
```

Pikafish phát hành theo giấy phép GPLv3; mã nguồn và bản vá nằm trong `tools/pikafish/`.

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
