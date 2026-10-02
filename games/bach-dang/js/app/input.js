'use strict';
// Chuột / chạm / bàn phím. Tọa độ quy về đơn vị ô bản đồ.
BD.Input = {
  init(app) {
    this.app = app;
    const cv = app.cv;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', e => this.up(e));
    cv.addEventListener('pointerleave', () => { app.view.hover = null; });
    window.addEventListener('keydown', e => this.key(e));
  },
  pos(e) {
    const r = this.app.cv.getBoundingClientRect(), T = this.app.world.terrain;
    const x = (e.clientX - r.left) / r.width * T.w, y = (e.clientY - r.top) / r.height * T.h;
    return { x, y, tx: Math.floor(x), ty: Math.floor(y) };
  },
  down(e) {
    const app = this.app, w = app.world, p = this.pos(e);
    if (w.phase === 'end') return;
    app.cv.setPointerCapture(e.pointerId);
    if (e.button === 2) { this.command(p); return; }
    this.start = p; this.paint = null;
    // Bày trận: bấm vào ô sông trống (không có quân ta) để cắm/nhổ cọc, kéo để cắm liền một dải.
    if (w.phase === 'plan' && !w.unitAt(p.x, p.y, 'player') && !(e.pointerType === 'touch' && app.view.sel.size)) {
      const T = w.terrain;
      if (T.canStake(p.tx, p.ty) || T.hasStake(p.tx, p.ty)) {
        this.paint = T.hasStake(p.tx, p.ty) ? 'remove' : 'add';
        this.applyPaint(p);
      }
    }
  },
  applyPaint(p) {
    const w = this.app.world, T = w.terrain, has = T.hasStake(p.tx, p.ty);
    if ((this.paint === 'add' && !has) || (this.paint === 'remove' && has)) w.toggleStake(p.x, p.y);
  },
  move(e) {
    const app = this.app, p = this.pos(e);
    app.view.hover = p;
    if (!this.start) return;
    if (this.paint) { this.applyPaint(p); return; }
    if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > 0.4) app.view.box = { x0: this.start.x, y0: this.start.y, x1: p.x, y1: p.y };
  },
  up(e) {
    const app = this.app, w = app.world, p = this.pos(e), view = app.view;
    if (!this.start) return;
    const box = view.box; view.box = null;
    const start = this.start; this.start = null;
    if (this.paint) { this.paint = null; return; }
    if (box) {
      const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
      if (!e.shiftKey) view.sel.clear();
      for (const u of w.alive('player')) if (u.type.domain !== 'fixed' && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) view.sel.add(u);
      return;
    }
    const u = w.unitAt(start.x, start.y, 'player');
    if (u) {
      if (e.shiftKey) view.sel.has(u) ? view.sel.delete(u) : view.sel.add(u);
      else { view.sel.clear(); view.sel.add(u); }
    } else if (e.pointerType === 'touch' && view.sel.size) {
      this.command(p);  // màn hình cảm ứng: chạm chỗ trống / quân giặc = ra lệnh
    } else if (!e.shiftKey) view.sel.clear();
  },

  // Ra lệnh cho các quân đang chọn tại điểm p.
  command(p) {
    const app = this.app, w = app.world, units = [...app.view.sel].filter(u => !u.dead && u.type.domain !== 'fixed');
    if (!units.length) return;
    const foe = w.unitAt(p.x, p.y, 'enemy');
    if (w.phase === 'battle' && foe && w.visibleToPlayer(foe)) {
      for (const u of units) w.orderAttack(u, foe);
      w.fx({ kind: 'text', x: foe.x, y: foe.y - 0.8, text: 'Tấn công', color: '#ff7b66', dur: 0.8 });
      return;
    }
    const slots = this.slots(units, p);
    units.forEach((u, i) => {
      const s = slots[i]; if (!s) return;
      if (w.phase === 'plan') w.deploy(u, s.x, s.y);
      else w.orderMove(u, s.x, s.y);
    });
    if (w.phase === 'battle') w.fx({ kind: 'splash', x: p.x, y: p.y, dur: 0.5 });
  },
  // Xếp đội hình: mỗi quân một ô hợp lệ gần điểm đích nhất.
  slots(units, p) {
    const w = this.app.world, T = w.terrain, taken = new Set(), out = [];
    const cand = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) cand.push({ tx: p.tx + dx, ty: p.ty + dy, d: Math.hypot(dx, dy) });
    cand.sort((a, b) => a.d - b.d);
    for (const u of units) {
      const ok = c => !taken.has(c.tx + ',' + c.ty) && (w.phase === 'plan' ? w.canDeploy(u, c.tx + 0.5, c.ty + 0.5) : T.speedAt(u.type, c.tx, c.ty, w.level) > 0);
      const c = cand.find(ok);
      if (!c) { out.push(null); continue; }
      taken.add(c.tx + ',' + c.ty);
      out.push(units.length === 1 && c.d === 0 ? { x: p.x, y: p.y } : { x: c.tx + 0.5, y: c.ty + 0.5 });
    }
    return out;
  },

  key(e) {
    if (e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const app = this.app, w = app.world, k = e.key.toLowerCase();
    if (!document.getElementById('introModal').hidden || !document.getElementById('endModal').hidden) return;
    if (k === ' ') { e.preventDefault(); if (w.phase === 'plan') app.start(); else app.togglePause(); }
    else if (k === 'h') app.toggleHold();
    else if (k === 's') app.stop();
    else if (k === 'a') { app.view.sel.clear(); for (const u of w.alive('player')) if (u.type.domain !== 'fixed') app.view.sel.add(u); }
    else if (k === 'escape') app.view.sel.clear();
    else if (k === '1' || k === '2' || k === '4') app.setSpeed(+k);
  },
};
