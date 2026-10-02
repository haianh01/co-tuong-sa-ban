'use strict';
// AI phe địch: máy trạng thái đơn giản (tiến quân / đuổi đánh / rút lui).
// Phần "lịch sử" (khi nào rút) nằm trong sự kiện của file trận, không nằm ở đây.
BD.AI = {
  update(w, dt) {
    w._aiT = (w._aiT || 0) - dt;
    if (w._aiT > 0) return;
    w._aiT = 0.4;
    const cfg = w.battle.ai, objective = w.byTag(cfg.objective);
    for (const u of w.alive('enemy')) {
      if (u.state !== 'ok') continue;
      const ai = u.ai;
      if (w.enemyOrder === 'retreat') { this.retreat(w, u, cfg); continue; }

      // Đang đuổi: bỏ cuộc nếu bị nhử quá xa hoặc mất dấu.
      if (ai.mode === 'chase') {
        const tg = ai.target;
        const lost = !tg || tg.dead || !w.detects('enemy', tg);
        if (lost || BD.dist(u.x, u.y, ai.ox, ai.oy) > cfg.leash) {
          ai.mode = 'advance'; ai.ignoreUntil = w.t + cfg.regroup; u.order = null;
        } else continue;
      }
      // Thấy quân ta gần (hoặc vừa bị bắn) thì quay sang đánh.
      if (w.t >= (ai.ignoreUntil || 0)) {
        let tg = null, bd = cfg.aggro;
        for (const p of w.alive('player')) {
          if (p.type.domain === 'fixed') continue;
          const d = BD.dist(u.x, u.y, p.x, p.y);
          if (d < bd && w.detects('enemy', p)) { tg = p; bd = d; }
        }
        const la = ai.lastAttacker;
        if (!tg && la && !la.dead && w.detects('enemy', la) && BD.dist(u.x, u.y, la.x, la.y) < cfg.aggro * 1.6) tg = la;
        ai.lastAttacker = null;
        if (tg) { ai.mode = 'chase'; ai.target = tg; ai.ox = u.x; ai.oy = u.y; w.orderAttack(u, tg); continue; }
      }
      // Tiến về mục tiêu (đồn của Ngô Quyền).
      ai.mode = 'advance';
      if (objective && !objective.dead && (!u.order || u.order.target !== objective)) w.orderAttack(u, objective);
    }
  },
  retreat(w, u, cfg) {
    const ai = u.ai;
    if (ai.mode !== 'retreat' || w.t - u.repathT > 3 || !u.path.length) {
      ai.mode = 'retreat';
      u.order = { kind: 'move', x: cfg.exit.x + 0.5, y: cfg.exit.y + 0.5 };
      w.repath(u);
    }
  },
};
