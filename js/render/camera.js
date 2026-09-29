'use strict';
const stage = document.getElementById('stage');
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const sceneCv = document.createElement('canvas'), sc = sceneCv.getContext('2d');
const smallCv = document.createElement('canvas'), smc = smallCv.getContext('2d');
const maskCv = document.createElement('canvas'), mc = maskCv.getContext('2d');
let W = 2, H = 2, U = 2, DPR = 1, dirty = true, forceSize = null, BAR = 0;
const blurOK = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 9; const x = c.getContext('2d'); x.filter = 'blur(2px)'; x.fillStyle = '#000'; x.fillRect(4, 4, 1, 1); return x.getImageData(1, 4, 1, 1).data[3] > 0; } catch (e) { return false; } })();
function resize() {
  const r = stage.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  if (forceSize) { W = forceSize[0]; H = forceSize[1]; DPR = H / Math.max(1, r.height); }
  else { W = Math.max(2, Math.round(r.width * DPR)); H = Math.max(2, Math.round(r.height * DPR)); }
  U = Math.min(W, H);
  for (const c of [cv, sceneCv, maskCv]) { c.width = W; c.height = H; }
  smallCv.width = Math.max(2, Math.round(W / 3)); smallCv.height = Math.max(2, Math.round(H / 3));
  dirty = true;
}
new ResizeObserver(() => { if (!forceSize) resize(); }).observe(stage);
resize();

const cam = { pos: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1], F: 1, yaw: 0 };
function setCamera(p) {
  const th = p.yaw * D2R, ph = p.pitch * D2R;
  const ox = Math.sin(th) * Math.cos(ph), oy = Math.sin(ph), oz = Math.cos(th) * Math.cos(ph);
  cam.pos = [p.tx + ox * p.d, oy * p.d, p.tz + oz * p.d];
  const f = [-ox, -oy, -oz];
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(r[0], r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
  cam.u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  cam.f = f; cam.r = r; cam.F = U * (1.3 + 0.15 * clamp((1.3 - W / H) / 0.75)); cam.yaw = th;
}
function P(x, y, z) {
  const vx = x - cam.pos[0], vy = y - cam.pos[1], vz = z - cam.pos[2];
  const xc = vx * cam.r[0] + vy * cam.r[1] + vz * cam.r[2];
  const yc = vx * cam.u[0] + vy * cam.u[1] + vz * cam.u[2];
  const zr = vx * cam.f[0] + vy * cam.f[1] + vz * cam.f[2], zc = Math.max(0.1, zr);
  return { x: W / 2 + cam.F * xc / zc, y: H / 2 - cam.F * yc / zc, z: zc, zr };
}
const scaleAt = (x, y, z) => cam.F / P(x, y, z).z;
function planeT(c, x, y, z, rot = 0) {
  const cs = Math.cos(rot) * 0.05, sn = Math.sin(rot) * 0.05;
  const p0 = P(x, y, z), px = P(x + cs, y, z - sn), pz = P(x + sn, y, z + cs);
  c.setTransform((px.x - p0.x) / 5, (px.y - p0.y) / 5, (pz.x - p0.x) / 5, (pz.y - p0.y) / 5, p0.x, p0.y);
}
function camAt(t) {
  const KS = TL.keys; let i = 0; while (i < KS.length - 2 && t > KS[i + 1].t) i++;
  const a = KS[i], b = KS[i + 1]; const u = ease(clamp((t - a.t) / Math.max(0.001, b.t - a.t)));
  const o = {}; for (const k of ['tx', 'tz', 'd', 'yaw', 'pitch', 'fx', 'fz', 'fr', 'dof']) o[k] = lerp(a[k], b[k], u);
  for (const s of TL.shakes) { const dt = t - s.t; if (dt > 0 && dt < 0.6) { const e = s.a * (1 - dt / 0.6); o.tx += e * Math.sin(dt * 55); o.tz += e * Math.cos(dt * 47); } }
  return o;
}
function poly(c, pts) { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); }
function ringPts(x, y, z, r, n = 40) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push(P(x + r * Math.cos(a), y, z + r * Math.sin(a))); } return o; }
function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function shadowFill(c, pts, blur, alpha) { c.save(); c.globalAlpha = alpha; c.shadowColor = 'rgba(12,5,0,1)'; c.shadowBlur = blur; c.shadowOffsetX = 10000; c.translate(-10000, 0); poly(c, pts); c.fillStyle = '#000'; c.fill(); c.restore(); }
