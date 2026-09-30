'use strict';
const MARKS = [[1, 2], [7, 2], [1, 7], [7, 7], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]];
function woodGrain(c, x0, x1, z0, z1, n, dark, light, s0, seed) {
  for (let i = 0; i < n; i++) {
    const zc = z0 + (i + 0.5) * (z1 - z0) / n; c.beginPath();
    for (let k = 0; k <= 30; k++) { const x = x0 + k * (x1 - x0) / 30, z = zc + 0.07 * Math.sin(x * 0.9 + i * 1.3 + seed) + 0.025 * Math.sin(x * 3.7 + i * 0.7), q = P(x, 0, z); k ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }
    c.strokeStyle = i % 3 === 0 ? dark : light; c.lineWidth = Math.max(1, s0 * (i % 3 === 0 ? 0.03 : 0.02)); c.stroke();
  }
}
let RIVER_HIDE = { x: null, a: 0 };
function drawBoard(c) {
  const s0 = scaleAt(0, 0, 0);
  shadowFill(c, [P(-BX - .2, -BT, -BZ), P(BX + .35, -BT, -BZ), P(BX + .6, -BT, BZ + .55), P(-BX - .15, -BT, BZ + .55)], s0 * 0.6, 0.9);
  const faces = [
    { n: [0, 0, 1], pts: [[-BX, 0, BZ], [BX, 0, BZ], [BX, -BT, BZ], [-BX, -BT, BZ]] },
    { n: [0, 0, -1], pts: [[BX, 0, -BZ], [-BX, 0, -BZ], [-BX, -BT, -BZ], [BX, -BT, -BZ]] },
    { n: [1, 0, 0], pts: [[BX, 0, BZ], [BX, 0, -BZ], [BX, -BT, -BZ], [BX, -BT, BZ]] },
    { n: [-1, 0, 0], pts: [[-BX, 0, -BZ], [-BX, 0, BZ], [-BX, -BT, BZ], [-BX, -BT, -BZ]] }];
  for (const f of faces) {
    const cx = (f.pts[0][0] + f.pts[1][0]) / 2, cz = (f.pts[0][2] + f.pts[1][2]) / 2;
    if (f.n[0] * (cam.pos[0] - cx) + f.n[1] * (cam.pos[1] + BT / 2) + f.n[2] * (cam.pos[2] - cz) <= 0) continue;
    const sp = f.pts.map(p => P(p[0], p[1], p[2]));
    const lit = f.n[2] > 0 ? 1 : f.n[0] > 0 ? 0.78 : 0.62;
    const g = c.createLinearGradient((sp[0].x + sp[1].x) / 2, (sp[0].y + sp[1].y) / 2, (sp[2].x + sp[3].x) / 2, (sp[2].y + sp[3].y) / 2);
    g.addColorStop(0, `rgb(${128 * lit | 0},${62 * lit | 0},${30 * lit | 0})`); g.addColorStop(.25, `rgb(${96 * lit | 0},${44 * lit | 0},${20 * lit | 0})`); g.addColorStop(1, `rgb(${36 * lit | 0},${15 * lit | 0},${6 * lit | 0})`);
    poly(c, sp); c.fillStyle = g; c.fill();
    c.beginPath(); c.moveTo(sp[0].x, sp[0].y); c.lineTo(sp[1].x, sp[1].y); c.strokeStyle = 'rgba(255,200,150,.5)'; c.lineWidth = Math.max(1, s0 * 0.025); c.stroke();
  }
  // rosewood frame
  const top = [P(-BX, 0, -BZ), P(BX, 0, -BZ), P(BX, 0, BZ), P(-BX, 0, BZ)];
  poly(c, top); const fg = c.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
  fg.addColorStop(0, '#8a4524'); fg.addColorStop(1, '#4a200e'); c.fillStyle = fg; c.fill();
  c.save(); poly(c, top); c.clip(); woodGrain(c, -BX, BX, -BZ, BZ, 40, 'rgba(30,8,0,.3)', 'rgba(255,190,140,.07)', s0, 4); c.restore();
  // inlay panel
  const IX = 4.62, IZ = 5.12, inl = [P(-IX, 0, -IZ), P(IX, 0, -IZ), P(IX, 0, IZ), P(-IX, 0, IZ)];
  poly(c, inl); c.fillStyle = '#dcae6c'; c.fill();
  const ig = c.createLinearGradient(inl[0].x, inl[0].y, inl[2].x, inl[2].y); ig.addColorStop(0, 'rgba(255,238,200,.3)'); ig.addColorStop(1, 'rgba(110,60,20,.25)'); c.fillStyle = ig; c.fill();
  c.save(); poly(c, inl); c.clip(); woodGrain(c, -IX, IX, -IZ, IZ, 56, 'rgba(125,70,28,.2)', 'rgba(255,232,190,.1)', s0, 0);
  const rv = [P(-4, 0, -0.5), P(4, 0, -0.5), P(4, 0, 0.5), P(-4, 0, 0.5)]; poly(c, rv); c.fillStyle = 'rgba(110,62,24,.12)'; c.fill();
  c.restore();
  poly(c, inl); c.strokeStyle = '#d6ac52'; c.lineWidth = Math.max(1, s0 * 0.04); c.stroke();
  c.strokeStyle = 'rgba(40,14,4,.6)'; c.lineWidth = Math.max(1, s0 * 0.015); c.stroke();
  // engraved grid
  const lw = Math.max(1, s0 * 0.026), y = 0.001;
  const gridPath = () => {
    c.beginPath();
    const seg = (a, b) => { const p = P(a[0], y, a[1]), q = P(b[0], y, b[1]); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); };
    for (let r = 0; r < 10; r++) seg([-4, r - 4.5], [4, r - 4.5]);
    for (let col = 0; col < 9; col++) { const x = col - 4; if (col === 0 || col === 8) seg([x, -4.5], [x, 4.5]); else { seg([x, -4.5], [x, -.5]); seg([x, .5], [x, 4.5]); } }
    seg([-1, -4.5], [1, -2.5]); seg([1, -4.5], [-1, -2.5]); seg([-1, 2.5], [1, 4.5]); seg([1, 2.5], [-1, 4.5]);
    const g0 = 0.08, L = 0.2;
    for (const [mc_, mr] of MARKS) { const x = mc_ - 4, z = mr - 4.5; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { if ((mc_ === 0 && sx < 0) || (mc_ === 8 && sx > 0)) continue; const a = P(x + sx * g0, y, z + sz * (g0 + L)), b = P(x + sx * g0, y, z + sz * g0), d = P(x + sx * (g0 + L), y, z + sz * g0); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); } }
  };
  c.save(); c.lineCap = 'round';
  c.translate(0, lw * 0.8); gridPath(); c.strokeStyle = 'rgba(255,236,200,.4)'; c.lineWidth = lw; c.stroke();
  c.setTransform(1, 0, 0, 1, 0, 0); gridPath(); c.strokeStyle = 'rgba(58,26,8,.9)'; c.lineWidth = lw; c.stroke();
  const fr = [P(-4.3, y, -4.8), P(4.3, y, -4.8), P(4.3, y, 4.8), P(-4.3, y, 4.8)]; poly(c, fr); c.lineWidth = lw * 2.2; c.stroke();
  c.restore();
  // river text, carved
  c.save(); c.font = `900 60px ${CJK}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const [x, txt] of [[-2, '楚　河'], [2, '漢　界']]) {
    c.globalAlpha = RIVER_HIDE.x === x ? 1 - RIVER_HIDE.a : 1; // nhường chỗ cho chữ 將死
    planeT(c, x, y, 0); c.fillStyle = 'rgba(255,236,200,.45)'; c.fillText(txt, 2, 7); c.fillStyle = 'rgba(70,32,10,.8)'; c.fillText(txt, 0, 4);
  }
  c.restore();
  // brass studs
  for (const [x, z] of [[-4.86, -5.42], [4.86, -5.42], [4.86, 5.42], [-4.86, 5.42]]) {
    const q = P(x, 0.005, z), s = cam.F / q.z, g = c.createRadialGradient(q.x - s * .04, q.y - s * .04, 0, q.x, q.y, s * .13);
    g.addColorStop(0, '#fff0bf'); g.addColorStop(.5, '#d4a64a'); g.addColorStop(1, '#6e4c14');
    c.fillStyle = g; poly(c, ringPts(x, 0.005, z, 0.12, 16)); c.fill();
  }
}
