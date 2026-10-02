'use strict';
// Loại quân. Đơn vị đo: ô bản đồ (khoảng cách, tầm), giây (hồi chiêu), ô/giây (tốc độ).
// domain: 'water' đi trên nước, 'land' đi trên cạn, 'fixed' đứng yên (đồn lũy).
// draft: mớn nước. Thuyền chỉ qua được bãi nông khi mực triều >= draft.
// wade: lội được bãi bồi lúc nước cạn.
BD.UNIT_TYPES = {
  thuyen_nhe:     { name: 'Thuyền nhẹ',        cls: 'boat',     domain: 'water', hp: 70,  atk: 8,  def: 1, range: 1.7, cd: 1.0, speed: 2.4,  vision: 5.5, draft: 0.2,  r: 0.34 },
  thuyen_chi_huy: { name: 'Thuyền chỉ huy',    cls: 'boat',     domain: 'water', hp: 170, atk: 12, def: 3, range: 1.9, cd: 1.0, speed: 2.0,  vision: 6.5, draft: 0.3,  r: 0.42 },
  cung_thu:       { name: 'Cung thủ',          cls: 'archer',   domain: 'land',  hp: 55,  atk: 9,  def: 0, range: 4.2, cd: 1.3, speed: 1.5,  vision: 6,   r: 0.3 },
  bo_binh:        { name: 'Bộ binh',           cls: 'infantry', domain: 'land',  hp: 100, atk: 13, def: 2, range: 1.15, cd: 1.0, speed: 1.6, vision: 4.5, wade: true, r: 0.33 },
  don_luy:        { name: 'Đồn lũy',           cls: 'fort',     domain: 'fixed', hp: 900, atk: 9,  def: 4, range: 3.6, cd: 1.2, speed: 0,    vision: 5,   r: 0.6 },
  lau_thuyen:     { name: 'Lâu thuyền Nam Hán', cls: 'warship', domain: 'water', hp: 190, atk: 11, def: 3, range: 2.6, cd: 1.5, speed: 0.8, vision: 5,   draft: 0.6,  r: 0.48 },
  soai_thuyen:    { name: 'Soái thuyền',       cls: 'warship',  domain: 'water', hp: 340, atk: 15, def: 4, range: 2.8, cd: 1.4, speed: 0.72,  vision: 5.5, draft: 0.65, r: 0.58 },
};

// Bảng khắc chế: hệ số sát thương [lớp tấn công][lớp bị đánh].
BD.COUNTER = {
  boat:     { boat: 1.0, warship: 0.8, archer: 0.6, infantry: 0.6, fort: 0.5 },
  archer:   { boat: 1.3, warship: 0.9, archer: 1.0, infantry: 1.1, fort: 0.3 },
  infantry: { boat: 1.4, warship: 1.6, archer: 1.5, infantry: 1.0, fort: 0.6 },
  warship:  { boat: 1.4, warship: 1.0, archer: 0.9, infantry: 0.9, fort: 1.0 },
  fort:     { boat: 1.0, warship: 1.0, archer: 1.0, infantry: 1.0, fort: 1.0 },
};
