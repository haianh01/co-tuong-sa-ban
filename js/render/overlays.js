'use strict';
function drawRing(c, x, z, r, color, a, yy = 0.015) {
  if (a <= 0.01) return; const pts = ringPts(x, yy, z, r, 44), s = scaleAt(x, yy, z);
  c.save(); poly(c, pts); c.globalAlpha = a * 0.2; c.fillStyle = color; c.fill();
  c.globalAlpha = a; c.lineWidth = Math.max(1.5, s * 0.05); c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = s * 0.25; c.stroke(); c.restore();
}
function drawX(c, x, z, a) {
  if (a <= 0.01) return; c.save(); planeT(c, x, 0.3, z); c.globalAlpha = a;
  c.strokeStyle = '#ff5a45'; c.lineWidth = 7; c.lineCap = 'round'; c.shadowColor = '#ff5a45'; c.shadowBlur = 14;
  c.beginPath(); c.moveTo(-24, -24); c.lineTo(24, 24); c.moveTo(24, -24); c.lineTo(-24, 24); c.stroke(); c.restore();
}
function partial(pts, prog) {
  if (prog >= 1) return pts; const lens = []; let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); lens.push(l); L += l; }
  let rem = L * prog; const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const l = lens[i - 1]; if (rem >= l) { out.push(pts[i]); rem -= l; } else { const u = l ? rem / l : 0; out.push([0, 1, 2].map(k => lerp(pts[i - 1][k], pts[i][k], u))); break; } }
  return out;
}
function glowPath(c, pts, o, t) {
  const { color, alpha = 1, w = 0.06, prog = 1, dash = 0, arrow = 0 } = o; if (alpha <= 0.01 || prog <= 0.001) return;
  const wp = partial(pts, prog); if (wp.length < 2) return;
  const sp = wp.map(q => P(q[0], q[1], q[2])), mid = sp[Math.floor(sp.length / 2)], lw = Math.max(1.5, cam.F / mid.z * w);
  c.save(); c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); sp.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y));
  c.shadowColor = color; c.shadowBlur = lw * 3; c.strokeStyle = color; c.lineWidth = lw;
  if (dash) { c.setLineDash([lw * 2, lw * 1.6]); c.lineDashOffset = -t * lw * 6; }
  c.stroke(); c.shadowBlur = 0; c.setLineDash([]); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = lw * 0.35; c.stroke();
  if (arrow && prog > 0.95) {
    const A = sp[sp.length - 2], B = sp[sp.length - 1], ang = Math.atan2(B.y - A.y, B.x - A.x), hs = lw * 3.2;
    c.beginPath(); c.moveTo(B.x + Math.cos(ang) * hs * .6, B.y + Math.sin(ang) * hs * .6);
    c.lineTo(B.x + Math.cos(ang + 2.5) * hs, B.y + Math.sin(ang + 2.5) * hs); c.lineTo(B.x + Math.cos(ang - 2.5) * hs, B.y + Math.sin(ang - 2.5) * hs);
    c.closePath(); c.fillStyle = color; c.shadowColor = color; c.shadowBlur = lw * 3; c.fill();
  }
  c.restore();
}
function burst(c, x, z, t0, t) {
  const u = (t - t0) / 0.8; if (u < 0 || u >= 1) return; c.save();
  c.globalAlpha = (1 - u) * .7; poly(c, ringPts(x, .01, z, .35 + u * 1.1, 40)); c.strokeStyle = '#ffd9a0'; c.lineWidth = Math.max(1, scaleAt(x, 0, z) * .035 * (1 - u)); c.stroke();
  for (let i = 0; i < 18; i++) {
    const ang = i / 18 * Math.PI * 2 + rand(i + t0) * .5, sp = .4 + rand(i * 3 + t0) * .9;
    const q = P(x + Math.cos(ang) * (.3 + sp * u), .05 + rand(i * 7 + t0) * .6 * Math.sin(u * Math.PI), z + Math.sin(ang) * (.3 + sp * u)), s = cam.F / q.z;
    c.globalAlpha = (1 - u) * .85; c.beginPath(); c.arc(q.x, q.y, Math.max(.8, s * .03 * (1 - u * .6)), 0, Math.PI * 2); c.fillStyle = i % 3 ? '#e9c89a' : '#fff1d6'; c.fill();
  }
  c.restore();
}
function label(c, w, text, a, side, accent) {
  a *= 1 - mb; if (a <= 0.01) return;
  const p = P(w[0], w[1], w[2]), fs = U * 0.03;
  c.save(); c.globalAlpha = a; c.font = `700 ${fs}px ${UI}`;
  const tw = c.measureText(text).width, pw = tw + fs * 1.3, ph = fs * 1.85, gap = fs * 1.7;
  let bx, by;
  if (side === 'up') { bx = p.x - pw / 2; by = p.y - gap - ph; } else if (side === 'down') { bx = p.x - pw / 2; by = p.y + gap; }
  else if (side === 'left') { bx = p.x - gap - pw; by = p.y - ph / 2; } else { bx = p.x + gap; by = p.y - ph / 2; }
  bx = clamp(bx, 6, W - pw - 6); by = clamp(by, BAR + 6, H - BAR - ph - 6);
  c.strokeStyle = accent; c.lineWidth = Math.max(1, H / 700);
  c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(clamp(p.x, bx, bx + pw), clamp(p.y, by, by + ph)); c.stroke();
  c.beginPath(); c.arc(p.x, p.y, fs * .2, 0, Math.PI * 2); c.fillStyle = accent; c.fill();
  rr(c, bx, by, pw, ph, ph / 2); c.fillStyle = 'rgba(14,10,7,.86)'; c.fill(); c.stroke();
  c.fillStyle = '#fff6e6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, bx + pw / 2, by + ph / 2 + fs * .04);
  c.restore();
}
// Ô sáng trên mặt bàn (lưới chiếu bí): ô Tướng đỏ đậm, ô chạy bị khống chế đỏ nhạt, ô quân nhà chặn xám.
function drawCell(c, x, z, color, a, strong) {
  if (a <= 0.01) return; const h = 0.43, pts = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dz]) => P(x + dx, 0.012, z + dz)), s = scaleAt(x, 0, z);
  c.save(); poly(c, pts); c.globalAlpha = a * (strong ? 0.5 : 0.3); c.fillStyle = color; c.fill();
  c.globalAlpha = a * (strong ? 1 : 0.7); c.lineWidth = Math.max(1.2, s * (strong ? 0.045 : 0.03)); c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = s * (strong ? 0.4 : 0.2); c.stroke(); c.restore();
}
// Làm tối cả khung hình trừ các quân và ô trong lưới bí (vẽ qua canvas phụ để khoét lỗ mềm).
function drawDim(c, o, byId, t) {
  const a = win(t, o.a, o.b, 0.6) * 0.7; if (a <= 0.01) return;
  mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalCompositeOperation = 'source-over'; mc.clearRect(0, 0, W, H);
  mc.fillStyle = `rgba(6,3,1,${a.toFixed(3)})`; mc.fillRect(0, 0, W, H);
  mc.globalCompositeOperation = 'destination-out';
  const hole = (x, y, z, r) => {
    const q = P(x, y, z), rad = cam.F / q.z * r, g = mc.createRadialGradient(q.x, q.y, rad * 0.5, q.x, q.y, rad);
    g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)'); mc.fillStyle = g; mc.beginPath(); mc.arc(q.x, q.y, rad, 0, Math.PI * 2); mc.fill();
  };
  for (const id of o.ids) { const p = byId[id]; if (p) hole(p.x, p.y + HT * 0.5, p.z, 0.85); }
  for (const [x, z] of o.cells) hole(x, 0.05, z, 0.8);
  if (o.river != null) hole(o.river, 0.02, 0, 0.75); // chữ 將死 trên sông
  mc.globalCompositeOperation = 'source-over';
  c.drawImage(maskCv, 0, 0);
}
// Bóng quân (trong suốt) thử đi một nước: Tướng thử chạy, quân thử đỡ.
function drawGhost(c, pc, o, t) {
  const a = win(t, o.a, o.b, 0.25); if (a <= 0.01) return;
  const u = ease(clamp((t - o.m0) / Math.max(0.01, o.m1 - o.m0)));
  drawPiece(c, pc, { x: lerp(o.from[0], o.to[0], u), y: 0.35 * 4 * u * (1 - u), z: lerp(o.from[2], o.to[2], u) }, a * 0.5);
}
// Vầng sáng xanh quanh quân vừa đi nước chiếu bí (chỉ là vòng sáng, không che mặt quân).
function drawAura(c, pos, a, t) {
  if (a <= 0.01) return; const yy = pos.y + HT + 0.03;
  drawRing(c, pos.x, pos.z, 0.6 + 0.04 * Math.sin(t * 6), BLUE, a, yy);
  drawRing(c, pos.x, pos.z, 0.78 + 0.06 * Math.sin(t * 6 + 1.5), BLUE, a * 0.45, yy);
}
// Chữ 將死 (chiếu bí) nhỏ, khắc trên sông (chỗ trống do riverSpot chọn), vẽ dưới quân nên không che quân nào.
function drawRiverMark(c, text, x, a, grow) {
  if (a <= 0.01) return;
  c.save(); planeT(c, x, 0.014, 0); c.scale(lerp(1.3, 1, grow), lerp(1.3, 1, grow));
  c.font = `900 52px ${CJK}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha = a;
  c.shadowColor = RED; c.shadowBlur = 18; c.fillStyle = RED; c.fillText(text, 0, 3);
  c.shadowBlur = 0; c.fillStyle = 'rgba(255,225,205,.35)'; c.fillText(text, -1, 1);
  c.restore();
}
