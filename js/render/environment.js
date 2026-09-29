'use strict';
function drawWall(c, t) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b0706'); g.addColorStop(1, '#1f130b');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 20; i++) {
    const bx = ((rand(i * 3.1) * 1.4 + cam.yaw * 0.35 + 10) % 1.4) - 0.2;
    const x = bx * W, y = (0.04 + rand(i * 7.7) * 0.42) * H + Math.sin(t * 0.4 + i) * H * 0.004;
    const r = H * (0.02 + rand(i * 1.3) * 0.07), col = rand(i * 5.5) > 0.35 ? '255,152,64' : '255,70,44', a = 0.08 + rand(i * 9.1) * 0.17;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(.72, `rgba(${col},${a * .75})`); rg.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
}
function drawTable(c) {
  const y = -BT; c.save(); c.beginPath(); let any = false;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 18; j++) {
    const x0 = -18 + i * 1.5, z0 = -12 + j * 1.5;
    const q = [P(x0, y, z0), P(x0 + 1.5, y, z0), P(x0 + 1.5, y, z0 + 1.5), P(x0, y, z0 + 1.5)];
    if (q.some(p => p.zr < 0.4)) continue;
    c.moveTo(q[0].x, q[0].y); c.lineTo(q[1].x, q[1].y); c.lineTo(q[2].x, q[2].y); c.lineTo(q[3].x, q[3].y); c.closePath(); any = true;
  }
  if (!any) { c.restore(); return; }
  c.fillStyle = '#3b2416'; c.fill(); c.clip();
  const cp = P(0, y, 0), g = c.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, Math.max(W, H) * 0.95);
  g.addColorStop(0, '#77492b'); g.addColorStop(.4, '#43281a'); g.addColorStop(1, '#120905');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const s0 = scaleAt(0, y, 0);
  for (let j = 0; j < 60; j++) {
    const zz = -12 + j * 0.45; c.beginPath(); let pen = false;
    for (let k = 0; k <= 36; k++) {
      const xx = -18 + k, z2 = zz + 0.12 * Math.sin(xx * 0.35 + j * 1.9) + 0.05 * Math.sin(xx * 1.3 + j), q = P(xx, y, z2);
      if (q.zr < 0.4) { pen = false; continue; } pen ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); pen = true;
    }
    c.strokeStyle = j % 4 === 0 ? 'rgba(8,3,0,.38)' : 'rgba(255,200,150,.05)'; c.lineWidth = Math.max(1, s0 * 0.03); c.stroke();
  }
  // lacquer sheen: soft reflection of the lamp
  const lp = P(-2, y, -8); if (lp.zr > 0.4) { const sg = c.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, H * 0.5); sg.addColorStop(0, 'rgba(255,215,160,.12)'); sg.addColorStop(1, 'rgba(255,215,160,0)'); c.fillStyle = sg; c.fillRect(0, 0, W, H); }
  c.restore();
  const e1 = P(-18, y, -12), e2 = P(18, y, -12);
  if (e1.zr > 0.4 && e2.zr > 0.4) { c.beginPath(); c.moveTo(e1.x, e1.y); c.lineTo(e2.x, e2.y); c.strokeStyle = 'rgba(255,205,150,.22)'; c.lineWidth = Math.max(1, H / 700); c.stroke(); }
}
function drawSpot(c) {
  const cp = P(0, 0, 0), g = c.createRadialGradient(cp.x, cp.y, H * 0.25, cp.x, cp.y, Math.max(W, H) * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function drawDust(c, t) {
  const cp = P(0, 0, 0);
  for (let i = 0; i < 46; i++) {
    const x = cp.x + (rand(i * 2.3) - 0.5) * W * 0.7 + Math.sin(t * 0.3 + i) * W * 0.01;
    const y = (((rand(i * 4.1) - t * 0.006 * (0.5 + rand(i))) % 1) + 1) % 1 * H;
    const r = (0.6 + rand(i * 8.8) * 1.6) * H / 700;
    c.globalAlpha = (0.1 + rand(i * 6.6) * 0.3) * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.5 + i)));
    c.fillStyle = '#ffe2b8'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}
