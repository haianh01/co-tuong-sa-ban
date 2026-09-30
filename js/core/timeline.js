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
    const net = noMoves && chk ? mateScene(B, o, p.id, t1, pace, ov, sounds) : null;
    if (net) {
      const ki = kingIdx(B, o);
      tremors.push({ t: t1 + 0.12, x: ki % 9 - 4, z: ((ki / 9) | 0) - 4.5, a: 1, kid: B[ki].id });
      sounds.push({ t: t1 + 0.15, s: 'check' });
      ({ x: fX, z: fZ, r: fR } = net.focus);
    } else if (chk) {
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
      const tm = net ? net.end : t1 + 0.6;
      ov.push({ k: 'mate', text: chk ? '將死' : '困斃', x: net ? net.river : riverSpot(B, []), a: tm, b: tm + 3.4 }); // chiếu bí / hết nước đi, viết trên sông
      sounds.push({ t: tm, s: 'boom' }); shakes.push({ t: tm, a: 0.1 });
      hold2 = Math.max(hold, tm - t1) + 3.4;
      if (net) net.hold(t1 + hold2);
      { const ki = kingIdx(B, o); tremors.push({ t: tm, x: ki % 9 - 4, z: ((ki / 9) | 0) - 4.5, a: 1.8, kid: B[ki].id }); }
    }
    const defText = `${NAME[p.type]} ${side === 'r' ? 'Đỏ' : 'Đen'} ${cap ? 'ăn ' + NAME[cap.type] : 'di chuyển'}${chk ? ', chiếu Tướng!' : '.'}`;
    caps.push({ a: T + 0.2, b: t1 + hold2, chip, text: text || defText });
    const yaw2 = yaw * 0.7;
    if (noMoves) keys.push(K(t1 + 0.9, fX, fZ + 0.4, clamp(fR * 2.3 + 3.6, 7.2, 16), yaw2, pitch + 6, fX, fZ, fR, 1));
    // Lưới bí: giữ làm mờ hậu cảnh trong lúc kể, tắt đi khi hiện chữ 將死 để chữ trên sông rõ nét.
    if (net) { const tm = net.end, u = (tm - t1 - 0.9) / (hold2 - 0.9), K2 = (tt, dof) => K(tt, fX, fZ + 0.4, clamp(fR * 2.3 + lerp(3.6, 3.2, u), 6.8, 16), yaw2, pitch + lerp(6, 8, u), fX, fZ, fR, dof);
      keys.push(K2(tm, 1), K2(tm + 0.6, 0)); }
    keys.push(K(t1 + hold2, fX, fZ + 0.4, clamp(fR * 2.3 + 3.2, 6.8, 16), yaw2, pitch + 8, fX, fZ, fR, noMoves && !net ? 1 : 0));
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

