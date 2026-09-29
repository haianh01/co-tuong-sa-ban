'use strict';
const BX = 5.1, BZ = 5.7, BT = 0.55, R = 0.43, HT = 0.25, N = 36;
const K = (t, tx, tz, d, yaw, pitch, fx, fz, fr, dof) => ({ t, tx, tz, d, yaw, pitch, fx, fz, fr, dof });
let TL = null;
function build(cfg) {
  const { B: B0, side: s0 } = parseFEN(cfg.fen);
  const pace = cfg.pace || 1;
  let B = B0.slice(), side = s0;
  const pieces = [], motions = {};
  B.forEach((p, i) => { if (p) { pieces.push({ ...p, c: i % 9, r: (i / 9) | 0 }); motions[p.id] = []; } });
  const keys = [], ov = [], caps = [], hud = [], sounds = [], shakes = [], chapters = [], errors = [], tremors = [];
  const grave = { r: 0, b: 0 };
  const WIDE = (t, yaw) => K(t, 0, 0.35, 16.8, yaw, 54, 0, 0, 8, 0);
  keys.push(K(0, 0, 0, 27, -38, 28, 0, 0, 8, 0)); keys.push(WIDE(3.4, -12));
  chapters.push([0, 'Mở đầu']);
  let T = 3.6, moveNo = 1, flip = 1, over = false, stopped = false, result = '', nMoves = 0;
  let last = { x: 0, z: 0, fr: 8, yaw: -12, wide: true };
  const lines = cfg.script.split('\n');
  lines.forEach((line0, li) => {
    const line = line0.trim(); if (!line || line.startsWith('//') || stopped) return;
    const bar = line.indexOf('|');
    const mv = (bar < 0 ? line : line.slice(0, bar)).trim(), text = bar < 0 ? '' : line.slice(bar + 1).trim();
    const hold = clamp(1.3 + text.length * 0.058, 2.3, 8) * pace;
    if (!mv) {
      if (!text) return;
      caps.push({ a: T, b: T + hold, chip: '', text });
      if (last.wide) keys.push(WIDE(T + hold, -12 + flip * 7));
      else keys.push(K(T + hold, last.x, last.z + 0.3, clamp(last.fr * 2.6 + 5, 8, 17), last.yaw * 0.5, 48, last.x, last.z, last.fr + 0.9, 0));
      flip = -flip; T += hold; return;
    }
    if (over) { errors.push(`Dòng ${li + 1}: ván cờ đã kết thúc, bỏ qua “${mv}”.`); stopped = true; return; }
    let m;
    try { m = resolve(B, side, mv); } catch (e) { errors.push(`Dòng ${li + 1} (“${mv}”): ${e}. Các dòng sau bị bỏ qua.`); stopped = true; return; }
    const p = B[m[0]], cap = B[m[1]];
    const fc = m[0] % 9, fr = (m[0] / 9) | 0, tc = m[1] % 9, tr = (m[1] / 9) | 0;
    const fx = fc - 4, fz = fr - 4.5, tx = tc - 4, tz = tr - 4.5;
    const mx = (fx + tx) / 2, mz = (fz + tz) / 2, dist = Math.hypot(tx - fx, tz - fz);
    const FR = Math.max(2.3, dist / 2 + 1.6);
    let yaw, pitch;
    if (fc === tc) { yaw = 14 * flip; pitch = 34; } else if (fr === tr) { yaw = 55 * flip; pitch = 36; } else { yaw = -26 * flip; pitch = 44; }
    flip = -flip;
    const d = clamp(FR * 2.1 + 3.2, 6.5, 15.5);
    const tApp = T + 1.3 * pace, t0 = tApp + 0.15, dur = p.type === 'h' ? 0.9 : p.type === 'e' ? 0.8 : clamp(0.45 + dist * 0.07, 0.5, 1.0), t1 = t0 + dur;
    keys.push(K(tApp, mx, mz + 0.4, d, yaw, pitch, mx, mz, FR, 0));
    chapters.push([T, toNotation(B, side, m)]);
    // highlights
    ov.push({ k: 'ring', id: p.id, color: GOLD, a: T + 0.2, b: t1 + 0.5 });
    const pathWin = { a: T + 0.3, b: t0 + 0.25, p0: T + 0.3, p1: T + 1.15 };
    if (p.type === 'h') {
      const leg = Math.abs(tr - fr) === 2 ? [fc, fr + Math.sign(tr - fr)] : [fc + Math.sign(tc - fc), fr];
      const lx = leg[0] - 4, lz = leg[1] - 4.5;
      ov.push({ k: 'ringAt', x: lx, z: lz, r: 0.3, color: GREEN, a: T + 0.3, b: t1 + 0.3 });
      ov.push({ k: 'path', pts: [[fx, .02, fz], [lx, .02, lz], [tx, .02, tz]], color: GREEN, dash: 1, arrow: 1, ...pathWin });
      ov.push({ k: 'label', w: [lx, .05, lz], text: 'Chân Mã', color: GREEN, side: 'right', a: T + 0.5, b: t0 + 0.2 });
    } else if (p.type === 'e') {
      const ex = (fx + tx) / 2, ez = (fz + tz) / 2;
      ov.push({ k: 'ringAt', x: ex, z: ez, r: 0.26, color: GREEN, a: T + 0.3, b: t1 + 0.3 });
      ov.push({ k: 'path', pts: [[fx, .02, fz], [tx, .02, tz]], color: GREEN, dash: 1, arrow: 1, ...pathWin });
    } else {
      ov.push({ k: 'path', pts: [[fx, .02, fz], [tx - Math.sign(tx - fx) * 0.35, .02, tz - Math.sign(tz - fz) * 0.35]], color: GOLD, dash: 1, arrow: 1, ...pathWin });
    }
    if (p.type === 'c' && cap) {
      const dc = Math.sign(tc - fc), dr = Math.sign(tr - fr);
      for (let cc = fc + dc, rr = fr + dr; cc !== tc || rr !== tr; cc += dc, rr += dr) if (B[rr * 9 + cc]) {
        ov.push({ k: 'ringAt', x: cc - 4, z: rr - 4.5, r: 0.56, color: AMBER, a: T + 0.4, b: t1 + 0.3 });
        ov.push({ k: 'label', w: [cc - 4, .3, rr - 4.5], text: 'Ngòi Pháo', color: AMBER, side: 'up', a: T + 0.5, b: t0 + 0.2 });
        break;
      }
    }
    motions[p.id].push({ t0, t1, from: [fx, 0, fz], to: [tx, 0, tz], arc: p.type === 'h' ? 1.1 : p.type === 'e' ? 0.6 : 0.22 });
    const glide = p.type === 'h' || p.type === 'e' ? 'whoosh' : 'slide';
    sounds.push({ t: t0, s: 'lift', p: p.type }, { t: t0 + 0.04, s: glide, d: dur, p: p.type }, { t: t1, s: cap ? 'capture' : 'clack', p: p.type });
    shakes.push({ t: t1, a: cap ? 0.08 : 0.035 });
    if (cap) {
      tremors.push({ t: t1, x: tx, z: tz, a: 0.8 });
      ov.push({ k: 'x', x: tx, z: tz, a: T + 0.3, b: t0 + 0.4 });
      ov.push({ k: 'burst', x: tx, z: tz, t0: t1 });
      const slot = grave[cap.side]++;
      const gx = (cap.side === 'b' ? 1 : -1) * (6.3 + (slot % 2) * 1.0), gz = -4 + Math.floor(slot / 2) * 0.95;
      motions[cap.id].push({ t0: t1 + 0.05, t1: t1 + 1.0, from: [tx, 0, tz], to: [gx, -BT, gz], arc: 1.5 });
      sounds.push({ t: t1 + 0.1, s: 'whoosh', d: 0.8, p: cap.type }, { t: t1 + 1.0, s: 'drop', p: cap.type });
    }
    const Bprev = B;
    B = apply(B, m);
    const o = opp(side), att = attackers(B, o), chk = att.length > 0;
    const noMoves = legal(B, o).length === 0;
    let nota = toNotation(Bprev, side, m) + (noMoves && chk ? '#' : chk ? '+' : '');
    const chip = side === 'r' ? `${moveNo}. ${nota}` : `${moveNo}… ${nota}`;
    if (side === 'b') moveNo++;
    nMoves++;
    hud.push({ t: t1, text: chip, side });
    let hold2 = hold, fX = tx, fZ = tz, fR = Math.max(2.2, FR * 0.85);
    if (chk) {
      const ki = kingIdx(B, o), kx = ki % 9 - 4, kz = ((ki / 9) | 0) - 4.5;
      const kid = B[ki].id;
      for (const ai of att) {
        const ax = ai % 9 - 4, az = ((ai / 9) | 0) - 4.5;
        ov.push({ k: 'path', elev: 1, pts: [[ax, .32, az], [lerp(ax, kx, 0.88), .32, lerp(az, kz, 0.88)]], color: RED, arrow: 1, a: t1 + 0.1, b: t1 + hold + (noMoves ? 3.4 : 0), p0: t1 + 0.1, p1: t1 + 0.6 });
      }
      sounds.push({ t: t1 + 0.15, s: 'check' });
      tremors.push({ t: t1 + 0.12, x: kx, z: kz, a: 1, kid });
      ov.push({ k: 'ring', id: kid, color: RED, pulse: 1, a: t1, b: t1 + hold + (noMoves ? 3.4 : 0.2) });
      ov.push({ k: 'label', w: [kx, .32, kz], text: 'Chiếu!', color: RED, side: 'up', a: t1 + 0.2, b: t1 + Math.min(hold, 2.6) });
      fX = (tx + kx) / 2; fZ = (tz + kz) / 2; fR = Math.max(2.2, Math.hypot(tx - kx, tz - kz) / 2 + 1.4);
    }
    if (noMoves) {
      over = true; result = side === 'r' ? 'Đỏ thắng' : 'Đen thắng';
      ov.push({ k: 'mate', text: chk ? 'CHIẾU BÍ' : 'HẾT NƯỚC ĐI', a: t1 + 0.6, b: t1 + 4 });
      sounds.push({ t: t1 + 0.6, s: 'boom' }); shakes.push({ t: t1 + 0.6, a: 0.1 });
      hold2 = hold + 3.4;
      { const ki = kingIdx(B, o); tremors.push({ t: t1 + 0.6, x: ki % 9 - 4, z: ((ki / 9) | 0) - 4.5, a: 1.8, kid: B[ki].id }); }
    }
    const defText = `${NAME[p.type]} ${side === 'r' ? 'Đỏ' : 'Đen'} ${cap ? 'ăn ' + NAME[cap.type] : 'di chuyển'}${chk ? ', chiếu Tướng!' : '.'}`;
    caps.push({ a: T + 0.2, b: t1 + hold2, chip, text: text || defText });
    const yaw2 = yaw * 0.7;
    if (noMoves) keys.push(K(t1 + 0.9, fX, fZ + 0.4, clamp(fR * 2.3 + 3.6, 7.2, 16), yaw2, pitch + 6, fX, fZ, fR, 1));
    keys.push(K(t1 + hold2, fX, fZ + 0.4, clamp(fR * 2.3 + 3.2, 6.8, 16), yaw2, pitch + 8, fX, fZ, fR, noMoves ? 1 : 0));
    last = { x: fX, z: fZ, fr: fR, yaw: yaw2, wide: false };
    T = t1 + hold2; side = o;
  });
  keys.push(K(T + 1.8, 0, 0.35, 18.5, 26, 52, 0, 0, 8, 0));
  const DUR = T + 6;
  keys.push(K(DUR, 0, 0.35, 19.5, 34, 52, 0, 0, 8, 0));
  const endA = T + 1.2;
  const sub = `${s0 === 'r' ? 'Đỏ' : 'Đen'} đi trước${nMoves ? `, ${nMoves} nước` : ''}`;
  return { tremors, pieces, motions, keys, ov, caps, hud, sounds, shakes, chapters, errors, DUR, endA, title: cfg.title || 'Thế cờ', sub, result: result || (nMoves ? 'Hết thế cờ' : ''), moves: hud.map(h => h.text).join('   ') };
}
