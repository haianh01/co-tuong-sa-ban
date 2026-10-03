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
  move-facts.js         Dữ kiện "vì sao" của một nước: đòn trừng phạt, quân treo, so sánh vị trí
  mate-net.js           Thế chiếu bí: quân chiếu, ô Tướng định chạy bị quân nào khống chế hay quân nhà chặn
  timeline.js           Biến kịch bản thành dòng thời gian: camera, hiệu ứng, âm thanh
js/render/
  camera.js             Canvas, phép chiếu 3D, chuyển động camera
  environment.js        Khung cảnh: tường, đèn lồng, bàn trà, bụi sáng
  board.js              Bàn cờ gỗ trắc
  pieces.js             Quân cờ (3 chất liệu), rung quân, chén trà
  overlays.js           Vệt đường đi, vòng chân Mã, nhãn, hạt bụi va chạm
  scene.js              Ghép cảnh, hiệu ứng chiếu bí, phụ đề, thẻ tiêu đề
js/audio/
  audio-engine.js       Bộ tổng hợp âm thanh, reverb, bus ghi âm
  sound-packs.js        Các bộ âm thanh (thêm bộ mới ở đây)
js/app/
  controls.js           Nút phát, tua, chương, vòng lặp khung hình
  export.js             Xuất video MP4 (dựng từng khung + WebCodecs, dự phòng quay thời gian thực); xuất phụ đề .srt
  presets.js            Thế cờ và kịch bản mẫu (thêm bài giảng ở đây)
  board-editor.js       Bàn cờ tương tác: xếp thế cờ và ghi nước đi bằng chuột
  studio.js             Form dựng cảnh
  my-presets.js         Mẫu của tôi: lưu / xóa / tải xuống / mở danh sách mẫu (lưu trong trình duyệt)
  ai-panel.js           Trợ lý AI: gợi ý nước đi, kiểm duyệt kịch bản, nhập / xuất PGN
  think.js              Suy nghĩ của máy: hiện từng dòng Pikafish báo ra (phương án, đổi ý, biểu đồ, biến, UCI gốc)
  pikafish.js           Cầu nối tới máy Pikafish (Web Worker, UCI)
  ai-commentary.js      Lời thoại bằng Claude (gói claude.ai hoặc khóa API): gửi dữ kiện, duyệt, chèn
