'use strict';
// Không gian tên chung của game. Mọi file khác gắn thêm vào BD.
const BD = {
  battles: {},
  registerBattle(b) { this.battles[b.id] = b; },
};
BD.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
BD.lerp = (a, b, u) => a + (b - a) * u;
BD.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
BD.hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
BD.fmtTime = t => { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
