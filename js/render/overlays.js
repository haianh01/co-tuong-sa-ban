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
