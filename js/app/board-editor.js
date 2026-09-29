'use strict';
// Interactive 2D board.
//  - "Xếp thế cờ": drag pieces around or place them from the tray; the FEN field is written automatically.
//  - "Ghi nước đi": click or drag a piece to a highlighted square; the move is checked against the rules
//    and appended to the script in standard notation.
// The board always reads from the FEN and script fields, so typing in them still works.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = $('edBoard'), statusEl = $('edStatus'), tray = $('edTray');
  const X = c => 80 + c * 100, Y = r => 90 + r * 100;
  const FEN_LETTER = { k: 'k', a: 'a', e: 'b', h: 'n', r: 'r', c: 'c', p: 'p' };
  let mode = 'setup', setupB = new Array(90).fill(null), setupSide = 'r', tool = null, sel = null, drag = null, fenError = '';

  // ---------- helpers ----------
  const fire = el => el.dispatchEvent(new Event('input', { bubbles: true }));
  function fenOf(B, side) {
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let row = '', gap = 0;
      for (let c = 0; c < 9; c++) {
        const p = B[r * 9 + c];
        if (!p) { gap++; continue; }
        if (gap) { row += gap; gap = 0; }
        const l = FEN_LETTER[p.type]; row += p.side === 'r' ? l.toUpperCase() : l;
      }
      if (gap) row += gap; rows.push(row);
    }
    return rows.join('/') + (side === 'r' ? ' w' : ' b');
  }
  const isMoveLine = l => { const s = l.trim(); return s && !s.startsWith('|') && !s.startsWith('//'); };
  // Replays the script over the FEN and returns the resulting position.
  function replay() {
    const { B, side } = parseFEN(fenIn.value);
    let b = B, s = side, n = 0, err = '', last = null;
    const lines = scriptIn.value.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!isMoveLine(lines[i])) continue;
      const mv = lines[i].split('|')[0].trim();
      try { const m = resolve(b, s, mv); last = m; b = apply(b, m); s = opp(s); n++; }
      catch (e) { err = `Dòng ${i + 1} (“${mv}”): ${e}`; break; }
    }
    return { b, s, n, err, last };
  }
  const iccs = m => { const f = i => String.fromCharCode(97 + i % 9) + (9 - ((i / 9) | 0)); return f(m[0]) + f(m[1]); };
  function readSetup() {
    try { const { B, side } = parseFEN(fenIn.value); setupB = B; setupSide = side; fenError = ''; }
    catch (e) { fenError = typeof e === 'string' ? e : 'FEN không hợp lệ.'; }
  }
  function commitSetup() { fenIn.value = fenOf(setupB, setupSide); fire(fenIn); }

  // ---------- drawing ----------
  function staticBoard() {
    let s = `<defs><radialGradient id="edPc" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fdebc8"/><stop offset=".7" stop-color="#eec48c"/><stop offset="1" stop-color="#c98f52"/></radialGradient></defs>`;
    s += `<rect x="2" y="2" width="956" height="1076" rx="20" fill="#7a3d1d"/><rect x="28" y="44" width="904" height="992" rx="6" fill="#dcae6c"/>`;
    const L = (x1, y1, x2, y2, w = 3) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5a2e10" stroke-width="${w}"/>`;
    for (let r = 0; r < 10; r++) s += L(X(0), Y(r), X(8), Y(r));
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) s += L(X(c), Y(0), X(c), Y(9));
      else { s += L(X(c), Y(0), X(c), Y(4)); s += L(X(c), Y(5), X(c), Y(9)); }
    }
    s += L(X(3), Y(0), X(5), Y(2)) + L(X(5), Y(0), X(3), Y(2)) + L(X(3), Y(7), X(5), Y(9)) + L(X(5), Y(7), X(3), Y(9));
    s += `<rect x="${X(0) - 10}" y="${Y(0) - 10}" width="820" height="920" fill="none" stroke="#5a2e10" stroke-width="6"/>`;
    s += `<text x="${X(2)}" y="${(Y(4) + Y(5)) / 2}" font-size="56" font-family='${CJK}' font-weight="900" fill="#6b3a16" opacity=".55" text-anchor="middle" dominant-baseline="central">楚　河</text>`;
    s += `<text x="${X(6)}" y="${(Y(4) + Y(5)) / 2}" font-size="56" font-family='${CJK}' font-weight="900" fill="#6b3a16" opacity=".55" text-anchor="middle" dominant-baseline="central">漢　界</text>`;
    // File numbers used by Vietnamese notation: black counts from its right (our left), red from its right.
    for (let c = 0; c < 9; c++) {
      s += `<text x="${X(c)}" y="24" font-size="24" font-weight="700" fill="#f3dcb4" text-anchor="middle" dominant-baseline="central">${c + 1}</text>`;
      s += `<text x="${X(c)}" y="1058" font-size="24" font-weight="700" fill="#ffd2c4" text-anchor="middle" dominant-baseline="central">${9 - c}</text>`;
    }
    return s;
  }
  const STATIC = staticBoard();
  function pieceSvg(p, x, y, extra = '') {
    const col = p.side === 'r' ? '#a8231b' : '#1f1a16';
    return `<g transform="translate(${x},${y})" ${extra}><circle r="45" fill="#000" opacity=".25" cx="3" cy="5"/><circle r="44" fill="url(#edPc)" stroke="${col}" stroke-width="3"/><circle r="35" fill="none" stroke="${col}" stroke-width="2" opacity=".8"/><text font-size="46" font-weight="900" font-family='${CJK}' fill="${col}" text-anchor="middle" dominant-baseline="central" y="2">${CH[p.side][p.type]}</text></g>`;
  }
  function render() {
    let B, s, targets = [], last = null, status = '', check = -1, over = false;
    if (mode === 'setup') {
      B = setupB; s = setupSide;
      status = fenError ? `FEN đang lỗi: ${fenError}` : setupWarnings();
    } else {
      let r;
      try { r = replay(); } catch (e) { r = null; status = `Thế cờ chưa hợp lệ: ${e}. Hãy chuyển sang “Xếp thế cờ” để sửa.`; }
      if (r) {
        B = r.b; s = r.s; last = r.last;
        const moves = legal(B, s);
        if (sel != null) targets = moves.filter(m => m[0] === sel).map(m => m[1]);
        if (inCheck(B, s)) check = kingIdx(B, s);
        over = moves.length === 0;
        status = r.err ? `Kịch bản dừng ở lỗi. ${r.err}` :
          over ? `${s === 'r' ? 'Đỏ' : 'Đen'} hết nước đi: ván cờ kết thúc sau ${r.n} nước.` :
          `Lượt ${s === 'r' ? 'Đỏ' : 'Đen'} đi${check >= 0 ? ' (đang bị chiếu)' : ''}. Đã ghi ${r.n} nước.`;
      } else B = setupB;
    }
    let h = STATIC;
    if (last) for (const i of last) h += `<circle cx="${X(i % 9)}" cy="${Y((i / 9) | 0)}" r="50" fill="#f0b44c" opacity=".35"/>`;
    if (check >= 0) h += `<circle cx="${X(check % 9)}" cy="${Y((check / 9) | 0)}" r="54" fill="#ff3b2f" opacity=".45"/>`;
    if (sel != null) h += `<circle cx="${X(sel % 9)}" cy="${Y((sel / 9) | 0)}" r="52" fill="none" stroke="#f0b44c" stroke-width="7"/>`;
    for (let i = 0; i < 90; i++) {
      const p = B[i]; if (!p) continue;
      const dragging = drag && drag.moved && drag.from === i;
      h += pieceSvg(p, X(i % 9), Y((i / 9) | 0), dragging ? 'opacity=".3"' : '');
    }
    for (const t of targets) {
      const x = X(t % 9), y = Y((t / 9) | 0);
      h += B[t] ? `<circle cx="${x}" cy="${y}" r="50" fill="none" stroke="#2fbf6a" stroke-width="7"/>` : `<circle cx="${x}" cy="${y}" r="14" fill="#2fbf6a" opacity=".85"/>`;
    }
    if (drag && drag.moved && B[drag.from]) h += pieceSvg(B[drag.from], drag.x, drag.y, 'style="filter:drop-shadow(0 8px 10px rgba(0,0,0,.4))"');
    svg.innerHTML = h;
    statusEl.textContent = status;
    $('edSetupTools').hidden = mode !== 'setup'; $('edRecordTools').hidden = mode !== 'record';
    $('edSide').value = setupSide;
    tray.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === (tool ? tool.side + tool.type : tool === null ? 'move' : 'erase'))));
  }
  function setupWarnings() {
    const kr = setupB.filter(p => p && p.side === 'r' && p.type === 'k').length, kb = setupB.filter(p => p && p.side === 'b' && p.type === 'k').length;
    if (kr !== 1 || kb !== 1) return 'Cần đúng một Tướng cho mỗi bên.';
    for (let i = 0; i < 90; i++) { const p = setupB[i]; if (p && p.type === 'k' && !inPal(i % 9, (i / 9) | 0, p.side)) return 'Tướng phải đứng trong cung.'; }
    if (kingsFace(setupB)) return 'Hai Tướng đang đối mặt nhau trên một cột trống: thế cờ không hợp lệ.';
    if (inCheck(setupB, opp(setupSide))) return `${setupSide === 'r' ? 'Đen' : 'Đỏ'} đang bị chiếu mà lại không tới lượt: hãy đổi bên đi trước.`;
    return `Thế cờ hợp lệ. ${setupSide === 'r' ? 'Đỏ' : 'Đen'} đi trước. Chuyển sang “Ghi nước đi” để bắt đầu ghi.`;
  }

  // ---------- input ----------
  function hit(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const c = Math.round((p.x - 80) / 100), r = Math.round((p.y - 90) / 100);
    return { sq: onB(c, r) && Math.hypot(p.x - X(c), p.y - Y(r)) < 50 ? r * 9 + c : null, x: p.x, y: p.y };
  }
  function current() { if (mode === 'setup') return { B: setupB, s: setupSide }; try { const r = replay(); return { B: r.b, s: r.s, err: r.err }; } catch (e) { return null; } }
  function recordMove(from, to) {
    const cur = current(); if (!cur || cur.err) return false;
    const m = legal(cur.B, cur.s).find(x => x[0] === from && x[1] === to); if (!m) return false;
    let nota = toNotation(cur.B, cur.s, m);
    try { const back = resolve(cur.B, cur.s, nota); if (back[0] !== from || back[1] !== to) nota = iccs(m); } catch (e) { nota = iccs(m); }
    const s = scriptIn.value.replace(/\s+$/, '');
    scriptIn.value = (s ? s + '\n' : '') + `${nota} | `; fire(scriptIn);
    scriptIn.scrollTop = scriptIn.scrollHeight;
    return true;
  }
  svg.addEventListener('pointerdown', e => {
    const h = hit(e); if (h.sq == null) return;
    const cur = current(); if (!cur) return;
    if (mode === 'setup' && tool !== null) {
      setupB[h.sq] = tool === 'erase' ? null : { id: 'e' + Math.random().toString(36).slice(2, 8), side: tool.side, type: tool.type };
      sel = null; commitSetup(); return;
    }
    const p = cur.B[h.sq];
    if (p && (mode === 'setup' || p.side === cur.s)) { drag = { from: h.sq, sx: h.x, sy: h.y, x: h.x, y: h.y, moved: false }; svg.setPointerCapture(e.pointerId); }
    else drag = { from: null, sq: h.sq, moved: false };
  });
  svg.addEventListener('pointermove', e => {
    if (!drag || drag.from == null) return;
    const h = hit(e); drag.x = h.x; drag.y = h.y;
    if (!drag.moved && Math.hypot(h.x - drag.sx, h.y - drag.sy) > 18) { drag.moved = true; if (mode === 'record') sel = drag.from; }
    if (drag.moved) render();
  });
  svg.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null; const h = hit(e), target = h.sq;
    if (mode === 'setup') {
      if (d.moved) {
        if (target == null) setupB[d.from] = null;
        else if (target !== d.from) { setupB[target] = setupB[d.from]; setupB[d.from] = null; }
        sel = null; commitSetup(); return;
      }
      const sq = d.from != null ? d.from : d.sq;
      if (sel == null) sel = setupB[sq] ? sq : null;
      else if (sel === sq) sel = null;
      else { setupB[sq] = setupB[sel]; setupB[sel] = null; sel = null; commitSetup(); return; }
      render(); return;
    }
    // record mode
    if (d.moved) { if (target != null && recordMove(d.from, target)) sel = null; render(); return; }
    const sq = d.from != null ? d.from : d.sq;
    if (sel != null && sel !== sq && recordMove(sel, sq)) { sel = null; render(); return; }
    sel = d.from != null && sel !== d.from ? d.from : null;
    render();
  });
  svg.addEventListener('pointercancel', () => { drag = null; render(); });

  // ---------- tray & buttons ----------
  const TRAY = [...'kaehrcp'].map(t => ['r', t]).concat([...'kaehrcp'].map(t => ['b', t]));
  tray.innerHTML = `<button type="button" data-tool="move" title="Chọn và di chuyển quân">Di chuyển</button>` +
    TRAY.map(([s, t]) => `<button type="button" class="pc ${s}" data-tool="${s}${t}" title="${NAME[t]} ${s === 'r' ? 'Đỏ' : 'Đen'}">${CH[s][t]}</button>`).join('') +
    `<button type="button" data-tool="erase" title="Xóa quân">Xóa quân</button>`;
  tray.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.tool; tool = k === 'move' ? null : k === 'erase' ? 'erase' : { side: k[0], type: k[1] }; sel = null; render();
  });
  const setMode = m => { mode = m; sel = null; tool = null; $('edModeSetup').setAttribute('aria-pressed', String(m === 'setup')); $('edModeRecord').setAttribute('aria-pressed', String(m === 'record')); readSetup(); render(); };
  $('edModeSetup').onclick = () => setMode('setup');
  $('edModeRecord').onclick = () => setMode('record');
  $('edSide').onchange = e => { setupSide = e.target.value; commitSetup(); };
  $('edStart').onclick = () => { fenIn.value = START_FEN; fire(fenIn); };
  $('edClear').onclick = () => { setupB = new Array(90).fill(null); setupB[4] = { id: 'bk', side: 'b', type: 'k' }; setupB[85] = { id: 'rk', side: 'r', type: 'k' }; sel = null; commitSetup(); };
  $('edUndo').onclick = () => {
    const lines = scriptIn.value.split('\n'); for (let i = lines.length - 1; i >= 0; i--) if (isMoveLine(lines[i])) { lines.splice(i, 1); break; }
    scriptIn.value = lines.join('\n').replace(/\s+$/, ''); fire(scriptIn);
  };
  $('edClearMoves').onclick = () => { scriptIn.value = scriptIn.value.split('\n').filter(l => !isMoveLine(l)).join('\n').replace(/\s+$/, ''); fire(scriptIn); };
  $('edNarr').onclick = () => { const s = scriptIn.value.replace(/\s+$/, ''); scriptIn.value = (s ? s + '\n' : '') + '| '; fire(scriptIn); scriptIn.focus(); scriptIn.setSelectionRange(scriptIn.value.length, scriptIn.value.length); };

  // keep in sync with typing in the fields and with preset changes
  fenIn.addEventListener('input', () => { readSetup(); render(); });
  scriptIn.addEventListener('input', () => { if (mode === 'record') render(); });
  window.refreshEditor = () => { sel = null; readSetup(); render(); };
  readSetup(); render();
})();
