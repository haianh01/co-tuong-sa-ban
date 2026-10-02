'use strict';
// Vẽ sa bàn lên canvas: địa hình, nước theo thủy triều, cọc, quân, sương mù, hiệu ứng.
BD.TS = 32;  // số điểm ảnh logic mỗi ô
const COL = {
  land: '#8a9a5b', land2: '#7c8c50', forest: '#3f5f34', forestDark: '#2c4526', marsh: '#7f8f55', reed: '#b4b072',
  hill: '#8b7d66', hillDark: '#6b5f4c', mud: '#8a7550', bed: '#4a4a3a',
  deep: [28, 72, 92], shallow: [70, 128, 136],
  player: '#c0392b', playerRim: '#ffc24f', enemy: '#27303d', enemyRim: '#9fb3c8', sail: '#e8dcc0',
  fog: 'rgba(10,14,20,0.42)', gold: '#ffc24f', stake: '#3a2a1a', iron: '#9aa3ad',
};

class Renderer {
  constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.scale = 1; }

  setWorld(w) {
    this.w = w;
    const T = w.terrain, TS = BD.TS;
    this.W = T.w * TS; this.H = T.h * TS;
    this.base = this.layer((g) => this.paintBase(g, T));
    this.top = this.layer((g) => this.paintTop(g, T));
  }
  layer(fn) { const c = document.createElement('canvas'); c.width = this.W; c.height = this.H; fn(c.getContext('2d')); return c; }
  resize() {
    if (!this.W) return;
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.scale = this.cv.width / this.W;
  }

  // Lớp nền tĩnh: đất, lòng sông, bãi bồi.
  paintBase(g, T) {
    const TS = BD.TS;
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
      const c = T.ch(x, y), n = BD.hash(x, y);
      g.fillStyle = c === '~' ? COL.bed : c === ',' ? COL.mud : c === 'm' ? COL.marsh : (n > 0.5 ? COL.land : COL.land2);
      g.fillRect(x * TS, y * TS, TS, TS);
      for (let i = 0; i < 5; i++) {  // lấm tấm cho đỡ phẳng
        const a = BD.hash(x * 7 + i, y * 13 - i), b = BD.hash(x * 3 - i, y * 5 + i);
        g.fillStyle = c === ',' ? 'rgba(60,45,25,.35)' : 'rgba(255,255,220,.07)';
        g.fillRect(x * TS + a * TS, y * TS + b * TS, 2, 2);
      }
    }
  }
  // Lớp trên: cây, lau sậy, núi (vẽ đè lên nước và quân đứng dưới tán).
  paintTop(g, T) {
    const TS = BD.TS;
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
      const c = T.ch(x, y), px = x * TS, py = y * TS;
      if (c === 'T') for (let i = 0; i < 3; i++) {
        const cx = px + 6 + BD.hash(x + i, y) * (TS - 12), cy = py + 6 + BD.hash(x, y + i) * (TS - 12), r = 7 + BD.hash(x * i, y) * 5;
        g.fillStyle = COL.forestDark; g.beginPath(); g.arc(cx + 2, cy + 3, r, 0, 7); g.fill();
        g.fillStyle = COL.forest; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
        g.fillStyle = 'rgba(160,200,120,.18)'; g.beginPath(); g.arc(cx - r / 3, cy - r / 3, r / 2.5, 0, 7); g.fill();
      } else if (c === 'm') {
        g.strokeStyle = COL.reed; g.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
          const sx = px + BD.hash(x + i * 3, y) * TS, sy = py + 8 + BD.hash(x, y + i * 5) * (TS - 8);
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 2 - BD.hash(i, x) * 4, sy - 7 - BD.hash(i, y) * 5); g.stroke();
        }
      } else if (c === '^') {
        g.fillStyle = COL.hillDark; g.beginPath(); g.moveTo(px + 2, py + TS - 2); g.lineTo(px + TS / 2 + 3, py + 3); g.lineTo(px + TS - 1, py + TS - 2); g.fill();
        g.fillStyle = COL.hill; g.beginPath(); g.moveTo(px + 2, py + TS - 2); g.lineTo(px + TS / 2 + 3, py + 3); g.lineTo(px + TS / 2 + 1, py + TS - 2); g.fill();
      }
    }
  }

  render(view) {
    const w = this.w, T = w.terrain, g = this.ctx, TS = BD.TS, lv = w.level, now = performance.now() / 1000;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.drawImage(this.base, 0, 0);

    // Nước: sông sâu luôn đầy, bãi nông cạn dần theo triều.
    const shallowA = BD.clamp((lv - 0.18) / 0.5);
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
      const c = T.ch(x, y);
      if (c !== '~' && c !== ',') continue;
      const col = c === '~' ? COL.deep : COL.shallow, a = c === '~' ? 0.55 + 0.4 * lv : 0.9 * shallowA;
      if (a <= 0.01) continue;
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      g.fillRect(x * TS, y * TS, TS, TS);
      if (c === '~' && BD.hash(x, y) > 0.6) {  // gợn sóng trôi theo dòng triều
        const off = ((now * 6 * T.flow(w.t) + BD.hash(y, x) * TS) % TS + TS) % TS;
        g.strokeStyle = 'rgba(200,230,240,.18)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x * TS + off - 5, y * TS + BD.hash(x, y) * TS); g.lineTo(x * TS + off + 4, y * TS + BD.hash(x, y) * TS); g.stroke();
      }
    }
    // Vạch nước ven bãi bồi khi nước cạn.
    if (lv < BD.SHALLOW_DRY) {
      g.fillStyle = `rgba(30,22,10,${0.25 * (1 - lv / BD.SHALLOW_DRY)})`;
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (T.ch(x, y) === ',') g.fillRect(x * TS, y * TS, TS, TS);
    }

    this.drawStakes(view, lv);
    if (w.phase === 'plan') this.drawPlan(view);

    // Quân: dưới nước trước, trên cạn sau.
    const list = w.units.filter(u => !u.escaped && (!u.dead) && w.visibleToPlayer(u));
    list.sort((a, b) => (a.type.domain === 'water' ? 0 : 1) - (b.type.domain === 'water' ? 0 : 1));
    for (const u of list) this.drawUnit(u, view, now);

    g.drawImage(this.top, 0, 0);
    // Quân ta trong rừng vẫn hiện mờ trên tán cây để người chơi thấy.
    for (const u of list) if (u.side === 'player' && u.type.domain === 'land' && T.cover(Math.floor(u.x), Math.floor(u.y))) this.drawUnit(u, view, now, 0.55);

    this.drawEffects(now);
    if (w.phase === 'battle') this.drawFog();
    for (const u of list) this.drawBars(u, view);
    this.drawOrders(view);
    if (view.box) {
      const b = view.box;
      g.strokeStyle = COL.gold; g.lineWidth = 1.5; g.setLineDash([5, 4]);
      g.strokeRect(Math.min(b.x0, b.x1) * TS, Math.min(b.y0, b.y1) * TS, Math.abs(b.x1 - b.x0) * TS, Math.abs(b.y1 - b.y0) * TS);
      g.setLineDash([]);
    }
  }

  drawStakes(view, lv) {
    const w = this.w, T = w.terrain, g = this.ctx, TS = BD.TS;
    const bite = T.stakesBite(lv), exposure = BD.clamp((T.tide.stakeLevel - lv) / T.tide.stakeLevel);
    for (const k of T.stakes) {
      const x = k % T.w, y = (k / T.w) | 0, px = x * TS, py = y * TS;
      if (!bite) {  // cọc chìm: chỉ quân ta biết, vẽ dấu mờ
        g.strokeStyle = w.phase === 'plan' ? 'rgba(255,194,79,.85)' : 'rgba(255,194,79,.35)';
        g.lineWidth = 1.5; g.setLineDash([3, 3]);
        g.strokeRect(px + 4, py + 4, TS - 8, TS - 8); g.setLineDash([]);
        for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(58,42,26,.5)'; g.beginPath(); g.arc(px + 9 + i * 7, py + 12 + (i % 2) * 8, 2.5, 0, 7); g.fill(); }
        continue;
      }
      for (let i = 0; i < 4; i++) {
        const sx = px + 6 + (i % 2) * 14 + BD.hash(x + i, y) * 6, sy = py + 9 + (i >> 1) * 13, h = 4 + exposure * 9;
        g.fillStyle = COL.stake; g.beginPath(); g.moveTo(sx - 2.5, sy + 3); g.lineTo(sx, sy - h); g.lineTo(sx + 2.5, sy + 3); g.fill();
        g.fillStyle = COL.iron; g.beginPath(); g.moveTo(sx - 1.2, sy - h + 3.5); g.lineTo(sx, sy - h); g.lineTo(sx + 1.2, sy - h + 3.5); g.fill();
        g.strokeStyle = 'rgba(220,240,250,.35)'; g.beginPath(); g.ellipse(sx, sy + 3, 4, 1.5, 0, 0, 7); g.stroke();
      }
    }
  }

  drawPlan(view) {
    const w = this.w, T = w.terrain, g = this.ctx, TS = BD.TS, z = T.stakeZone;
    g.strokeStyle = COL.gold; g.lineWidth = 2; g.setLineDash([8, 6]);
    g.strokeRect(z.x0 * TS, z.y0 * TS, (z.x1 - z.x0 + 1) * TS, (z.y1 - z.y0 + 1) * TS); g.setLineDash([]);
    g.fillStyle = COL.gold; g.font = `700 13px ${'"Be Vietnam Pro", system-ui, sans-serif'}`;
    g.fillText('Vùng cắm cọc', z.x0 * TS + 6, z.y0 * TS + 16);
    // Ngoài vùng bày quân.
    const mx = (w.battle.deployMaxX + 1) * TS;
    g.fillStyle = 'rgba(10,14,20,.35)'; g.fillRect(mx, 0, this.W - mx, this.H);
    // Hướng giặc tới.
    const ay = 11 * TS;
    g.fillStyle = 'rgba(230,240,250,.9)'; g.beginPath();
    g.moveTo(this.W - 10, ay - 14); g.lineTo(this.W - 40, ay); g.lineTo(this.W - 10, ay + 14); g.fill();
    g.textAlign = 'right'; g.fillText('Giặc tới từ biển', this.W - 8, ay + 34); g.textAlign = 'left';
    const h = view.hover;
    if (h && view.selCount === 0 && (T.canStake(h.tx, h.ty) || T.hasStake(h.tx, h.ty))) {
      g.strokeStyle = T.hasStake(h.tx, h.ty) ? '#ff7b66' : COL.gold; g.lineWidth = 2;
      g.strokeRect(h.tx * TS + 1, h.ty * TS + 1, TS - 2, TS - 2);
    }
  }

  drawUnit(u, view, now, alpha) {
    const g = this.ctx, TS = BD.TS, x = u.x * TS, y = u.y * TS, sel = view.sel.has(u);
    const hidden = this.w.concealed(u);
    g.save();
    g.globalAlpha = alpha != null ? alpha : hidden && u.side === 'player' ? 0.6 : 1;
    if (sel) { g.strokeStyle = COL.gold; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, u.type.r * TS + 6, u.type.r * TS + 4, 0, 0, 7); g.stroke(); }
    const flash = this.w.t - u.hitT < 0.12;
    g.translate(x, y);
    const d = u.type.domain;
    if (d === 'water') this.drawBoat(g, u, flash, now);
    else if (d === 'fixed') this.drawFort(g, u, flash);
    else this.drawSoldier(g, u, flash);
    g.restore();
  }
  drawBoat(g, u, flash, now) {
    const TS = BD.TS, big = u.type.cls === 'warship', L = (big ? 1.25 : 0.85) * (u.typeId === 'soai_thuyen' ? 1.18 : u.typeId === 'thuyen_chi_huy' ? 1.15 : 1) * TS, B = L * (big ? 0.42 : 0.34);
    let rot = u.heading;
    if (u.state === 'impaled') rot += Math.sin(now * 3 + u.id) * 0.08 + 0.25;
    g.rotate(rot);
    if (u.state !== 'impaled') { g.strokeStyle = 'rgba(230,245,250,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-L / 2 - 6, -B / 2); g.lineTo(-L / 2, 0); g.lineTo(-L / 2 - 6, B / 2); g.stroke(); }
    const hull = u.side === 'player' ? COL.player : COL.enemy, rim = u.side === 'player' ? COL.playerRim : COL.enemyRim;
    g.fillStyle = flash ? '#fff' : hull; g.strokeStyle = rim; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(L / 2, 0); g.quadraticCurveTo(L / 4, -B / 2, -L / 2, -B / 2.3); g.lineTo(-L / 2, B / 2.3); g.quadraticCurveTo(L / 4, B / 2, L / 2, 0); g.fill(); g.stroke();
    if (big) {  // lầu và buồm của lâu thuyền
      g.fillStyle = '#4b3a2a'; g.fillRect(-L / 2 + 3, -B / 3, L * 0.32, B * 0.66);
      g.fillStyle = COL.sail; g.fillRect(-2, -B * 0.62, 4, B * 1.24);
      if (u.typeId === 'soai_thuyen') { g.fillStyle = '#c23b22'; g.fillRect(-L / 2 + 5, -B / 5, 7, B / 2.5); }
    } else {
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = -1; i <= 1; i++) g.fillRect(i * L / 5 - 1, -B / 2 - 3, 2, B + 6);  // mái chèo
      if (u.typeId === 'thuyen_chi_huy') { g.fillStyle = COL.gold; g.fillRect(-3, -3, 6, 6); }
    }
    if (u.state === 'aground') { g.strokeStyle = '#d9c49a'; g.setLineDash([3, 3]); g.beginPath(); g.ellipse(0, 0, L / 2 + 4, B / 2 + 5, 0, 0, 7); g.stroke(); g.setLineDash([]); }
  }
  drawSoldier(g, u, flash) {
    const TS = BD.TS, r = u.type.r * TS;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(2, 3, r, r * 0.7, 0, 0, 7); g.fill();
    g.fillStyle = flash ? '#fff' : u.side === 'player' ? COL.player : COL.enemy;
    g.strokeStyle = u.side === 'player' ? COL.playerRim : COL.enemyRim; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = '#f6ecd6'; g.lineWidth = 1.6; g.rotate(u.heading);
    if (u.type.cls === 'archer') { g.beginPath(); g.arc(-1, 0, r * 0.6, -1.2, 1.2); g.stroke(); g.beginPath(); g.moveTo(-r * 0.5, 0); g.lineTo(r * 0.75, 0); g.stroke(); }
    else { g.beginPath(); g.moveTo(-r * 0.6, 0); g.lineTo(r * 0.9, 0); g.stroke(); g.fillStyle = '#d8dde2'; g.beginPath(); g.moveTo(r * 0.9, -2.5); g.lineTo(r * 1.3, 0); g.lineTo(r * 0.9, 2.5); g.fill(); }
  }
  drawFort(g, u, flash) {
    const s = 26;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-s / 2 + 3, -s / 2 + 4, s, s);
    g.fillStyle = flash ? '#fff' : '#8e5a3a'; g.strokeStyle = COL.playerRim; g.lineWidth = 1.5;
    g.fillRect(-s / 2, -s / 2, s, s); g.strokeRect(-s / 2, -s / 2, s, s);
    g.fillStyle = '#6b3f26'; for (let i = 0; i < 4; i++) g.fillRect(-s / 2 + i * 7, -s / 2 - 4, 5, 4);
    g.fillStyle = COL.player; g.fillRect(-1, -s / 2 - 16, 2, 14); g.fillRect(1, -s / 2 - 16, 10, 6);
  }

  drawBars(u, view) {
    const g = this.ctx, TS = BD.TS, sel = view.sel.has(u);
    if (u.hp >= u.maxHp && !sel && !(u.side === 'player' && u.holdFire)) return;
    const w = Math.max(18, u.type.r * TS * 2), x = u.x * TS - w / 2, y = u.y * TS - u.type.r * TS - 10;
    if (u.hp < u.maxHp || sel) {
      const f = BD.clamp(u.hp / u.maxHp);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle = f > 0.5 ? '#5fe08a' : f > 0.25 ? '#ffb13b' : '#ff4433'; g.fillRect(x, y, w * f, 3);
    }
    if (u.side === 'player' && u.holdFire) {  // biểu tượng giữ im lặng
      g.fillStyle = 'rgba(20,24,30,.85)'; g.beginPath(); g.arc(x + w + 6, y + 1, 5.5, 0, 7); g.fill();
      g.strokeStyle = '#e8dcc0'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + w + 3, y + 1); g.lineTo(x + w + 9, y + 1); g.stroke();
    }
  }

  drawOrders(view) {
    const g = this.ctx, TS = BD.TS;
    for (const u of view.sel) {
      if (u.dead || !u.path.length) continue;
      g.strokeStyle = u.order && u.order.kind === 'attack' ? 'rgba(255,90,70,.6)' : 'rgba(255,194,79,.55)';
      g.lineWidth = 1.5; g.setLineDash([4, 5]);
      g.beginPath(); g.moveTo(u.x * TS, u.y * TS);
      for (const p of u.path) g.lineTo(p.x * TS, p.y * TS);
      g.stroke(); g.setLineDash([]);
    }
  }

  drawEffects(now) {
    const w = this.w, g = this.ctx, TS = BD.TS;
    for (const e of w.effects) {
      const u = (w.t - e.t0) / (e.dur || 1.2);
      if (e.kind === 'arrow') {
        const x = BD.lerp(e.x0, e.x1, u) * TS, y = BD.lerp(e.y0, e.y1, u) * TS - Math.sin(u * Math.PI) * 10;
        const a = Math.atan2(e.y1 - e.y0, e.x1 - e.x0);
        g.strokeStyle = e.side === 'player' ? '#ffe2a8' : '#cfd8e3'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x - Math.cos(a) * 7, y - Math.sin(a) * 7); g.lineTo(x, y); g.stroke();
      } else if (e.kind === 'clash') {
        g.strokeStyle = `rgba(255,240,200,${1 - u})`; g.lineWidth = 2;
        const x = e.x1 * TS, y = e.y1 * TS; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke();
      } else if (e.kind === 'splash' || e.kind === 'sink') {
        g.strokeStyle = `rgba(230,245,255,${0.8 * (1 - u)})`; g.lineWidth = 2;
        for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(e.x * TS, e.y * TS, (4 + u * 22) * (1 - i * 0.4), 0, 7); g.stroke(); }
        if (e.kind === 'sink' && u < 0.6) { g.fillStyle = `rgba(40,30,20,${0.7 * (1 - u / 0.6)})`; g.beginPath(); g.ellipse(e.x * TS, e.y * TS, 14 * (1 - u), 6 * (1 - u), 0.4, 0, 7); g.fill(); }
      } else if (e.kind === 'text') {
        g.globalAlpha = 1 - u; g.fillStyle = e.color; g.font = '700 12px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText(e.text, e.x * TS, (e.y - u * 0.6) * TS); g.textAlign = 'left'; g.globalAlpha = 1;
      }
    }
  }

  drawFog() {
    const w = this.w, T = w.terrain, g = this.ctx, TS = BD.TS;
    g.fillStyle = COL.fog;
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (!w.vis[T.key(x, y)]) g.fillRect(x * TS, y * TS, TS, TS);
  }
}
BD.Renderer = Renderer;