engine/pikafish.js      Pikafish đơn luồng (WebAssembly, tạo bằng tools/pikafish/build.sh)
engine/pikafish-mt.js   Pikafish đa luồng (cần mở trang qua tools/serve.py)
vendor/anthropic-sdk.js Thư viện chính thức @anthropic-ai/sdk đóng gói cho trình duyệt (tools/vendor-anthropic-sdk.sh)
vendor/mp4-muxer.js     Thư viện mp4-muxer (MIT) đóng gói khung hình WebCodecs thành MP4 (tools/vendor-mp4-muxer.sh)
tools/build.py          Gộp tất cả thành một file dist/co-tuong-sa-ban.html
tools/serve.py          Máy chủ cục bộ kèm header COOP/COEP để Pikafish chạy đa luồng
tools/pikafish/         Vá và biên dịch Pikafish sang WebAssembly
```

## Hiệu ứng chiếu bí

Khi một nước trong kịch bản chiếu bí, video làm sáng các quân tạo nên thế bí, lần lượt từng quân, không vẽ mũi tên hay dấu X (lý do để bạn giải thích trong lời thoại). Máy tính đúng luật, gồm cả Pháo có ngòi mới và hai Tướng lộ mặt:

- Quân vừa đi: vầng sáng xanh. Ô Tướng bị bí: đỏ.
- Quân chiếu: sáng đỏ; ngòi Pháo: sáng cam.
- Quân khống chế các ô Tướng định chạy: sáng cam (chọn ít quân nhất mà vẫn phủ hết các ô).
- Quân nhà đứng chặn đường Tướng: sáng xám.
- Các quân khác tối đi. Cuối cùng chữ 將死 (chiếu bí) hiện nhỏ trên sông, chỗ không có quân; hết nước đi thì là 困斃.

## Trợ lý AI

Nằm cạnh bàn cờ tương tác. Máy tính cờ chạy ngay trên trình duyệt, không cần mạng hay khóa API.

- **Gợi ý nước đi**: tính 3 nước tốt nhất cho thế cờ ở cuối kịch bản, vẽ mũi tên trên bàn cờ kèm diễn biến dự đoán. Bấm “Đi nước này” để thêm vào kịch bản.
- **Kiểm duyệt kịch bản**: chấm từng nước (tốt nhất, nước tốt, chưa chính xác, sai lầm, sai lầm nghiêm trọng, bỏ lỡ chiếu bí) và chỉ ra nước máy chọn. Bấm vào một dòng để xem thế cờ đó trên bàn. Có thể chèn nhận xét của máy thành lời thoại.
- **Suy nghĩ của máy** (khung mở/đóng dưới Trợ lý AI, cần chọn Pikafish): bấm “Bắt đầu suy nghĩ” để Pikafish nghĩ 10 giây đến 3 phút cho thế cờ đang ghi, với 1 đến 5 phương án. Khung hiện mọi điều Pikafish báo ra trong lúc nghĩ:
  1. các phương án đang dẫn đầu, cập nhật liên tục: nước đi, điểm, độ sâu, tỉ lệ Đỏ thắng / hòa / Đen thắng, biến chính; mũi tên trên bàn đổi theo;
  2. nhật ký theo độ sâu, đánh dấu những lần máy đổi nước tốt nhất;
  3. biểu đồ điểm theo độ sâu của 3 phương án đầu (rê chuột để xem từng độ sâu);
  4. bấm một nước trong biến để xem thế cờ đó trên bàn, nút ◀ ▶ để đi lui / tới trong biến;
  5. nguyên văn các dòng UCI, sao chép được (kèm FEN) để dán cho Claude.

  Bấm Dừng để dừng sớm; đi nước khác, bấm Gợi ý / Kiểm duyệt hay đóng khung thì máy cũng tự dừng. Pikafish không cho xem từng thế cờ nó duyệt (hàng triệu thế), chỉ báo một dòng mỗi khi nghĩ sâu thêm một tầng; khung này hiện đủ các dòng đó.
- **Mũi tên gợi ý tự động**: khi ghi nước đi, sau mỗi nước máy tự tính và vẽ mũi tên cho 3 nước tốt nhất (xanh lá là nước tốt nhất). Tắt bằng ô “Tự hiện mũi tên gợi ý”; trang nhớ lựa chọn. Nút “Gợi ý nước đi” vẫn dùng để tính kỹ hơn và xem diễn biến.
- **Tự vẽ để phân tích**: kéo chuột phải trên bàn cờ để vẽ mũi tên, bấm chuột phải vào một ô để khoanh tròn (như lichess); chọn màu, vẽ lại đúng nét để xóa, hoặc bấm “Xóa nét vẽ”. Trên điện thoại bật nút “Vẽ mũi tên” rồi kéo bằng ngón tay. Nét vẽ tự xóa khi đi nước mới.
- **Thanh đánh giá**: thanh dọc cạnh bàn cờ (phần đỏ là cơ hội thắng của Đỏ, phần xanh là của Đen) tự cập nhật sau mỗi nước, như trên chess.com / lichess. Tắt được bằng ô “Tự chấm thế cờ sau mỗi nước”.
- **Biểu đồ diễn biến**: sau khi kiểm duyệt, biểu đồ cho thấy thế cờ nghiêng về bên nào qua từng nước; chấm màu là nước đáng xem lại. Rê chuột để xem điểm, bấm để xem thế cờ trên bàn.
- **Lời thoại bằng Claude**: sau khi kiểm duyệt, bấm “Viết lời thoại bằng Claude”. Claude (mô hình ngôn ngữ của Anthropic) nhận dữ kiện của máy cờ cho từng nước (thế cờ FEN trước nước, điểm trước/sau, nước máy chọn và diễn biến, ăn quân, chiếu; nước đáng xem lại có thêm 3 phương án tốt nhất của máy để so sánh) cùng tài liệu tham khảo bạn dán vào, rồi viết lời thoại tự nhiên. Bạn sửa, chọn dòng muốn dùng rồi mới chèn vào kịch bản. Nước đi nào Claude nhắc tới mà không có trong phân tích của máy cờ sẽ bị đánh dấu để bạn kiểm tra lại. Có hai cách dùng:
  - **Gói Claude (sao chép – dán)**, mặc định: dùng gói tháng Claude (Pro, Max…) qua claude.ai, không cần khóa API, không tốn thêm phí. Bấm “Sao chép yêu cầu”, mở claude.ai, dán vào ô chat và gửi; khi Claude trả lời xong, sao chép câu trả lời, dán vào ô trong trang rồi bấm “Đọc kết quả”. Trang tự bỏ phần chữ thừa và khung ``` quanh khối JSON, bỏ các dòng không khớp nước nào, và báo nếu câu trả lời bị cụt.
  - **Khóa API**: gọi thẳng Claude từ trang. Cần khóa API Anthropic (tạo ở console.anthropic.com, tính phí theo lượng chữ, tách riêng với gói tháng); khóa chỉ gửi tới api.anthropic.com và chỉ được lưu trong trình duyệt khi bạn chọn “Nhớ khóa”.
