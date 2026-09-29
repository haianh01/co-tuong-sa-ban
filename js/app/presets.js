'use strict';
const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
const PRESETS = [
  { name: 'Xe chọc sâu, Mã ngọa tào', title: 'Xe chọc sâu, Mã ngọa tào', fen: '2bak4/4a4/1n2P3b/p3p1pN1/2c5p/5R3/Pr4P1P/1C7/4A4/2BA1KB2 w',
    script: `| Đỏ đi trước. Tướng Đen nấp sau hai Sĩ, nhìn qua tưởng như an toàn.
X4.5 | Xe chọc sâu xuống hàng đáy: thí Xe, chiếu Tướng!
| Tướng không ăn được Xe, vì ăn xong sẽ đối mặt Tướng Đỏ trên cùng một cột.
S5/6 | Sĩ buộc phải ăn Xe, và bỏ trống ô ngay trước mặt Tướng.
M2.3 | Mã nhảy sát cung, thế Mã ngọa tào. Ba ô thoát đều bị đóng.` },
  { name: 'Khai cuộc Pháo đầu', title: 'Khai cuộc Pháo đầu', fen: START_FEN,
    script: `| Thế khai cuộc. Đỏ đi trước.
P2-5 | Pháo đầu: đưa Pháo vào giữa, nhắm thẳng Tốt đầu của Đen.
M8.7 | Đen lên Mã, giữ Tốt đầu.
M2.3 | Đỏ lên Mã, mở đường cho Xe.
X9.1 | Đen nâng Xe lên một bước, chuẩn bị ra hoành.
X1-2 | Xe Đỏ ra cột 2, gây sức ép lên cánh phải của Đen.
X9-4 | Xe Đen sang hoành, thế trận cân bằng.` },
  { name: 'Pháo ăn Tốt đầu (bẫy)', title: 'Bẫy Pháo ăn Tốt đầu', fen: START_FEN,
    script: `P2-5 | Đỏ vào Pháo đầu.
M8.7 | Đen lên Mã, giữ Tốt đầu.
P5.4 | Pháo tham ăn Tốt đầu.
| Nhưng Pháo Đỏ không có quân nào bảo vệ, và đang nằm trong tầm Mã Đen.
M7.5 | Mã Đen ăn Pháo. Đỏ đổi một Pháo lấy một Tốt, lỗ nặng.` },
  { name: 'Bài: Thuận pháo', title: 'Thuận pháo: Xe cần lộ thông', fen: START_FEN,
    script: `P2-5 | Đỏ vào Pháo đầu, chiếm trung lộ.
P8-5 | Đen đáp lại bằng Pháo đầu: thế Thuận pháo.
M2.3 | Đỏ lên Mã bảo vệ Tốt đầu.
M8.7 | Đen cũng lên Mã giữ Tốt đầu.
X1-2 | Xe Đỏ ra lộ 2, đường dọc thông suốt.
X9-8 | Xe Đen ra lộ 8 đối mặt. Xe mạnh nhất khi đứng trên lộ thông.` },
  { name: 'Câu đố: Trùng pháo', title: 'Câu đố: chiếu bí trong 1 nước', fen: 'rhbakab2/8r/1n5c1/p1p3p1p/1C7/9/P5P1P/4C1N2/4A4/R1BK1AB1R w',
    script: `| Câu hỏi: Đỏ đi một nước chiếu bí. Bạn hãy dừng video và suy nghĩ trong vài giây nhé.
P8-5 | Đáp án: Pháo bình trung. Pháo trước làm ngòi cho Pháo sau, Tướng không còn đường thoát.` },
  { name: 'Bài: Song Xe chiếu bí', title: 'Song Xe chiếu bí', fen: '2b1k4/9/9/R8/9/2n5R/2c6/1r4p2/9/3KA4 w',
    script: `| Hai Xe phối hợp: một Xe khóa hàng, Xe kia chiếu.
X9.2 | Xe thứ nhất khóa hàng ngang ngay trước mặt Tướng.
B7.1 | Đen đẩy Tốt phản công, nhưng đã quá muộn.
X1.5 | Xe thứ hai xuống đáy chiếu bí. Đây là thế Song Xe.` },
  { name: 'Câu đố: Mã hậu pháo', title: 'Câu đố: Mã hậu pháo', fen: '1r2k4/9/b3N3b/p1p3p1p/9/9/PC6P/8c/4A4/R2A1KB1R w',
    script: `| Câu hỏi: Mã Đỏ đang đứng ngay trước mặt Tướng Đen. Nước nào chiếu bí ngay lập tức?
P8-5 | Pháo về trung lộ, lấy Mã làm ngòi. Mã khóa hai ô bên, Pháo khóa ô giữa: thế Mã hậu pháo.` }
];
