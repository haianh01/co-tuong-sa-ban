'use strict';
// Trận Bạch Đằng năm 938. Toàn bộ trận được mô tả bằng dữ liệu:
// thêm trận mới = thêm một file như thế này, không cần sửa code.
BD.registerBattle({
  id: 'bach-dang-938',
  title: 'Bạch Đằng',
  year: 938,
  commander: 'Ngô Quyền',
  enemyName: 'Nam Hán',
  // Bản đồ 40 × 22 ô. Biển ở bên phải, thượng nguồn và đồn của Ngô Quyền ở bên trái.
  map: [
    '..^^..........................^^....,,,,',
    '..^.................................,,,,',
    '.............TT.T..TTT.TT...........,,~~',
    '.............TTTT...TTTTT...........~~~~',
    '.............TTT...TTTT.T..TTT.T...m~~~~',
    '...........,,,,,,,,,........TTTT.mm,~~~~',
    '..........,,~~~~~~~,,m.....TTTTm,,,~~~~~',
    '.........,~~~~~~~~~~~,m.....mm,,,~~~~~~~',
    '........,~~~~~~~~~~~~~,mmmm,,,~~~~~~~~~~',
    ',,,,,,,,~~~~~~~~~~~~~~~,,,,,~~~~~~~~~~~~',
    '~~~~~~~~~~~,,,,,,,,,~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~,,.........,~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~,,,TTT........,~~~~~~~~~~~~~~~~~~',
    ',,,,,,,,.T.TTT.......m,,~~,~~~~~~~~~~~~~',
    '.........TTTTT........m,,,,,,,~~~~~~~~~~',
    '.........TT.TT......TTTTTmTmmm,,,,~~~~~~',
    '....................TT.TTTT.T.TTT,,,~~~~',
    '....................TTTTTT..TTTTTmmm~~~~',
    '....................TTT.TTT.TT.TT...~~~~',
    '............................TTTTT...,~~~',
    '......^.............................,,,,',
    '.....^^.............^^..............,,,,',
  ],
  // Thủy triều: chu kỳ (giây chơi), thời điểm nước lớn nhất.
  // stakeLevel: dưới mức này đầu cọc chạm đáy thuyền. stakeVisible: dưới mức này cọc nhô hẳn lên, giặc nhìn thấy để né.
  // current: sức dòng chảy (nước lên đẩy thuyền ngược sông, nước rút kéo thuyền ra biển).
  tide: { period: 180, highAt: 25, stakeLevel: 0.6, stakeVisible: 0.2, stakeDps: 6, current: 0.45, seaSide: 1 },
  maxStakes: 20,
  stakeZone: { x0: 22, x1: 33, y0: 5, y1: 16 },
  deployMaxX: 33,
  zones: {
    stakes: { x0: 22, x1: 33, y0: 5, y1: 16 },
    pastStakes: { x0: 0, x1: 20, y0: 0, y1: 21 },
  },
  ai: { objective: 'fort', aggro: 4.5, leash: 9, regroup: 6, exit: { x: 39, y: 11 } },

  player: [
    { type: 'don_luy', x: 3, y: 8, tag: 'fort', name: 'Đồn Ngô Quyền' },
    { type: 'thuyen_chi_huy', x: 4, y: 11, tag: 'ngo_quyen', name: 'Ngô Quyền' },
    { type: 'thuyen_nhe', x: 6, y: 10 }, { type: 'thuyen_nhe', x: 7, y: 11 },
    { type: 'thuyen_nhe', x: 8, y: 10 }, { type: 'thuyen_nhe', x: 9, y: 9 },
    { type: 'cung_thu', x: 5, y: 7 }, { type: 'cung_thu', x: 6, y: 7 }, { type: 'cung_thu', x: 7, y: 7 },
    { type: 'bo_binh', x: 4, y: 14 }, { type: 'bo_binh', x: 5, y: 14 }, { type: 'bo_binh', x: 6, y: 14 },
  ],
  enemy: [
    { type: 'lau_thuyen', x: 39, y: 8, wave: 'w1' }, { type: 'lau_thuyen', x: 39, y: 10, wave: 'w1' },
    { type: 'lau_thuyen', x: 39, y: 12, wave: 'w1' }, { type: 'lau_thuyen', x: 39, y: 14, wave: 'w1' },
    { type: 'lau_thuyen', x: 39, y: 8, wave: 'w2' }, { type: 'lau_thuyen', x: 39, y: 10, wave: 'w2' },
    { type: 'lau_thuyen', x: 39, y: 12, wave: 'w2' }, { type: 'lau_thuyen', x: 39, y: 14, wave: 'w2' },
    { type: 'soai_thuyen', x: 39, y: 11, wave: 'w3', tag: 'flagship', name: 'Soái thuyền Lưu Hoằng Tháo' },
    { type: 'lau_thuyen', x: 39, y: 8, wave: 'w3' }, { type: 'lau_thuyen', x: 39, y: 13, wave: 'w3' },
    { type: 'lau_thuyen', x: 39, y: 15, wave: 'w3' },
  ],

  events: [
    { when: { time: 0 }, do: [{ spawn: 'w1' }, { who: 'Ngô Quyền', say: 'Nước đang lên, thuyền giặc đã vào cửa sông. Cho thuyền nhẹ ra khiêu chiến, nhử chúng vượt qua bãi cọc.' }] },
    { when: { time: 10 }, do: [{ spawn: 'w2' }] },
    { when: { time: 20 }, do: [{ spawn: 'w3' }, { who: 'Trinh sát', say: 'Soái thuyền của Lưu Hoằng Tháo đã vào cửa sông.' }] },
    { when: { enemyInZone: 'pastStakes' }, do: [{ who: 'Trinh sát', say: 'Thuyền giặc đã lướt qua bãi cọc mà không hay biết. Nước còn lớn, cọc vẫn ngập sâu.' }] },
    { when: { tideBelow: 0.85, falling: true }, do: [{ who: 'Ngô Quyền', say: 'Nước bắt đầu rút. Giữ chân giặc thêm ít lâu, đừng để chúng quay ra biển sớm!' }] },
    { when: { unitHpBelow: { tag: 'flagship', frac: 0.5 }, enemyOrder: 'advance' }, do: [
      { enemyOrder: 'retreat' },
      { who: 'Lưu Hoằng Tháo', say: 'Soái thuyền trúng thương! Lui ra biển!', kind: 'enemy' }] },
    { when: { tideBelow: 0.72, falling: true }, do: [
      { enemyOrder: 'retreat' },
      { who: 'Lưu Hoằng Tháo', say: 'Nước rút nhanh quá, quay thuyền ra biển!', kind: 'enemy' },
      { who: 'Ngô Quyền', say: 'Toàn quân phản công! Dồn giặc vào bãi cọc!' }] },
    { when: { impaledAtLeast: 1 }, do: [{ who: 'Trinh sát', say: 'Thuyền giặc đâm phải cọc, thủng vỡ cả rồi!' }] },
    { when: { tideBelow: 0.2, falling: true }, do: [{ who: '', say: 'Nước cạn hẳn: đầu cọc nhô khỏi mặt nước, thuyền giặc còn lại bắt đầu tìm đường né.', kind: 'sys' }] },
    { when: { unitDead: 'flagship' }, do: [{ enemyOrder: 'retreat' }, { who: 'Trinh sát', say: 'Lưu Hoằng Tháo tử trận! Quân Nam Hán rối loạn.' }] },
    { when: { sunkAtLeast: 6 }, do: [{ who: 'Ngô Quyền', say: 'Quá nửa thuyền giặc đã chìm. Đừng để chiếc nào thoát!' }] },
    { when: { tideAbove: 0.5, rising: true, time: 140 }, do: [{ who: '', say: 'Nước đang lên lại: cọc sắp ngập, thuyền mắc cọc sẽ thoát ra được.', kind: 'sys' }] },
  ],
  victory: [
    { sunkAtLeast: 9, text: 'Đánh chìm phần lớn đoàn thuyền Nam Hán. Đại thắng Bạch Đằng!' },
  ],
  defeat: [
    { unitDead: 'fort', text: 'Đồn bị phá. Quân Nam Hán tràn vào đất liền.' },
    { unitDead: 'ngo_quyen', text: 'Thuyền chỉ huy bị đánh chìm, quân ta mất người cầm quân.' },
    { escapedAtLeast: 4, text: 'Quá nhiều thuyền giặc thoát ra biển, chúng sẽ còn quay lại.' },
    { time: 260, text: 'Nước đã lên lại, tàn quân Nam Hán theo con nước thoát ra biển.' },
  ],

  briefing: [
    'Năm 937, Kiều Công Tiễn giết Tiết độ sứ Dương Đình Nghệ để đoạt quyền. Ngô Quyền, con rể và tướng cũ của Dương Đình Nghệ, kéo quân từ Ái Châu ra hỏi tội. Kiều Công Tiễn cầu cứu nhà Nam Hán.',
    'Cuối năm 938, Ngô Quyền giết được Kiều Công Tiễn. Vua Nam Hán là Lưu Cung vẫn sai con là Lưu Hoằng Tháo đem thủy quân theo đường biển sang, vào cửa sông Bạch Đằng.',
    'Ngô Quyền cho đóng cọc lớn đầu nhọn bịt sắt ngầm ở cửa sông. Nước lớn, cọc chìm dưới mặt nước. Nước rút, cọc trồi lên đâm thủng đáy thuyền.',
  ],
  howto: [
    'Bày trận (thời gian dừng): bấm vào ô sông sâu trong vùng viền vàng để cắm cọc (tối đa 20). Chọn quân rồi bấm chuột phải để đặt vị trí.',
    'Lâu thuyền Nam Hán mớn nước sâu: khi nước xuống dưới mức 0,6 chúng không qua được bãi nông, chỉ còn lòng sông sâu.',
    'Quân trong rừng và lau sậy ẩn với giặc cho tới khi bắn. Phím H: giữ im lặng (không tự bắn) để mai phục.',
    'Đánh mạnh vào soái thuyền khi nước còn lớn sẽ khiến giặc rút sớm, lướt qua bãi cọc vô hại.',
  ],
  lore: {
    title: 'Trận Bạch Đằng năm 938',
    sections: [
      { h: 'Diễn biến theo sử liệu', p: [
        'Theo Đại Việt sử ký toàn thư, Ngô Quyền sai người đóng cọc lớn đầu nhọn bịt sắt ở cửa biển. Khi nước triều lên, ông cho thuyền nhẹ ra khiêu chiến rồi giả thua chạy để nhử thuyền Nam Hán đuổi theo vào sâu.',
        'Đợi nước triều rút, quân ta đánh quay lại. Thuyền giặc vội rút ra biển thì vướng cọc, bị đắm và hư hại rất nhiều. Lưu Hoằng Tháo tử trận. Vua Nam Hán là Lưu Cung nghe tin phải thu quân về.',
        'Mùa xuân năm 939, Ngô Quyền xưng vương, đóng đô ở Cổ Loa. Chiến thắng Bạch Đằng được xem là mốc chấm dứt hơn một nghìn năm Bắc thuộc.',
      ] },
      { h: 'Khảo cổ học', p: [
        'Ở vùng Quảng Yên (Quảng Ninh) đã tìm thấy nhiều bãi cọc cổ như Yên Giang, Đồng Vạn Muối, Đầm Thượng – Cao Quỳ. Giới nghiên cứu xác định các bãi này thuộc trận Bạch Đằng năm 1288 thời Trần. Vị trí bãi cọc năm 938 đến nay chưa được xác định chắc chắn.',
      ] },
      { h: 'Sử liệu và hư cấu trong màn chơi này', p: [
        'Dựa theo sử liệu: cọc ngầm ở cửa sông, nhử địch khi nước lớn, phản công khi nước rút, Lưu Hoằng Tháo tử trận.',
        'Hư cấu để phục vụ lối chơi: hình dạng khúc sông, đồn lũy, số lượng và chỉ số các loại quân, thời gian thủy triều (rút ngắn còn vài phút), các lời thoại và thuyền chỉ huy của Ngô Quyền tham chiến trực tiếp.',
      ] },
      { h: 'Nguồn tham khảo', p: [
        'Ngô Sĩ Liên và các sử thần triều Lê, Đại Việt sử ký toàn thư, Ngoại kỷ quyển 5.',
        'Viện Sử học, Lịch sử Việt Nam (bộ 15 tập), phần thời Ngô.',
      ] },
    ],
  },
});
