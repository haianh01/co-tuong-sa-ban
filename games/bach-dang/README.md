# Bạch Đằng 938 – prototype game chiến thuật

Màn chơi đầu tiên của dự án game chiến thuật tái hiện các trận đánh lịch sử Việt Nam:
chiến thuật thời gian thực có tạm dừng, góc nhìn từ trên xuống, không cần cài đặt.

## Chạy

Mở `games/bach-dang/index.html` bằng Chrome, Edge hoặc Firefox (nhấp đúp là được).
Chạy được cả trên điện thoại (chạm để chọn, chạm để ra lệnh).

## Cách chơi

1. **Bày trận** (thời gian đứng yên): bấm hoặc kéo trên ô sông sâu trong vùng viền vàng để cắm cọc (tối đa 20).
   Chọn quân rồi bấm chuột phải để đặt quân. Quân trong rừng và lau sậy sẽ ẩn với giặc.
2. **Giao chiến**: thuyền Nam Hán vào từ biển lúc nước lớn, lướt qua cọc vô hại. Dùng thuyền nhẹ nhử giặc ngược sông,
   giữ chân chúng tới khi nước rút. Khi nước xuống dưới mức cọc (vạch cam trên biểu đồ triều), giặc quay ra biển
   và mắc cọc.
3. Thắng khi đánh chìm 9/12 thuyền. Thua khi mất đồn, mất thuyền chỉ huy, để 4 thuyền thoát, hoặc hết giờ (nước lên lại).

Phím tắt: chuột trái chọn (kéo để chọn nhiều, Shift để thêm) · chuột phải đi / đánh · Cách tạm dừng ·
H giữ im lặng (không tự bắn, để mai phục) · S dừng · A chọn tất cả · 1 / 2 / 4 tốc độ.

Các cơ chế:
- **Thủy triều** dao động hình sin. Nước lên đẩy thuyền ngược sông, nước rút kéo thuyền ra biển.
- **Bãi nông** cạn dần: lâu thuyền (mớn sâu) mắc cạn khi nước dưới 0,6; dưới 0,4 bãi bồi lộ ra, bộ binh lội ra được.
- **Cọc ngầm** chỉ đâm thuyền khi nước dưới mức cọc. Quân ta biết chỗ cọc nên tự né; giặc chỉ né khi cọc nhô hẳn khỏi mặt nước.
- **Sương mù và ẩn nấp**: chỉ thấy giặc trong tầm nhìn của quân ta. Quân ta trong rừng / lau sậy chỉ lộ khi giặc tới rất gần hoặc khi bắn.
- **Khắc chế**: bộ binh mạnh với thuyền mắc cọc, thuyền chiến mạnh với thuyền nhẹ, thuyền mắc cọc / mắc cạn chịu thêm 40% sát thương.

## Cấu trúc

```
index.html                     Trang game
css/game.css                   Giao diện
js/core/util.js                Không gian tên BD, hàm tiện ích
js/core/terrain.js             Địa hình, thủy triều, dòng chảy, cọc, tìm đường A*
js/core/world.js               Trạng thái trận: đơn vị, di chuyển, giao chiến, mắc cọc / mắc cạn, ẩn nấp, sương mù
js/core/ai.js                  AI phe địch: tiến quân / đuổi đánh (bị nhử, có giới hạn) / rút lui
js/core/events.js              Hệ thống sự kiện kịch bản và điều kiện thắng thua
js/data/units.js               Chỉ số các loại quân và bảng khắc chế
js/data/battles/bach-dang-938.js  Toàn bộ trận Bạch Đằng 938 dưới dạng dữ liệu
js/render/render.js            Vẽ sa bàn lên canvas
js/app/hud.js                  Đồng hồ, biểu đồ triều, chiến báo, màn kết thúc, bách khoa
js/app/input.js                Chuột, cảm ứng, bàn phím
js/app/main.js                 Khởi động, vòng lặp khung hình
test/sim-test.js               Chạy thử trận đánh không cần trình duyệt
```

Phần `js/core` và `js/data` không dùng DOM hay canvas, nên chạy được trong Node để kiểm thử.

## Thêm trận mới

Mỗi trận là một file trong `js/data/battles/` gọi `BD.registerBattle({...})`, rồi thêm thẻ `<script>` vào `index.html`. Các khóa chính:

| Khóa | Ý nghĩa |
|---|---|
| `map` | Mảng chuỗi, mỗi ký tự một ô: `~` sông sâu, `,` bãi nông, `.` đất bằng, `T` rừng, `m` lau sậy, `^` núi |
| `tide` | `period`, `highAt`, `stakeLevel`, `stakeVisible`, `stakeDps`, `current` |
| `player`, `enemy` | Danh sách quân `{ type, x, y, tag?, name?, wave? }`; quân địch xuất hiện theo `wave` |
| `events` | `{ when: điều kiện, do: [hành động] }`. Điều kiện: `time`, `tideBelow` / `tideAbove` (+ `falling` / `rising`), `enemyInZone`, `sunkAtLeast`, `escapedAtLeast`, `impaledAtLeast`, `lostAtLeast`, `unitDead`, `unitHpBelow`, `enemyOrder`. Hành động: `say`, `spawn`, `enemyOrder` |
| `victory`, `defeat` | Danh sách điều kiện (chỉ cần một điều kiện đúng), mỗi cái kèm `text` |
| `ai` | Mục tiêu tấn công, tầm phát hiện, khoảng bị nhử tối đa, cửa thoát |
| `briefing`, `howto`, `lore` | Bối cảnh, hướng dẫn, tư liệu mở khóa khi thắng (ghi rõ phần sử liệu và phần hư cấu) |

Loại quân mới thêm vào `js/data/units.js`.

## Kiểm thử

```
node games/bach-dang/test/sim-test.js      # thêm -v để in chiến báo
```

Kiểm tra bốn điều: không làm gì thì thua; đánh theo cách của Ngô Quyền (cắm cọc, phục binh, nhử giặc) thì thắng
với 5 hạt giống ngẫu nhiên; cọc không làm hại thuyền khi nước lớn; cùng cách đánh mà bỏ cọc thì thua.

## Bước tiếp theo

- Đồ họa pixel art và âm thanh (trống đồng, sáo trúc).
- Lưu game, màn hướng dẫn tương tác, cân bằng độ khó.
- Trận tiếp theo: Như Nguyệt 1077 (phòng tuyến sông), dùng lại hệ thống sự kiện và địa hình.