- **Nhờ Claude phân tích thế cờ**: trong kết quả “Gợi ý nước đi”, bấm “Nhờ Claude phân tích thế cờ này”. Claude nhận sơ đồ bàn cờ, FEN và 3 phương án máy vừa tính (điểm, diễn biến, nước đáp của đối phương, quân treo, so sánh với nước máy chọn), rồi viết phân tích: nhận định chung, ý đồ từng phương án, vì sao máy chọn nước đầu. Dùng được cả hai cách (gói Claude hoặc khóa API); với gói Claude thì đọc phân tích ngay trên claude.ai.
- **Lý do cụ thể cho nước sai**: khi kiểm duyệt, trang tự đo dữ kiện "vì sao" cho từng nước, rồi dùng cho nút “Chèn nhận xét của máy” (không cần mạng) và gửi kèm cho Claude:
  - *Đòn trừng phạt*: đối phương đáp thế nào sau nước đó, ăn quân gì, cán cân vật chất ra sao.
  - *Quân bị treo*: quân vừa bị tấn công mà không có quân bảo vệ.
  - *So sánh vị trí với nước máy chọn*: quân vừa đi kiểm soát ít ô hơn, Mã bị cản chân, Xe bị quân mình chặn đường tiến, quân chậm ra trận… Chỉ giữ những số đo cho thấy nước đã đi kém hơn, cùng chiều với đánh giá của máy cờ.

  Số đo luôn đúng theo luật cờ, nhưng chọn số đo nào làm lý do là suy luận: với lỗi vị trí tinh tế, lý do thật có thể sâu hơn. Dùng Pikafish thì lý do đáng tin hơn máy có sẵn.
- **Nhập / xuất PGN**: dán hoặc mở file `.pgn`; mọi nước được kiểm tra đúng luật trước khi thành kịch bản. Xuất kịch bản ra PGN dạng tọa độ ICCS.

Độ mạnh chỉnh bằng ô “Nhanh / Vừa / Kỹ” (thời gian suy nghĩ mỗi thế cờ).

### Chọn máy tính cờ

