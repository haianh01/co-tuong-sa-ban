'use strict';
// Lưới chiếu bí: vì sao Tướng hết đường, dùng cho hiệu ứng video lúc chiếu bí.
// - checkers: quân đang chiếu, kèm đường đánh (ngòi Pháo, chân Mã, các ô ở giữa).
// - escapes: từng ô Tướng định chạy trong cung: bị quân nhà chặn (own) hay bị quân địch khống chế (ctrl).
//   Ô khống chế được tính đúng luật: thử cho Tướng bước sang rồi xem quân nào đánh tới, nên tính cả
//   Pháo có ngòi mới và hai Tướng lộ mặt. Mỗi ô chỉ giữ một quân khống chế, chọn sao cho ít quân nhất.
// - defenders: tối đa 2 quân trông như cứu được (ăn quân chiếu, chặn giữa đường, dời ngòi Pháo) nhưng
//   đi thì Tướng vẫn bị chiếu.

// Đường đánh của quân ở ô `from` tới ô `to` trên bàn N.
function attackPath(N, from, to) {
  const p = N[from], fc = from % 9, fr = (from / 9) | 0, tc = to % 9, tr = (to / 9) | 0, o = { from, to, type: p.type, between: [] };
  if (p.type === 'h') {
    for (const [dc, dr, lc, lr] of HORSE) if (fc + dc === tc && fr + dr === tr) { o.leg = (fr + lr) * 9 + fc + lc; o.between = [o.leg]; }
    return o;
  }
  const dc = Math.sign(tc - fc), dr = Math.sign(tr - fr);
  if (fc !== tc && fr !== tr) return o; // Sĩ, Tượng: không có ô ở giữa để chặn
  for (let c = fc + dc, r = fr + dr; c !== tc || r !== tr; c += dc, r += dr) {
    const i = r * 9 + c; o.between.push(i);
    if (p.type === 'c' && N[i]) o.screen = i;
  }
  return o;
}

function mateNet(B, side) {
  const ki = kingIdx(B, side), kc = ki % 9, kr = (ki / 9) | 0, enemy = opp(side);
  const attackersOf = N => { const a = attackers(N, side); if (kingsFace(N)) a.push(kingIdx(N, enemy)); return a; };
  const checkers = attackersOf(B).map(i => attackPath(B, i, ki));
  const checkerSet = new Set(checkers.map(c => c.from));

  const escapes = [];
  for (const [dc, dr] of DIRS) {
    const c = kc + dc, r = kr + dr; if (!inPal(c, r, side)) continue;
    const sq = r * 9 + c, q = B[sq];
    if (q && q.side === side) { escapes.push({ sq, own: sq }); continue; }
    const N = apply(B, [ki, sq]), by = attackersOf(N);
    if (by.length) escapes.push({ sq, by, N });
  }
  // Chọn ít quân khống chế nhất (tham lam); hòa thì ưu tiên quân đang chiếu, vốn đã có trong khung hình.
  let left = escapes.filter(e => e.by);
  while (left.length) {
    const cnt = new Map(); for (const e of left) for (const i of e.by) cnt.set(i, (cnt.get(i) || 0) + 1);
    let best = -1, bs = -1;
    for (const [i, n] of cnt) { const s = n * 2 + (checkerSet.has(i) ? 1 : 0); if (s > bs) { bs = s; best = i; } }
    for (const e of left) if (e.by.includes(best)) e.ctrl = attackPath(e.N, best, e.sq);
    left = left.filter(e => !e.ctrl);
  }
  for (const e of escapes) { delete e.by; delete e.N; }

  // Quân tưởng cứu được: 0 = ăn quân chiếu, 1 = chặn giữa đường, 2 = dời ngòi Pháo.
  const tries = new Map();
  for (const m of pseudo(B, side)) {
    if (m[0] === ki) continue;
    let pr = 9;
    for (const ch of checkers) {
      if (m[1] === ch.from) pr = Math.min(pr, 0);
      else if (ch.between.includes(m[1])) pr = Math.min(pr, 1);
      else if (ch.screen === m[0]) pr = Math.min(pr, 2);
    }
    if (pr === 9 || !inCheck(apply(B, m), side)) continue;
    const old = tries.get(m[0]); if (!old || pr < old.pr) tries.set(m[0], { from: m[0], to: m[1], pr });
  }
  const defenders = [...tries.values()].sort((a, b) => a.pr - b.pr).slice(0, 2);
  return { ki, checkers, escapes, defenders };
}
