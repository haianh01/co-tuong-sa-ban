'use strict';
// Khởi động game: tạo trận, vòng lặp khung hình, nút bấm.
const app = {
  battle: BD.battles['bach-dang-938'],
  cv: document.getElementById('cv'),
  speed: 1, paused: false,
  view: { sel: new Set(), box: null, hover: null },

  init() {
    this.renderer = new BD.Renderer(this.cv);
    BD.Input.init(this);
    const B = this.battle;
    $('briefing').innerHTML = B.briefing.map(p => `<p>${esc(p)}</p>`).join('');
    $('howto').innerHTML = B.howto.map(p => `<li>${esc(p)}</li>`).join('');
    $('introGo').onclick = () => { $('introModal').hidden = true; };
    $('helpBtn').onclick = () => { $('introGo').textContent = 'Tiếp tục'; $('introModal').hidden = false; this.paused = this.world.phase === 'battle' || this.paused; this.syncButtons(); };
    $('startBtn').onclick = () => this.start();
    $('pauseBtn').onclick = () => this.togglePause();
    $('speedSeg').onclick = e => { const b = e.target.closest('button'); if (b) this.setSpeed(+b.dataset.s); };
    $('holdBtn').onclick = () => this.toggleHold();
    $('stopBtn').onclick = () => this.stop();
    $('clearStakes').onclick = () => this.world.terrain.stakes.clear();
    $('againBtn').onclick = () => { $('endModal').hidden = true; this.reset(); };
    $('loreBtn').onclick = () => { $('loreBody').innerHTML = BD.HUD.loreHtml(B); $('loreModal').hidden = false; };
    $('loreClose').onclick = () => { $('loreModal').hidden = true; };
    if (this.loreUnlocked()) $('loreBtn').hidden = false;
    new ResizeObserver(() => this.renderer.resize()).observe(this.cv);
    this.reset();
    let last = performance.now();
    const frame = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },
  reset() {
    this.world = new BD.World(this.battle, (Math.random() * 1e9) | 0);
    this.view.sel.clear(); this.paused = false; this.ended = false;
    this.renderer.setWorld(this.world); this.renderer.resize();
    BD.HUD.bind(this.world);
    this.syncButtons();
  },
  tick(dt) {
    const w = this.world;
    if (w.phase === 'battle' && !this.paused && $('introModal').hidden) {
      let left = dt * this.speed;
      while (left > 1e-6 && w.phase === 'battle') { const s = Math.min(left, 1 / 30); w.update(s); left -= s; }
    }
    for (const u of this.view.sel) if (u.dead) this.view.sel.delete(u);
    this.view.selCount = this.view.sel.size;
    this.renderer.render(this.view);
    BD.HUD.update(this.view, this.paused);
    if (w.phase === 'end' && !this.ended) {
      this.ended = true;
      if (w.result.win) this.unlockLore();
      this.syncButtons();
      setTimeout(() => BD.HUD.showEnd(w), 900);
    }
  },
  start() { this.world.start(); this.view.sel.clear(); this.syncButtons(); },
  togglePause() { if (this.world.phase === 'battle') { this.paused = !this.paused; this.syncButtons(); } },
  setSpeed(s) { this.speed = s; this.syncButtons(); },
  toggleHold() {
    const us = [...this.view.sel].filter(u => u.type.domain !== 'fixed');
    const v = !us.every(u => u.holdFire);
    for (const u of us) u.holdFire = v;
  },
  stop() { for (const u of this.view.sel) this.world.orderStop(u); },
  syncButtons() {
    const ph = this.world.phase;
    $('startBtn').hidden = ph !== 'plan';
    $('pauseBtn').hidden = $('speedSeg').hidden = ph !== 'battle';
    $('pauseBtn').textContent = this.paused ? 'Tiếp tục' : 'Tạm dừng';
    for (const b of $('speedSeg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.s === this.speed));
  },
  loreKey() { return 'bd.lore.' + this.battle.id; },
  loreUnlocked() { try { return localStorage.getItem(this.loreKey()) === '1'; } catch (e) { return false; } },
  unlockLore() { try { localStorage.setItem(this.loreKey(), '1'); } catch (e) { /* trình duyệt chặn lưu trữ */ } $('loreBtn').hidden = false; },
};
app.init();