- **Máy có sẵn**: nhẹ, dùng được ngay, mức nghiệp dư khá. Lặp lại một thế cờ lần thứ ba thì tính là hòa (không phân biệt bên chiếu dai).
- **Pikafish (mạnh)**: [Pikafish](https://github.com/official-pikafish/Pikafish) là máy cờ tướng mã nguồn mở mạnh nhất hiện nay (mạng nơ-ron NNUE), vượt xa kỳ thủ người. Pikafish tuân theo luật châu Á về chiếu dai / đuổi dai.

Cả hai máy đều nhận lịch sử ván (thế cờ ban đầu và các nước đã đi trong kịch bản) khi gợi ý, chấm thanh đánh giá và kiểm duyệt, nên xét được luật lặp nước trên cả ván chứ không chỉ thế cờ hiện tại.
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

## Xuất video

Bấm “Xuất video” (cạnh nút phát). Trên Chrome / Edge, trang dựng lần lượt từng khung hình theo đúng thời điểm, mã hóa bằng WebCodecs của trình duyệt (H.264 + AAC nếu máy hỗ trợ, không thì VP9 + Opus) rồi ghi thành file MP4:

- Không phụ thuộc thời gian thực: máy có card đồ họa thường xuất nhanh hơn độ dài video; máy yếu thì lâu hơn nhưng video vẫn mượt đủ 30 khung/giây, không bị rơi khung.
- Vẫn chạy khi chuyển sang tab khác. Có thanh tiến độ, thời gian còn lại và nút “Hủy”.
- Tiếng động được dựng riêng một lần (OfflineAudioContext) nên khớp từng khung hình. Đang tắt tiếng thì video không có âm thanh.

Trình duyệt không có WebCodecs thì trang quay theo thời gian thực như cũ (MediaRecorder): tự tạm dừng khi chuyển tab, cũng có nút “Hủy”.

## Giọng đọc: xuất phụ đề .srt cho CapCut

Bấm “Phụ đề .srt” (cạnh “Xuất video”) để tải file phụ đề, mỗi câu thoại khớp đúng thời điểm nó hiện trong video. Ký hiệu nước đi được đổi sang cách đọc (“P5.4” thành “Pháo 5 tiến 4”, “Xt.3” thành “Xe trước tiến 3”), và câu thoại của mỗi nước được mở đầu bằng tên nước nếu câu chưa nhắc tới.

Dùng với CapCut (máy tính hoặc điện thoại):

1. Thêm video vừa xuất vào CapCut.
2. Chọn Văn bản → Nhập phụ đề / Phụ đề cục bộ, chọn file `.srt`.
3. Chọn tất cả phụ đề → “Chuyển văn bản thành giọng nói” (Text to speech), chọn một giọng tiếng Việt.
4. Nếu chỉ muốn nghe giọng mà không hiện chữ, ẩn hoặc xóa lớp phụ đề sau khi đã tạo giọng.

Giọng đọc dài hơn khoảng thời gian của câu thì chọn “Nhịp dựng: Chậm, kỹ” rồi dựng và xuất lại để mỗi câu có nhiều thời gian hơn.

## Tự lưu bản nháp

Tiêu đề, thế cờ và kịch bản đang soạn được tự lưu trong trình duyệt sau mỗi lần sửa. Lỡ tải lại hay đóng tab thì mở trang lại là soạn tiếp được (trang báo “Đã mở lại bản bạn đang soạn lần trước”). Đang soạn dở mà chọn một mẫu khác thì trang hỏi trước khi thay kịch bản. Bản nháp chỉ có một bản, nằm trong trình duyệt đang dùng; muốn giữ lâu dài hay mang sang máy khác thì bấm “Lưu thành mẫu”.

## Thêm bài giảng

Cách nhanh nhất, ngay trên trang: soạn thế cờ và kịch bản (hoặc nhập PGN), rồi bấm **“Lưu thành mẫu”** dưới ô “Mẫu có sẵn”
(sau khi nhập PGN còn có nút **“Lưu vào mẫu có sẵn”** trong khung PGN). Mẫu hiện trong nhóm “Mẫu của tôi”; lưu trùng tên thì
mẫu cũ được cập nhật. Mẫu nằm trong bộ nhớ của trình duyệt: muốn sao lưu hoặc dùng ở máy khác, bấm “Tải danh sách mẫu”
để lấy file `.json`, rồi “Mở danh sách mẫu” ở máy kia.

Muốn mẫu có sẵn cho mọi người dùng, mở `js/app/presets.js`, thêm một mục `{ name, title, fen, script }` vào mảng `PRESETS`.

## Thêm bộ âm thanh

Mở `js/audio/sound-packs.js`, thêm một mục vào `SOUND_PACKS` với các hàm
`land`, `capture`, `check`, `mate` (tùy chọn `lift`, `move`, `drop`). Hàm nào thiếu sẽ dùng bộ "Gỗ cổ điển".

## Gộp thành một file

```
python3 tools/build.py
```
File `dist/co-tuong-sa-ban.html` chạy độc lập, tiện gửi cho người khác.
