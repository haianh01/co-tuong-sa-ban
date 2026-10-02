'use strict';
// Địa hình, thủy triều, khả năng đi lại và tìm đường A*.
// Ký hiệu bản đồ:  ~ sông sâu   , bãi nông (lộ thành bãi bồi khi nước cạn)
//                  . đất bằng   T rừng   m lau sậy / đầm   ^ núi (không đi được)
BD.TERRAIN = {
  '~': { name: 'Sông sâu',     water: true },
  ',': { name: 'Bãi nông',     shallow: true },
  '.': { name: 'Đất bằng',     land: 1 },
  'T': { name: 'Rừng',         land: 0.7, cover: true },
  'm': { name: 'Lau sậy',      land: 0.55, cover: true },
  '^': { name: 'Núi đá' },
};
BD.MUD_SPEED = 0.6;

class Terrain {
  constructor(battle) {
    this.rows = battle.map;
    this.h = this.rows.length; this.w = this.rows[0].length;
    this.tide = battle.tide;
    this.stakes = new Set();
    this.stakeZone = battle.stakeZone;
  }
  key(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  ch(x, y) { return this.inside(x, y) ? this.rows[y][x] : '^'; }
  info(x, y) { return BD.TERRAIN[this.ch(x, y)]; }

  // Mực triều 0 (cạn nhất) .. 1 (lớn nhất), dao động hình sin.
  level(t) { const T = this.tide; return 0.5 + 0.5 * Math.cos(2 * Math.PI * (t - T.highAt) / T.period); }
  falling(t) { const T = this.tide; return Math.sin(2 * Math.PI * (t - T.highAt) / T.period) > 0; }
  stakesBite(lv) { return lv < this.tide.stakeLevel; }
  // Dòng chảy: dương khi nước rút (chảy ra biển), âm khi nước lên.
  flow(t) { const T = this.tide; return Math.sin(2 * Math.PI * (t - T.highAt) / T.period); }
  // Hệ số tốc độ của thuyền đi theo hướng `heading` dưới tác động của dòng triều.
  currentBoost(t, heading) { const T = this.tide; return 1 + (T.current || 0) * this.flow(t) * Math.cos(heading) * (T.seaSide || 1); }

  hasStake(x, y) { return this.stakes.has(this.key(x, y)); }
  canStake(x, y) {
    const z = this.stakeZone;
    return this.ch(x, y) === '~' && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
  }
  toggleStake(x, y, max) {
    const k = this.key(x, y);
    if (this.stakes.has(k)) { this.stakes.delete(k); return true; }
    if (!this.canStake(x, y) || this.stakes.size >= max) return false;
    this.stakes.add(k); return true;
  }

  // Hệ số tốc độ của loại quân trên ô (0 = không đi được) với mực triều lv.
  speedAt(type, x, y, lv) {
    const c = this.ch(x, y), info = BD.TERRAIN[c];
    if (type.domain === 'water') {
      if (info.water) return 1;
      if (info.shallow) return lv >= type.draft ? 0.85 : 0;
      return 0;
    }
    if (type.domain === 'land') {
      if (info.land) return info.land;
      if (info.shallow && type.wade && lv < BD.SHALLOW_DRY) return BD.MUD_SPEED;
      return 0;
    }
    return 0;
  }
  cover(x, y) { return !!this.info(x, y).cover; }

  // A* trên lưới 8 hướng. Dừng khi tới ô có tâm cách (gx,gy) không quá `within`.
  // avoid(x,y) -> true thì coi ô đó như không đi được (vd. phe ta né bãi cọc khi nước cạn).
  findPath(type, sx, sy, gx, gy, lv, within = 0.5, avoid = null) {
    const W = this.w, H = this.h, N = W * H;
    sx = Math.floor(sx); sy = Math.floor(sy);
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [];  // heap nhị phân theo f
    const push = (k, f) => { open.push([f, k]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    const hfun = (x, y) => Math.max(0, BD.dist(x + 0.5, y + 0.5, gx, gy) - within);
    const s = this.key(sx, sy); g[s] = 0; push(s, hfun(sx, sy));
    let best = s, bestH = hfun(sx, sy), done = -1, guard = 0;
    while (open.length && guard++ < 6000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
      const x = k % W, y = (k / W) | 0, h = hfun(x, y);
      if (h <= 0) { done = k; break; }
      if (h < bestH) { bestH = h; best = k; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny)) continue;
        const sp = this.speedAt(type, nx, ny, lv);
        if (!sp || (avoid && avoid(nx, ny))) continue;
        // Không cắt góc qua ô cấm.
        if (dx && dy && (!this.speedAt(type, x + dx, y, lv) || !this.speedAt(type, x, y + dy, lv))) continue;
        const nk = this.key(nx, ny), ng = g[k] + (dx && dy ? 1.414 : 1) / sp;
        if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(nk, ng + hfun(nx, ny)); }
      }
    }
    // Không tới được thì đi tới ô gần mục tiêu nhất.
    let k = done >= 0 ? done : best;
    const path = [];
    while (k !== s && k >= 0) { path.push({ x: k % W + 0.5, y: ((k / W) | 0) + 0.5 }); k = from[k]; }
    path.reverse();
    return { path, reached: done >= 0 };
  }
}
BD.SHALLOW_DRY = 0.4;  // dưới mức này bãi nông lộ thành bãi bồi, bộ binh lội được
BD.Terrain = Terrain;
