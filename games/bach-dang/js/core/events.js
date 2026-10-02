'use strict';
// Hệ thống sự kiện kịch bản: điều kiện (trigger) -> hành động.
// Mỗi điều kiện là một object; mọi khóa trong object phải cùng đúng (AND).
//   time: giây          tideBelow / tideAbove: mực triều (kèm falling / rising: true)
//   enemyInZone: tên vùng   sunkAtLeast / escapedAtLeast / impaledAtLeast / lostAtLeast: số
//   unitDead: tag       unitHpBelow: { tag, frac }      enemyOrder: 'advance' | 'retreat'
// Hành động: { say, who, kind } | { spawn: tên đợt } | { enemyOrder }
BD.Events = {
  init(w) { w.fired = new Set(); },
  check(w, c) {
    const T = w.terrain, lv = w.level;
    if (c.time != null && w.t < c.time) return false;
    if (c.tideBelow != null && !(lv < c.tideBelow)) return false;
    if (c.tideAbove != null && !(lv > c.tideAbove)) return false;
    if (c.falling && !T.falling(w.t)) return false;
    if (c.rising && T.falling(w.t)) return false;
    if (c.sunkAtLeast != null && w.stats.sunk < c.sunkAtLeast) return false;
    if (c.escapedAtLeast != null && w.stats.escaped < c.escapedAtLeast) return false;
    if (c.impaledAtLeast != null && w.stats.impaled < c.impaledAtLeast) return false;
    if (c.lostAtLeast != null && w.stats.lost < c.lostAtLeast) return false;
    if (c.enemyOrder && w.enemyOrder !== c.enemyOrder) return false;
    if (c.unitDead) { const u = w.byTag(c.unitDead); if (!u || !u.dead) return false; }
    if (c.unitHpBelow) { const u = w.byTag(c.unitHpBelow.tag); if (!u || u.dead || u.hp / u.maxHp >= c.unitHpBelow.frac) return false; }
    if (c.enemyInZone) {
      const z = w.battle.zones[c.enemyInZone];
      if (!w.alive('enemy').some(u => u.x >= z.x0 && u.x < z.x1 + 1 && u.y >= z.y0 && u.y < z.y1 + 1)) return false;
    }
    return true;
  },
  run(w, a) {
    if (a.say) w.say(a.who || '', a.say, a.kind || 'story');
    if (a.spawn) for (const d of w.battle.enemy) if (d.wave === a.spawn) { w.spawn(d, 'enemy'); w.enemySpawned = (w.enemySpawned || 0) + 1; }
    if (a.enemyOrder && w.enemyOrder !== a.enemyOrder) {
      w.enemyOrder = a.enemyOrder;
      for (const u of w.alive('enemy')) { u.ai.mode = null; u.order = null; u.path = []; }
    }
  },
  update(w) {
    const B = w.battle;
    B.events.forEach((e, i) => {
      if (w.fired.has(i) || !this.check(w, e.when)) return;
      w.fired.add(i);
      for (const a of e.do) this.run(w, a);
    });
    for (const c of B.defeat) if (this.check(w, c)) return w.end('lose', c.text);
    for (const c of B.victory) if (this.check(w, c)) return w.end('win', c.text);
    // Hết quân địch trên sông mà chưa đủ điều kiện thắng thì coi như thua.
    if (w.enemySpawned === B.enemy.length && !w.alive('enemy').length)
      w.end('lose', 'Trận đánh kết thúc mà quân Nam Hán chưa bị tiêu diệt đủ.');
  },
};
