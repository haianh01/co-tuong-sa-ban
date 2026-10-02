'use strict';
// Trạng thái trận đánh: đơn vị, di chuyển, giao chiến, cọc ngầm, sương mù.
// Không đụng tới DOM/canvas để chạy được cả trong Node (test/sim-test.js).

// Bộ sinh số ngẫu nhiên có hạt giống, để một trận chạy lại cho ra cùng kết quả.
BD.rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

class World {
  constructor(battle, seed = 938) {
    this.battle = battle;
    this.terrain = new BD.Terrain(battle);
    this.rand = BD.rng(seed);
    this.t = 0;
    this.phase = 'plan';          // plan -> battle -> end
    this.units = [];
    this.effects = [];
    this.log = [];
    this.stats = { sunk: 0, escaped: 0, impaled: 0, lost: 0 };
    this.enemyOrder = 'advance';
    this.result = null;
    this.vis = new Uint8Array(this.terrain.w * this.terrain.h);
    this.nextId = 1;
    this._visT = -1;
    for (const d of battle.player) this.spawn(d, 'player');
    BD.Events.init(this);
    this.updateVision();
  }

  get level() { return this.terrain.level(this.t); }

  spawn(d, side) {
    const type = BD.UNIT_TYPES[d.type];
    const u = {
      id: this.nextId++, side, typeId: d.type, type, tag: d.tag || null, name: d.name || type.name,
      x: d.x + 0.5, y: d.y + 0.5, hp: type.hp, maxHp: type.hp, cd: this.rand() * type.cd,
      heading: side === 'enemy' ? Math.PI : 0, path: [], order: null, holdFire: !!d.holdFire,
      state: 'ok', revealedUntil: -1, dead: false, escaped: false, ai: {}, hitT: -9, repathT: 0,
    };
    this.units.push(u);
    return u;
  }
  alive(side) { return this.units.filter(u => !u.dead && !u.escaped && (!side || u.side === side)); }
  byTag(tag) { return this.units.find(u => u.tag === tag); }
  unitAt(x, y, side) {
    let best = null, bd = Infinity;
    for (const u of this.alive(side)) {
      const d = BD.dist(u.x, u.y, x, y);
      if (d < Math.max(u.type.r, 0.45) + 0.1 && d < bd) { best = u; bd = d; }
    }
    return best;
  }
  say(who, text, kind = 'info') { this.log.push({ t: this.t, who, text, kind }); }
  fx(e) { e.t0 = this.t; this.effects.push(e); }

