'use strict';
const GROUND = { ring: 1, ringAt: 1, path: 1, cell: 1, mate: 1 }; // lớp vẽ dưới quân cờ; các lớp khác vẽ đè lên
function drawScene(c, t) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawWall(c, t); drawTable(c);
  // table items: those hidden behind the board get drawn before it
  const items = TL.pieces.map(pc => ({ pc, pos: tremor(pc.id, pieceAt(pc.id, pc, t), t) }));
  const behind = pos => !onBoardXZ(pos.x, pos.z) && pos.y < 0.3 && ((pos.x > BX && cam.pos[0] < BX) || (pos.x < -BX && cam.pos[0] > -BX) || (pos.z < -BZ && cam.pos[2] > -BZ));
  const cupBehind = cam.pos[0] > -BX;
  const pre = items.filter(it => behind(it.pos)), post = items.filter(it => !behind(it.pos));
  const drawItems = list => {
    list.forEach(it => drawPieceShadow(c, it.pos));
    list.map(it => ({ it, d: P(it.pos.x, it.pos.y, it.pos.z).z })).sort((a, b) => b.d - a.d).forEach(o => drawPiece(c, o.it.pc, o.it.pos));
  };
  if (cupBehind) drawCup(c);
  drawItems(pre);
  drawSpot(c);
  const mk = TL.ov.find(o => o.k === 'mate' && o.x);
  RIVER_HIDE = mk ? { x: mk.x, a: win(t, mk.a, mk.b, .3) } : { x: null, a: 0 };
  drawBoard(c);
  const byId = {}; items.forEach(it => byId[it.pc.id] = it.pos);
  for (const o of TL.ov) {
    if (o.elev || !(o.k in GROUND)) continue;
    const a = win(t, o.a, o.b); if (a <= 0.01) continue;
    if (o.k === 'ring') { const p = byId[o.id]; drawRing(c, p.x, p.z, 0.56 + (o.pulse ? 0.04 * Math.sin(t * 9) : 0), o.color, a, onBoardXZ(p.x, p.z) ? 0.015 : -BT + 0.015); }
    else if (o.k === 'ringAt') drawRing(c, o.x, o.z, o.r, o.color, a);
    else if (o.k === 'path') glowPath(c, o.pts, { color: o.color, alpha: a, w: o.w || .06, prog: smooth(o.p0, o.p1, t), dash: o.dash, arrow: o.arrow }, t);
    else if (o.k === 'mate') drawRiverMark(c, o.text, o.x, a, smooth(o.a, o.a + .45, t));
    else if (o.k === 'cell') drawCell(c, o.x, o.z, o.color, a * (o.pulse ? 0.8 + 0.2 * Math.sin(t * 7) : 1), o.strong);
  }
  drawItems(post);
  if (!cupBehind) drawCup(c);
  for (const o of TL.ov) if (o.k === 'dim') drawDim(c, o, byId, t);
  for (const o of TL.ov) {
    if (o.k === 'glow') { if (byId[o.id]) drawGlow(c, byId[o.id], o.color, win(t, o.a, o.b), t); continue; }
    if (o.k === 'burst') { burst(c, o.x, o.z, o.t0, t); continue; }
    if (o.k === 'x') { drawX(c, o.x, o.z, win(t, o.a, o.b)); continue; }
    if (!o.elev) continue;
    const a = win(t, o.a, o.b); if (a > 0.01) glowPath(c, o.pts, { color: o.color, alpha: a, w: o.w || .06, dash: o.dash, prog: smooth(o.p0, o.p1, t), arrow: o.arrow }, t);
  }
  drawDust(c, t);
}

