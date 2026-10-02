'use strict';
// Chạy thử trận đánh không cần trình duyệt: node games/bach-dang/test/sim-test.js
// Kiểm tra (1) không làm gì thì thua, (2) đánh theo cách của Ngô Quyền thì thắng,
// (3) cọc không làm thuyền mắc khi nước lớn, (4) bỏ cọc đi thì thua.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(js\/(?:core|data)\/[^"]+)"><\/script>/g)].map(m => m[1]);
const ctx = { console }; vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const BD = vm.runInContext('BD', ctx);
const battle = BD.battles['bach-dang-938'];

function run(setup, during, seed = 938, verbose = false) {
  const w = new BD.World(battle, seed);
  setup(w);
  w.start();
  let logged = 0;
  while (w.phase === 'battle' && w.t < 400) {
    w.update(1 / 20);
    if (during) during(w);
    if (verbose) for (; logged < w.log.length; logged++) { const l = w.log[logged]; console.log('   ', BD.fmtTime(l.t), l.who ? l.who + ':' : '', l.text); }
  }
  return w;
}
const P = (w, pred) => w.units.filter(u => u.side === 'player' && pred(u));

// Cách đánh lịch sử: cọc kín lòng sông, cung thủ phục trong lau sậy hai bờ (giữ im lặng tới khi giặc rút),
// thuyền nhẹ nhử giặc, bộ binh chờ nước cạn lội bãi bồi đánh thuyền mắc cọc.
function historical(w) {
  const T = w.terrain;
  for (let x = 23; x <= 33 && T.stakes.size < battle.maxStakes; x++)
    for (let y = 5; y <= 16; y++) if (T.canStake(x, y)) w.toggleStake(x, y);
  const archers = P(w, u => u.typeId === 'cung_thu'), inf = P(w, u => u.typeId === 'bo_binh');
  const spots = [[23, 8], [25, 8], [24, 15]];  // lau sậy bờ bắc, rừng bờ nam
  archers.forEach((u, i) => { if (!w.deploy(u, ...spots[i])) throw new Error('không đặt được cung thủ'); u.holdFire = true; });
  [[21, 15], [22, 15], [22, 14]].forEach((p, i) => { if (!w.deploy(inf[i], ...p)) throw new Error('không đặt được bộ binh'); inf[i].holdFire = true; });
  P(w, u => u.typeId === 'thuyen_nhe').forEach((u, i) => w.deploy(u, 30 + (i % 2), 10 + i));
  w.deploy(w.byTag('ngo_quyen'), 1, 11);
}
// Đường lui của thuyền nhẹ, từ cửa sông ngược lên thượng nguồn.
const UPRIVER = [[30, 11], [24, 11], [18, 8], [12, 8], [7, 10], [2, 11]];
function historicalDuring(w) {
  // Nhử giặc: thuyền nhẹ bắn rồi lui dần lên thượng nguồn, giữ khoảng cách.
  if (!w._released) for (const u of P(w, u => !u.dead && u.typeId === 'thuyen_nhe')) {
    const near = w.alive('enemy').some(e => BD.dist(e.x, e.y, u.x, u.y) < 3.2);
    if (near && !u.path.length) {
      const next = UPRIVER.find(p => p[0] < u.x - 2.5);
      if (next) w.orderMove(u, next[0] + 0.5, next[1] + 0.5);
    }
  }
  if (w.enemyOrder === 'retreat' && !w._released) {
    w._released = true;
    for (const u of P(w, u => !u.dead && u.type.domain !== 'fixed')) u.holdFire = false;
    for (const u of P(w, u => !u.dead && u.typeId === 'thuyen_nhe')) w.orderMove(u, 20, 9);
  }
  // Nước cạn: bộ binh lội bãi bồi ra đánh thuyền mắc cọc gần bờ.
  if (w.level < BD.SHALLOW_DRY && w._released) {
    for (const u of P(w, u => !u.dead && u.typeId === 'bo_binh' && !u.order)) {
      const tg = w.alive('enemy').filter(e => e.state !== 'ok' && w.detects('player', e)).sort((a, b) => BD.dist(u.x, u.y, a.x, a.y) - BD.dist(u.x, u.y, b.x, b.y))[0];
      if (tg) w.orderAttack(u, tg);
    }
  }
}

let fail = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fail++; };
const verbose = process.argv.includes('-v');

console.log('1. Không làm gì:');
let w = run(() => {}, null, 938, verbose);
console.log(`   kết quả: ${w.result && (w.result.win ? 'THẮNG' : 'THUA')} lúc ${BD.fmtTime(w.t)} – ${w.result && w.result.text}`, JSON.stringify(w.stats));
check(w.result && !w.result.win, 'không làm gì thì thua');

console.log('2. Cách đánh của Ngô Quyền (5 hạt giống ngẫu nhiên):');
let wins = 0;
for (const seed of [1, 2, 3, 938, 1288]) {
  w = run(historical, historicalDuring, seed, verbose && seed === 938);
  console.log(`   seed ${seed}: ${w.result.win ? 'THẮNG' : 'THUA'} lúc ${BD.fmtTime(w.t)} – ${w.result.text}`, JSON.stringify(w.stats));
  if (w.result.win) wins++;
}
check(wins >= 4, `thắng ${wins}/5 trận`);

console.log('3. Cọc không gây hại khi nước lớn:');
w = new BD.World(battle); historical(w); w.start();
while (w.t < 40) w.update(1 / 20);
check(w.stats.impaled === 0, `chưa thuyền nào mắc cọc ở phút 0:40 (mực triều ${w.level.toFixed(2)})`);

console.log('4. Cùng cách đánh nhưng không cắm cọc:');
w = run(w => { historical(w); w.terrain.stakes.clear(); }, historicalDuring);
console.log(`   kết quả: ${w.result.win ? 'THẮNG' : 'THUA'} – ${w.result.text}`, JSON.stringify(w.stats));
check(!w.result.win, 'không có cọc thì không thắng được');

console.log(fail ? `\n${fail} kiểm tra thất bại` : '\nTất cả kiểm tra đều đạt');
process.exit(fail ? 1 : 0);
