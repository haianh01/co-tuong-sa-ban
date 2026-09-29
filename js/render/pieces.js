'use strict';
const THEMES = {
  wood: { side: ['#44240d', '#b4773f', '#dca468', '#8d5628', '#341b09'], rim: ['#e8b477', '#a86d38'], top: ['#fdebc8', '#eec48c', '#d69d5e'], red: '#a8231b', black: '#1f1a16', hi: 'rgba(255,245,225,.55)' },
  jade: { side: ['#0b3325', '#35886a', '#93d6b3', '#2a7154', '#082a1d'], rim: ['#a4dcc0', '#3f8c6b'], top: ['#f0fff6', '#bde9d1', '#80c4a2'], red: '#a3231a', black: '#0f2b20', hi: 'rgba(255,255,255,.5)' },
  marble: { side: ['#3c3c3a', '#b8b6ae', '#f1efe8', '#94928a', '#2e2e2c'], rim: ['#f4f2ec', '#b2b0a8'], top: ['#ffffff', '#efede6', '#cfccc2'], red: '#b3261e', black: '#1b1b1b', hi: 'rgba(255,255,255,.6)' }
};
let THEME = THEMES.wood, SHOW_SUBS = false;
const COS = [], SIN = []; for (let i = 0; i < N; i++) { COS.push(Math.cos(i / N * Math.PI * 2)); SIN.push(Math.sin(i / N * Math.PI * 2)); }
const onBoardXZ = (x, z) => Math.abs(x) <= BX && Math.abs(z) <= BZ;
function pieceAt(id, p, t) {
  let x = p.c - 4, y = 0, z = p.r - 4.5;
  for (const m of TL.motions[id]) {
    if (t >= m.t1) { [x, y, z] = m.to; }
    else if (t > m.t0) { const u = ease((t - m.t0) / (m.t1 - m.t0)); x = lerp(m.from[0], m.to[0], u); y = lerp(m.from[1], m.to[1], u) + m.arc * 4 * u * (1 - u); z = lerp(m.from[2], m.to[2], u); break; }
    else break;
  }
  return { x, y, z };
}
// Pieces on the board jump and rattle when a capture or check lands; the shock spreads out from the impact point.
function tremor(id, pos, t) {
  if (!onBoardXZ(pos.x, pos.z) || pos.y > 0.05) return pos;
  let { x, y, z } = pos; const h = (id.charCodeAt(id.length - 1) * 7.3 + id.length * 3.1) % 6.28;
  for (const tr of TL.tremors) {
    const d = Math.hypot(pos.x - tr.x, pos.z - tr.z), isK = tr.kid === id, len = isK ? 1.3 : 0.7;
    const dt = t - tr.t - d * 0.045; if (dt <= 0 || dt >= len) continue;
    const e = tr.a * Math.pow(1 - dt / len, 2) * (isK ? 2.2 : 1 / (1 + d * 0.3));
    y += 0.07 * e * Math.abs(Math.sin(dt * 34 + h));
    x += 0.03 * e * Math.sin(dt * 51 + h); z += 0.03 * e * Math.cos(dt * 47 + h * 1.7);
  }
  return { x, y, z };
}
function drawPieceShadow(c, pos) {
  const ground = onBoardXZ(pos.x, pos.z) ? 0 : -BT, h = Math.max(0, pos.y - ground);
  const off = 0.1 + h * 0.35, sx = pos.x + off * 0.8, sz = pos.z + off, s = scaleAt(sx, ground, sz);
  shadowFill(c, ringPts(sx, ground + 0.003, sz, R * (1.04 + h * 0.25), 24), s * (0.12 + h * 0.2), 0.62 / (1 + h * 1.2));
  if (h < 0.05) shadowFill(c, ringPts(pos.x + 0.02, ground + 0.003, pos.z + 0.03, R * 1.01, 24), s * 0.04, 0.5);
}
function drawPiece(c, pc, pos, alpha = 1) {
  if (alpha <= 0.01) return;
  const th = THEME, yb = pos.y, yt = yb + HT, yt2 = yt + 0.025;
  const bot = [], top = [], top2 = [], ring = [];
  for (let i = 0; i < N; i++) {
    bot.push(P(pos.x + R * COS[i], yb, pos.z + R * SIN[i])); top.push(P(pos.x + R * COS[i], yt, pos.z + R * SIN[i]));
    top2.push(P(pos.x + R * .88 * COS[i], yt2, pos.z + R * .88 * SIN[i])); ring.push(P(pos.x + R * .74 * COS[i], yt2, pos.z + R * .74 * SIN[i]));
  }
  const hl = hull(bot.concat(top)); let minx = Infinity, maxx = -Infinity; for (const q of hl) { minx = Math.min(minx, q.x); maxx = Math.max(maxx, q.x); }
  c.save(); c.globalAlpha = alpha;
  const sg = c.createLinearGradient(minx, 0, maxx, 0); th.side.forEach((col, i) => sg.addColorStop([0, .26, .45, .78, 1][i], col));
  poly(c, hl); c.fillStyle = sg; c.fill();
  const tc = P(pos.x, yt, pos.z), s = cam.F / tc.z;
  const rg = c.createLinearGradient(tc.x - s * R, tc.y - s * R * .6, tc.x + s * R, tc.y + s * R * .6); rg.addColorStop(0, th.rim[0]); rg.addColorStop(1, th.rim[1]);
  poly(c, top); c.fillStyle = rg; c.fill(); c.lineWidth = Math.max(1, s * 0.012); c.strokeStyle = 'rgba(255,245,225,.55)'; c.stroke();
  const t2 = P(pos.x, yt2, pos.z), tg = c.createRadialGradient(t2.x - s * R * .3, t2.y - s * R * .35, s * R * .05, t2.x, t2.y, s * R * 1.05);
  tg.addColorStop(0, th.top[0]); tg.addColorStop(.6, th.top[1]); tg.addColorStop(1, th.top[2]);
  poly(c, top2); c.fillStyle = tg; c.fill();
  const col = pc.side === 'r' ? th.red : th.black;
  poly(c, ring); c.globalAlpha = alpha * .85; c.strokeStyle = col; c.lineWidth = Math.max(1, s * 0.02); c.stroke();
  c.globalAlpha = alpha;
  planeT(c, pos.x, yt2, pos.z, cam.yaw); c.font = `900 46px ${CJK}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const chr = CH[pc.side][pc.type];
  c.fillStyle = th.hi; c.fillText(chr, 1.6, 3.8); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillText(chr, -1, 1); c.fillStyle = col; c.fillText(chr, 0, 2);
  c.setTransform(1, 0, 0, 1, 0, 0);
  const sp = c.createRadialGradient(t2.x - s * R * .38, t2.y - s * R * .3, 0, t2.x - s * R * .38, t2.y - s * R * .3, s * R * .45);
  sp.addColorStop(0, 'rgba(255,255,255,.3)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sp; poly(c, top2); c.fill();
  c.restore();
}
const CUP = { x: -7.4, z: 4.4 };
function drawCup(c) {
  const y0 = -BT, s = scaleAt(CUP.x, y0, CUP.z);
  shadowFill(c, ringPts(CUP.x + .25, y0 + .003, CUP.z + .3, 0.95, 28), s * 0.25, 0.6);
  const cyl = (rb, rt, yb, yt, stops) => {
    const b = [], tp = []; for (let i = 0; i < N; i++) { b.push(P(CUP.x + rb * COS[i], yb, CUP.z + rb * SIN[i])); tp.push(P(CUP.x + rt * COS[i], yt, CUP.z + rt * SIN[i])); }
    const hl = hull(b.concat(tp)); let a = Infinity, z = -Infinity; for (const q of hl) { a = Math.min(a, q.x); z = Math.max(z, q.x); }
    const g = c.createLinearGradient(a, 0, z, 0); stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col)); poly(c, hl); c.fillStyle = g; c.fill(); return tp;
  };
  const glaze = ['#28453a', '#6f9f8c', '#bfe0d2', '#5f8f7c', '#20382f'];
  const st = cyl(0.9, 0.95, y0, y0 + .07, glaze); poly(c, st); c.fillStyle = '#a9cfbf'; c.fill();
  const ct = cyl(0.36, 0.56, y0 + .07, y0 + .72, glaze); poly(c, ct); c.fillStyle = '#d7ece3'; c.fill();
  poly(c, ringPts(CUP.x, y0 + .72, CUP.z, 0.5, N)); c.fillStyle = '#5e8a79'; c.fill();
  const tea = ringPts(CUP.x, y0 + .6, CUP.z, 0.46, N); poly(c, tea); const tp = P(CUP.x, y0 + .6, CUP.z);
  const tg = c.createRadialGradient(tp.x - s * .12, tp.y - s * .08, 0, tp.x, tp.y, s * .5); tg.addColorStop(0, '#d49a3a'); tg.addColorStop(1, '#6e3d0c'); c.fillStyle = tg; c.fill();
}