// ================= 2D UI drawn on canvas (so it lands in the exported video) =================
function wrap(c, text, maxW) { const words = text.split(' '), lines = []; let cur = ''; for (const w of words) { const s = cur ? cur + ' ' + w : w; if (c.measureText(s).width > maxW && cur) { lines.push(cur); cur = w; } else cur = s; } if (cur) lines.push(cur); return lines; }
function drawUI(c, t) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  // captions
  let best = null, ba = 0; for (const cp of TL.caps) { const a = win(t, cp.a, cp.b); if (a > ba) { ba = a; best = cp; } }
  if (SHOW_SUBS && best && ba > 0.01) {
    const fs = U * 0.034; c.save(); c.globalAlpha = ba;
    c.font = `800 ${fs * .9}px ${UI}`; const chipW = best.chip ? c.measureText(best.chip).width + fs * 1.1 : 0;
    c.font = `600 ${fs}px ${UI}`;
    const gap = best.chip ? fs * .6 : 0, lines = wrap(c, best.text, W * (W < H ? .88 : .7) - chipW - gap), tw = Math.max(...lines.map(l => c.measureText(l).width));
    const lh = fs * 1.34, padX = fs * .75, padY = fs * .55, bw = padX * 2 + chipW + gap + tw, bh = padY * 2 + lh * lines.length;
    const bx = (W - bw) / 2, by = H - BAR - H * 0.035 - bh;
    rr(c, bx, by, bw, bh, Math.min(bh / 2, fs * 1.2)); c.fillStyle = 'rgba(12,8,5,.8)'; c.fill();
    if (best.chip) { const ch = fs * 1.45, cy = by + padY + (lh - ch) / 2; rr(c, bx + padX, cy, chipW, ch, ch / 2); c.fillStyle = '#efb24a'; c.fill(); c.font = `800 ${fs * .9}px ${UI}`; c.fillStyle = '#1f1206'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(best.chip, bx + padX + chipW / 2, cy + ch / 2 + fs * .03); }
    c.font = `600 ${fs}px ${UI}`; c.fillStyle = '#fff3df'; c.textAlign = 'left'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, bx + padX + chipW + gap, by + padY + lh * (i + .5) + fs * .03));
    c.restore();
  }
  // move list
  const done = TL.hud.filter(h => t >= h.t).slice(-6), fs2 = U * 0.027;
  c.save(); c.font = `700 ${fs2}px ${UI}`; c.textBaseline = 'middle';
  done.forEach((h, i) => {
    const a = smooth(h.t, h.t + .35, t) * (1 - smooth(TL.endA - .3, TL.endA, t)); if (a <= 0) return;
    const x = W * .024 - (1 - a) * 10, y = BAR + U * .03 + i * fs2 * 1.9, w = c.measureText(h.text).width + fs2 * 1.2;
    c.globalAlpha = a; rr(c, x, y, w, fs2 * 1.55, fs2 * .35); c.fillStyle = 'rgba(12,8,5,.66)'; c.fill();
    c.fillStyle = h.side === 'r' ? '#ff8a72' : '#eee6d8'; c.fillText(h.text, x + fs2 * .6, y + fs2 * .8);
  });
  c.restore();
  // title card
  const ta = 1 - smooth(2.8, 3.6, t);
  if (ta > .01) {
    c.save(); c.globalAlpha = ta; const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * .6); g.addColorStop(0, 'rgba(10,6,3,.35)'); g.addColorStop(1, 'rgba(10,6,3,.85)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f6e7cc'; c.font = `800 ${U * .1}px ${UI}`;
    const tl = wrap(c, TL.title, W * .85); tl.forEach((l, i) => c.fillText(l, W / 2, H * .44 + (i - (tl.length - 1) / 2) * U * .11));
    c.font = `600 ${U * .032}px ${UI}`; c.fillStyle = '#e3b35c'; c.fillText(TL.sub, W / 2, H * .44 + tl.length * U * .055 + U * .05); c.restore();
  }
  // end card
  const ea = smooth(TL.endA, TL.endA + .6, t);
  if (ea > .01) {
    c.save(); c.globalAlpha = ea; const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * .6); g.addColorStop(0, 'rgba(10,6,3,.2)'); g.addColorStop(1, 'rgba(10,6,3,.8)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f6e7cc'; c.font = `800 ${U * .085}px ${UI}`; c.fillText(TL.result, W / 2, H * .43);
    c.font = `700 ${U * .03}px ${UI}`; c.fillStyle = '#e3b35c'; wrap(c, TL.moves, W * .8).slice(0, 3).forEach((l, i) => c.fillText(l, W / 2, H * .53 + i * U * .045)); c.restore();
  }
  // vignette + letterbox
  const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
}