// Chiếu bí: vẽ lưới bí theo thứ tự kể chuyện. Quân vừa đi có vầng sáng xanh, các quân không
// liên quan tối đi; tia chiếu chạy tới Tướng; bóng Tướng thử lần lượt từng ô chạy và bị gạch X (ô có
// quân nhà thì xám); quân tưởng cứu được thử đỡ và bị gạch X; cuối cùng mới hiện chữ 將死 giữa sông.
// Các lớp kéo dài tới hết cảnh (hold) để khung hình cuối còn đủ cả lưới.
function mateScene(B, side, moverId, t1, pace, ov, sounds) {
  const net = mateNet(B, side), XZ = i => [i % 9 - 4, ((i / 9) | 0) - 4.5], Y = 0.32;
  const kid = B[net.ki].id, [kx, kz] = XZ(net.ki), late = [], ids = new Set([kid, moverId]), cells = [[kx, kz]];
  const push = o => { ov.push(o); late.push(o); return o; };
  // Đường tia: đi qua chân Mã nếu có, dừng trước ô đích một chút để mũi tên không đâm vào quân.
  const beam = (pa, stop) => {
    const pts = [pa.from, ...(pa.leg != null ? [pa.leg] : []), pa.to].map(i => { const [x, z] = XZ(i); return [x, Y, z]; });
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    pts[pts.length - 1] = [lerp(a[0], b[0], stop), Y, lerp(a[2], b[2], stop)];
    return pts;
  };
  push({ k: 'aura', id: moverId, a: t1 + 0.05, b: 0 });
  push({ k: 'cell', x: kx, z: kz, color: RED, strong: 1, pulse: 1, a: t1 + 0.1, b: 0 });
  for (const ch of net.checkers) {
    ids.add(B[ch.from].id);
    push({ k: 'path', elev: 1, w: 0.075, pts: beam(ch, 0.86), color: RED, arrow: 1, a: t1 + 0.1, b: 0, p0: t1 + 0.1, p1: t1 + 0.6 });
    if (ch.screen != null) { ids.add(B[ch.screen].id); push({ k: 'ring', id: B[ch.screen].id, color: AMBER, a: t1 + 0.4, b: 0 }); }
  }
  const STEP = 0.8 * pace;
  let tg = t1 + 0.9 * pace;
  const ctrlRing = new Set();
  for (const e of net.escapes) {
    const [sx, sz] = XZ(e.sq); cells.push([sx, sz]);
    if (e.own != null) {
      const id = B[e.own].id; ids.add(id);
      push({ k: 'cell', x: sx, z: sz, color: '#9aa4ae', a: tg, b: 0 });
      push({ k: 'ring', id, color: '#b9c2cc', a: tg, b: 0 });
      sounds.push({ t: tg, s: 'clack', p: 'a' });
      tg += STEP * 0.6; continue;
    }
    const cid = B[e.ctrl.from].id; ids.add(cid);
    if (e.ctrl.screen != null && B[e.ctrl.screen]) ids.add(B[e.ctrl.screen].id);
    ov.push({ k: 'ghost', id: kid, from: [kx, 0, kz], to: [sx, 0, sz], m0: tg, m1: tg + 0.3 * pace, a: tg, b: tg + STEP * 1.1 });
    sounds.push({ t: tg, s: 'whoosh', d: 0.3, p: 'k' });
    if (!ctrlRing.has(cid)) { ctrlRing.add(cid); push({ k: 'ring', id: cid, color: AMBER, a: tg + 0.25 * pace, b: 0 }); }
    // Quân khống chế cũng là quân đang chiếu: tia đỏ đã vẽ tới Tướng, chỉ nối tiếp phần sau lưng Tướng (nếu có).
    const via = net.checkers.some(ch => ch.from === e.ctrl.from) ? (e.ctrl.between.includes(net.ki) ? { from: net.ki, to: e.sq } : null) : e.ctrl;
    if (via) push({ k: 'path', elev: 1, w: 0.065, pts: beam(via, 0.8), color: AMBER, dash: 1, arrow: 1, a: tg + 0.25 * pace, b: 0, p0: tg + 0.25 * pace, p1: tg + 0.55 * pace });
    push({ k: 'x', x: sx, z: sz, a: tg + 0.55 * pace, b: 0 });
    push({ k: 'cell', x: sx, z: sz, color: RED, a: tg + 0.55 * pace, b: 0 });
    sounds.push({ t: tg + 0.55 * pace, s: 'clack', p: 'k' });
    tg += STEP * 1.15;
  }
  for (const d of net.defenders) {
    const [fx, fz] = XZ(d.from), [dx, dz] = XZ(d.to);
    ov.push({ k: 'ghost', id: B[d.from].id, from: [fx, 0, fz], to: [dx, 0, dz], m0: tg, m1: tg + 0.35 * pace, a: tg, b: tg + STEP * 1.2 });
    sounds.push({ t: tg, s: 'whoosh', d: 0.35, p: B[d.from].type });
    push({ k: 'x', x: dx, z: dz, a: tg + 0.45 * pace, b: 0 });
    sounds.push({ t: tg + 0.45 * pace, s: 'clack', p: B[d.from].type });
    tg += STEP * 1.3;
  }
  // Những ô cần giữ sáng khi làm tối phần còn lại của bàn.
  const beams = late.filter(o => o.k === 'path').map(o => o.pts), river = riverSpot(B, beams);
  push({ k: 'dim', ids: [...ids], cells, river, a: t1 + 0.3, b: 0 });
  // Khung camera: ôm hết Tướng, quân chiếu, quân khống chế, các ô chạy và chỗ viết chữ trên sông.
  const pts = cells.concat([[river, 0]], net.checkers.map(c => XZ(c.from)), net.escapes.filter(e => e.ctrl).map(e => XZ(e.ctrl.from)));
  const xs = pts.map(q => q[0]), zs = pts.map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return {
    river, end: tg + 0.2, focus: { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.max(2.4, Math.hypot(x1 - x0, z1 - z0) / 2 + 1.3) },
    hold: tEnd => { for (const o of late) o.b = tEnd + 1; }
  };
}

// Chỗ viết chữ 將死 trên sông: giữa sông (giữa 楚河 và 漢界); nếu ở đó có quân đứng sát bờ sông hay tia
// cắt ngang thì viết thay vào chỗ chữ 楚河 hoặc 漢界 (chữ gốc mờ đi trong lúc đó).
function riverSpot(B, beams) {
  const cost = x => {
    let n = 0;
    for (const r of [4, 5]) for (let c = 0; c < 9; c++) if (B[r * 9 + c] && Math.abs(c - 4 - x) < 0.95) n += 2;
    for (const pts of beams) for (let i = 1; i < pts.length; i++) {
      const [x1, , z1] = pts[i - 1], [x2, , z2] = pts[i];
      if ((z1 - 0.3) * (z2 - 0.3) < 0 || (z1 + 0.3) * (z2 + 0.3) < 0 || Math.abs(z1) < 0.3) {
        const u = z2 === z1 ? 0 : clamp((0 - z1) / (z2 - z1)), xc = lerp(x1, x2, u);
        if (Math.abs(xc - x) < 0.7) n += 1;
      }
    }
    return n;
  };
  return [0, -2, 2].reduce((best, x) => (cost(x) < cost(best) ? x : best));
}