  // ---------- Giai đoạn bày trận ----------
  canDeploy(u, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!this.terrain.inside(tx, ty) || tx > this.battle.deployMaxX) return false;
    if (u.type.domain === 'fixed') return false;
    return this.terrain.speedAt(u.type, tx, ty, this.level) > 0;
  }
  deploy(u, x, y) {
    if (this.phase !== 'plan' || !this.canDeploy(u, x, y)) return false;
    u.x = Math.floor(x) + 0.5; u.y = Math.floor(y) + 0.5; u.path = []; u.order = null;
    this.updateVision(true);
    return true;
  }
  toggleStake(x, y) {
    if (this.phase !== 'plan') return false;
    return this.terrain.toggleStake(Math.floor(x), Math.floor(y), this.battle.maxStakes);
  }
  start() { if (this.phase === 'plan') { this.phase = 'battle'; this.say('', 'Trận đánh bắt đầu.', 'sys'); } }

  // ---------- Lệnh ----------
  orderMove(u, x, y) { if (u.type.domain === 'fixed') return; u.order = { kind: 'move', x, y }; this.repath(u); }
  orderAttack(u, target) { if (u.type.domain === 'fixed') { u.order = { kind: 'attack', target }; return; } u.order = { kind: 'attack', target }; this.repath(u); }
  orderStop(u) { u.order = null; u.path = []; }

  // Phe ta biết vị trí cọc: né ô cọc khi nước sắp xuống thấp (nhìn trước 12 giây).
  avoidFor(u) {
    const T = this.terrain;
    if (u.side === 'player') {
      const lv = Math.min(this.level, T.level(this.t + 12));
      return T.stakesBite(lv) ? (x, y) => T.hasStake(x, y) : null;
    }
    // Phe địch chỉ né khi đầu cọc đã nhô hẳn lên khỏi mặt nước.
    return this.level < T.tide.stakeVisible ? (x, y) => T.hasStake(x, y) : null;
  }
  repath(u) {
    const o = u.order; u.repathT = this.t;
    if (!o || u.state !== 'ok') { u.path = []; return; }
    let gx, gy, within;
    if (o.kind === 'move') { gx = o.x; gy = o.y; within = 0.5; }
    else { gx = o.target.x; gy = o.target.y; within = Math.max(0.6, u.type.range + o.target.type.r - 0.35); }
    if (BD.dist(u.x, u.y, gx, gy) <= within && o.kind === 'attack') { u.path = []; return; }
    u.path = this.terrain.findPath(u.type, u.x, u.y, gx, gy, this.level, within, this.avoidFor(u)).path;
    if (o.kind === 'move' && u.path.length) { const last = u.path[u.path.length - 1]; if (BD.dist(last.x, last.y, gx, gy) < 0.75) { last.x = gx; last.y = gy; } }
  }

  // ---------- Phát hiện / ẩn nấp ----------
  concealed(u) {
    return u.type.domain === 'land' && this.terrain.cover(Math.floor(u.x), Math.floor(u.y)) && this.t >= u.revealedUntil;
  }
  // side có nhìn thấy u không?
  detects(side, u) {
    if (u.side === side || u.type.domain === 'fixed') return true;
    const hidden = this.concealed(u);
    for (const o of this.units) {
      if (o.dead || o.escaped || o.side !== side) continue;
      const d = BD.dist(o.x, o.y, u.x, u.y);
      if (d <= (hidden ? 1.6 : o.type.vision)) return true;
    }
    return false;
  }
  updateVision(force) {
    if (!force && this.t - this._visT < 0.2) return;
    this._visT = this.t;
    const T = this.terrain, v = this.vis; v.fill(0);
    for (const u of this.alive('player')) {
      const R = u.type.vision, x0 = Math.max(0, Math.floor(u.x - R)), x1 = Math.min(T.w - 1, Math.floor(u.x + R));
      const y0 = Math.max(0, Math.floor(u.y - R)), y1 = Math.min(T.h - 1, Math.floor(u.y + R));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (BD.dist(x + 0.5, y + 0.5, u.x, u.y) <= R) v[T.key(x, y)] = 1;
    }
  }
  visibleToPlayer(u) {
    if (u.side === 'player') return true;
    return this.vis[this.terrain.key(Math.floor(u.x), Math.floor(u.y))] === 1 || this.phase === 'end';
  }

  // ---------- Vòng cập nhật ----------
  update(dt) {
    if (this.phase !== 'battle') return;
    this.t += dt;
    const lv = this.level;
    this.updateStates(lv, dt);
    BD.AI.update(this, dt);
    for (const u of this.alive()) this.updateOrder(u);
    for (const u of this.alive()) this.move(u, dt, lv);
    this.separate();
    this.combat(dt);
    this.cleanup();
    this.updateVision();
    BD.Events.update(this);
    this.effects = this.effects.filter(e => this.t - e.t0 < (e.dur || 1.2));
  }

  // Mắc cọc / mắc cạn theo mực triều.
  updateStates(lv, dt) {
    const T = this.terrain;
    for (const u of this.alive()) {
      if (u.type.domain !== 'water') continue;
      const tx = Math.floor(u.x), ty = Math.floor(u.y);
      if (T.hasStake(tx, ty) && T.stakesBite(lv)) {
        if (u.state !== 'impaled') {
          u.state = 'impaled'; u.path = [];
          if (u.side === 'enemy') this.stats.impaled++;
          this.fx({ kind: 'splash', x: u.x, y: u.y, dur: 1.5 });
          this.fx({ kind: 'text', x: u.x, y: u.y - 0.6, text: 'Mắc cọc!', color: '#ffb13b', dur: 2 });
        }
        this.hurt(u, T.tide.stakeDps * dt, null);
      } else if (T.ch(tx, ty) === ',' && lv < u.type.draft) {
        if (u.state !== 'aground') {
          u.state = 'aground'; u.path = [];
          this.fx({ kind: 'text', x: u.x, y: u.y - 0.6, text: 'Mắc cạn', color: '#d9c49a', dur: 2 });
        }
      } else if (u.state !== 'ok') {
        u.state = 'ok'; if (u.order) this.repath(u);
      }
    }
  }

  updateOrder(u) {
    const o = u.order; if (!o) return;
    if (o.kind === 'attack') {
      const tg = o.target;
      if (tg.dead || tg.escaped || !this.detects(u.side, tg)) { u.order = null; u.path = []; return; }
      if (u.type.domain === 'fixed' || u.state !== 'ok') return;
      const inRange = BD.dist(u.x, u.y, tg.x, tg.y) <= u.type.range + tg.type.r;
      if (inRange) u.path = [];
      else if (this.t - u.repathT > 0.8 || !u.path.length) this.repath(u);
    } else if (o.kind === 'move' && !u.path.length && u.state === 'ok') {
      u.order = null;
    }
  }

  move(u, dt, lv) {
    if (!u.path.length || u.state !== 'ok' || !u.type.speed) return;
    const T = this.terrain;
    const wp = u.path[0];
    // Đường đi bị chặn vì thủy triều thay đổi: tìm lại đường.
    if (!T.speedAt(u.type, Math.floor(wp.x), Math.floor(wp.y), lv)) {
      if (this.t - u.repathT > 0.5) this.repath(u); else u.path = [];
      return;
    }
    const sp = Math.max(0.3, T.speedAt(u.type, Math.floor(u.x), Math.floor(u.y), lv) || 0.3);
    let step = u.type.speed * sp * dt;
    if (u.type.domain === 'water') {
      const p = u.path[0];
      step *= T.currentBoost(this.t, Math.atan2(p.y - u.y, p.x - u.x));
    }
    while (step > 0 && u.path.length) {
      const p = u.path[0], dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
      if (d > 1e-4) u.heading = Math.atan2(dy, dx);
      if (d <= step) { u.x = p.x; u.y = p.y; step -= d; u.path.shift(); }
      else { u.x += dx / d * step; u.y += dy / d * step; step = 0; }
    }
  }

  // Đẩy các đơn vị chồng lên nhau ra xa.
  separate() {
    const list = this.alive().filter(u => u.type.domain !== 'fixed');
    const T = this.terrain, lv = this.level;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.type.domain !== b.type.domain) continue;
      const min = (a.type.r + b.type.r) * 0.85, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const nx = d > 1e-3 ? dx / d : 1, ny = d > 1e-3 ? dy / d : 0, push = (min - d) / 2;
      const shove = (u, s) => {
        if (u.state !== 'ok') return;
        const x = u.x + nx * push * s, y = u.y + ny * push * s;
        if (T.speedAt(u.type, Math.floor(x), Math.floor(y), lv)) { u.x = x; u.y = y; }
      };
      shove(a, -1); shove(b, 1);
    }
  }

  pickTarget(u) {
    const o = u.order;
    if (o && o.kind === 'attack' && !o.target.dead) return o.target;
    if (u.side === 'player' && u.holdFire) return null;
    let best = null, bd = Infinity;
    for (const e of this.units) {
      if (e.dead || e.escaped || e.side === u.side) continue;
      const d = BD.dist(u.x, u.y, e.x, e.y);
      if (d > u.type.range + e.type.r || d >= bd) continue;
      if (!this.detects(u.side, e)) continue;
      best = e; bd = d;
    }
    return best;
  }

  combat(dt) {
    for (const u of this.alive()) {
      u.cd -= dt;
      if (u.cd > 0 || u.state === 'impaled') continue;
      const tg = this.pickTarget(u);
      if (!tg || BD.dist(u.x, u.y, tg.x, tg.y) > u.type.range + tg.type.r) continue;
      u.cd = u.type.cd;
      if (u.type.domain !== 'fixed') u.heading = Math.atan2(tg.y - u.y, tg.x - u.x);
      let dmg = u.type.atk * (BD.COUNTER[u.type.cls][tg.type.cls] || 1);
      if (tg.state !== 'ok') dmg *= 1.4;  // thuyền mắc cọc / mắc cạn trở thành bia
      dmg = Math.max(1, dmg - tg.type.def) * (0.85 + 0.3 * this.rand());
      if (u.side === 'player') u.revealedUntil = this.t + 4;  // bắn là lộ chỗ nấp
      this.fx({ kind: u.type.range > 2 ? 'arrow' : 'clash', x0: u.x, y0: u.y, x1: tg.x, y1: tg.y, side: u.side, dur: u.type.range > 2 ? 0.35 : 0.25 });
      this.hurt(tg, dmg, u);
    }
  }

  hurt(u, dmg, src) {
    if (u.dead) return;
    u.hp -= dmg; u.hitT = this.t;
    // Bị bắn từ chỗ không thấy: phe địch vẫn quay lại đánh nếu thấy kẻ bắn.
    if (src && u.side === 'enemy') u.ai.lastAttacker = src;
  }

  cleanup() {
    const W = this.terrain.w;
    for (const u of this.units) {
      if (u.dead || u.escaped) continue;
      if (u.hp <= 0) {
        u.dead = true; u.deathT = this.t; u.path = [];
        this.fx({ kind: 'sink', x: u.x, y: u.y, dur: 2.5, water: u.type.domain === 'water' });
        if (u.side === 'enemy') this.stats.sunk++; else this.stats.lost++;
        for (const o of this.units) if (o.order && o.order.target === u) { o.order = null; o.path = []; }
      } else if (u.side === 'enemy' && this.enemyOrder === 'retreat' && u.x > W - 0.7) {
        u.escaped = true; this.stats.escaped++;
        this.say('', u.name + ' đã thoát ra biển.', 'bad');
      }
    }
  }

  end(result, text) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.result = { win: result === 'win', text, t: this.t, stats: { ...this.stats } };
    this.updateVision(true);
  }
}
BD.World = World;