let mb = 0, mbTarget = 0;
const FLAT = { tx: 0, tz: 0, d: 18.5, yaw: 0, pitch: 89.5 };
function render(t) {
  const cp = camAt(t);
  // Tall frames (Shorts, 4:5): look down more steeply and swing less sideways so the board fills the height.
  const port = clamp((1.3 - W / H) / 0.75);
  cp.pitch = Math.min(80, cp.pitch + 16 * port); cp.yaw *= 1 - 0.5 * port; cp.tz += 0.3 * port;
  setCamera({ tx: lerp(cp.tx, FLAT.tx, mb), tz: lerp(cp.tz, FLAT.tz, mb), d: lerp(cp.d, FLAT.d, mb), yaw: lerp(cp.yaw, FLAT.yaw, mb), pitch: lerp(cp.pitch, FLAT.pitch, mb) });
  const dof = cp.dof * (1 - mb);
  BAR = 0;
  drawScene(sc, t);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H); ctx.drawImage(sceneCv, 0, 0);
  if (dof > 0.01) {
    const fc = P(cp.fx, 0, cp.fz), pr = P(cp.fx + cp.fr * cam.r[0], 0, cp.fz + cp.fr * cam.r[2]), fl = Math.hypot(cam.f[0], cam.f[2]) || 1;
    const pf = P(cp.fx + cp.fr * cam.f[0] / fl, 0, cp.fz + cp.fr * cam.f[2] / fl);
    const rx = Math.max(20, Math.hypot(pr.x - fc.x, pr.y - fc.y)), ry = Math.max(20, Math.hypot(pf.x - fc.x, pf.y - fc.y) * 1.25);
    if (blurOK) {
      smc.setTransform(1, 0, 0, 1, 0, 0); smc.clearRect(0, 0, smallCv.width, smallCv.height);
      smc.filter = `blur(${(H / 360).toFixed(1)}px)`; smc.drawImage(sceneCv, 0, 0, smallCv.width, smallCv.height); smc.filter = 'none';
      ctx.globalAlpha = dof; ctx.drawImage(smallCv, 0, 0, W, H); ctx.globalAlpha = 1;
      mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalCompositeOperation = 'source-over'; mc.clearRect(0, 0, W, H); mc.drawImage(sceneCv, 0, 0);
      mc.globalCompositeOperation = 'destination-in'; mc.setTransform(rx, 0, 0, ry, fc.x, fc.y);
      const g = mc.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, '#000'); g.addColorStop(.6, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = g; mc.fillRect(-60, -60, 120, 120); mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalCompositeOperation = 'source-over';
      ctx.drawImage(maskCv, 0, 0);
    }
    ctx.save(); ctx.setTransform(rx, 0, 0, ry, fc.x, fc.y);
    const g2 = ctx.createRadialGradient(0, 0, .6, 0, 0, 1.8); g2.addColorStop(0, 'rgba(8,5,2,0)'); g2.addColorStop(1, `rgba(8,5,2,${(.55 * dof).toFixed(3)})`);
    ctx.fillStyle = g2; ctx.fillRect(-60, -60, 120, 120); ctx.restore();
  }
  for (const o of TL.ov) if (o.k === 'label') label(ctx, o.w, o.text, win(t, o.a, o.b), o.side, o.color);
  drawUI(ctx, t);
  updateDOM(t);
}
