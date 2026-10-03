'use strict';
// "Suy nghĩ của máy": cho Pikafish nghĩ một lúc lâu và hiện mọi điều nó báo ra trong lúc nghĩ.
// Pikafish không cho xem từng thế cờ nó duyệt (hàng triệu thế); thứ nó báo ra là một dòng "info" mỗi khi
// nghĩ sâu thêm một tầng, cho từng phương án: độ sâu, điểm, tỉ lệ thắng/hòa/thua, biến chính, số thế cờ đã xét.
// Khung này hiện 5 phần từ các dòng đó:
//   1. các phương án đang dẫn đầu (cập nhật liên tục, kèm mũi tên trên bàn cờ);
//   2. nhật ký theo độ sâu, đánh dấu những lần máy đổi nước tốt nhất;
//   3. biểu đồ điểm theo độ sâu của 3 phương án đầu;
//   4. bấm một nước trong biến để xem thế cờ đó trên bàn, đi tới / lui trong biến;
//   5. nguyên văn các dòng UCI, sao chép được để dán cho Claude.
(() => {
  const box = $('thinkBox'), goBtn = $('thGo'), stopBtn = $('thStop'), multiSel = $('thMulti'), timeSel = $('thTime');
  const statusEl = $('thStatus'), statsEl = $('thStats'), linesEl = $('thLines'), graphEl = $('thGraph'), logEl = $('thLog'), rawEl = $('thRaw');
  const navEl = $('thNav'), navText = $('thNavText');
  const say = (msg, isErr) => { statusEl.textContent = msg; statusEl.classList.toggle('err', !!isErr); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const K = () => window.AIKit;
  const MATE = 30000, WIN = MATE - 500, GRAY = '#8a857a';
  const sideName = s => (s === 'r' ? 'Đỏ' : 'Đen');
  const num = n => n.toLocaleString('vi-VN');
  const big = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} triệu` : n >= 1e3 ? `${Math.round(n / 1e3)} nghìn` : String(n));
  const secs = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} giây`;
  const posKey = (B, s) => B.map(p => (p ? p.side + p.type : '.')).join('') + s;
  const sq = u => (9 - +u[1]) * 9 + (u.charCodeAt(0) - 97);

  let run = null, paint = 0, nav = null;

  // Đọc một dòng "info" của Pikafish. Điểm và tỉ lệ thắng/hòa/thua tính theo bên đang đi.
  function parse(line) {
    const t = line.split(/\s+/); if (t[0] !== 'info' || !t.includes('pv') || !t.includes('score')) return null;
    const get = k => { const i = t.indexOf(k); return i < 0 ? null : t[i + 1]; };
    const si = t.indexOf('score'), kind = t[si + 1], v = +t[si + 2];
    const score = kind === 'mate' ? (v > 0 ? MATE - (2 * v - 1) : -(MATE - 2 * -v)) : v;
    const wi = t.indexOf('wdl');
    return {
      depth: +get('depth'), seldepth: +(get('seldepth') || 0), multipv: +(get('multipv') || 1), score,
      bound: t.includes('lowerbound') || t.includes('upperbound'),
      wdl: wi < 0 ? null : [+t[wi + 1], +t[wi + 2], +t[wi + 3]],
      nodes: +(get('nodes') || 0), nps: +(get('nps') || 0), time: +(get('time') || 0), hashfull: +(get('hashfull') || 0),
      pv: t.slice(t.indexOf('pv') + 1).map(u => [sq(u.slice(0, 2)), sq(u.slice(2, 4))])
    };
  }
  // Biến chính: ký hiệu Việt + thế cờ sau từng nước (dừng nếu gặp nước không hợp lệ).
  function walk(B, side, pv) {
    const steps = []; let b = B, s = side;
    for (const m of pv) {
      if (!b[m[0]] || b[m[0]].side !== s || !legal(b, s).some(x => x[0] === m[0] && x[1] === m[1])) break;
      const n = K().nota(b, s, m); b = apply(b, m); steps.push({ m, nota: n, board: b, side: opp(s) }); s = opp(s);
    }
    return steps;
  }
  const redOf = sc => (run.side === 'r' ? sc : -sc);
  const wdlText = w => {
    if (!w) return '';
    const [win, draw, loss] = w, red = run.side === 'r' ? win : loss, black = run.side === 'r' ? loss : win, p = x => `${Math.round(x / 10)}%`;
    return `Đỏ thắng ${p(red)} · hòa ${p(draw)} · Đen thắng ${p(black)}`;
  };
  const wdlBar = w => {
    if (!w) return '';
    const [win, draw, loss] = w, red = run.side === 'r' ? win : loss, black = run.side === 'r' ? loss : win;
    return `<span class="th-wdl" aria-hidden="true"><i class="r" style="width:${red / 10}%"></i><i class="d" style="width:${draw / 10}%"></i><i class="b" style="width:${black / 10}%"></i></span>`;
  };

  function onLine(line) {
    if (!run) return;
    run.raw.push(line);
    const info = parse(line);
    if (info && !info.bound && info.pv.length) {
      info.steps = walk(run.B, run.side, info.pv);
      if (info.steps.length) {
        const r = info.multipv - 1;
        run.lines[r] = info;
        run.top = info;
        const d = info.depth;
        if (!run.byDepth[d]) run.byDepth[d] = [];
        run.byDepth[d][r] = info;
      }
    }
    if (!paint) paint = setTimeout(() => { paint = 0; draw(); }, 200);
  }

  // ---------- vẽ ----------
  function draw() {
    if (!run) return;
    const top = run.lines[0], k = K();
    if (top) {
      const t = Math.max(...run.lines.filter(Boolean).map(l => l.time));
      statsEl.textContent = `Độ sâu ${top.depth}/${top.seldepth} · ${big(Math.max(...run.lines.filter(Boolean).map(l => l.nodes)))} thế cờ · ${big(top.nps)}/giây · ${secs(t)}` +
        (top.hashfull ? ` · bộ nhớ đệm ${Math.round(top.hashfull / 10)}%` : '') + (run.active ? ` · còn ${Math.max(0, Math.ceil((run.time - (performance.now() - run.t0)) / 1000))} giây` : '');
    }
    // 1. Các phương án
    linesEl.innerHTML = run.lines.map((l, i) => !l ? '' : `<li><span class="ai-dot" style="background:${k.ARROW[i] || GRAY}"></span>` +
      `<span class="ai-main"><b>${esc(l.steps[0].nota)}</b> <span class="ai-ev">${esc(k.scoreText(l.score, run.side))}</span> <span class="th-depth">độ sâu ${l.depth}</span>` +
      (l.wdl ? `<span class="th-wdl-row">${wdlBar(l.wdl)}<span class="th-wdl-t">${esc(wdlText(l.wdl))}</span></span>` : '') +
      `<span class="ai-pv th-pv">${l.steps.map((st, j) => `<button type="button" data-r="${i}" data-j="${j}" class="${nav && nav.r === i && nav.j === j ? 'on' : ''}">${esc(st.nota)}</button>`).join(' ')}</span></span></li>`).join('');
    // Mũi tên trên bàn: chỉ khi bàn vẫn đúng thế cờ đã phân tích và không đang xem một thế cờ trong biến.
    let cur = null; try { cur = Editor.position(); } catch (e) { cur = null; }
    const same = !!cur && !cur.err && posKey(cur.b, cur.s) === run.key;
    linesEl.classList.toggle('stale', !same);
    linesEl.title = same ? '' : 'Kết quả này là của thế cờ trước, bàn cờ đã đổi.';
    if (same && !Editor.viewing()) Editor.showHints(run.lines.slice(0, 3).map((l, i) => l && { m: l.steps[0].m, color: k.ARROW[i], w: i ? 10 : 16 }).filter(Boolean).reverse());
    drawLog(); drawGraph();
    rawEl.textContent = run.raw.slice(-400).join('\n');
  }

  // 2. Nhật ký theo độ sâu (mới nhất ở trên), đánh dấu khi nước tốt nhất đổi so với độ sâu trước.
  function drawLog() {
    const ds = Object.keys(run.byDepth).map(Number).sort((a, b) => a - b), k = K();
    let prev = null; const rows = [];
    for (const d of ds) {
      const l = run.byDepth[d][0]; if (!l) continue;
      const mv = l.steps[0].nota, changed = prev && prev !== mv;
      rows.push(`<tr class="${changed ? 'chg' : ''}"><td>${d}</td><td><b>${esc(mv)}</b>${changed ? ` <span class="tag">đổi ý, trước là ${esc(prev)}</span>` : ''}</td>` +
        `<td class="n">${esc(k.scoreText(l.score, run.side))}</td><td class="n">${l.wdl ? `${Math.round((run.side === 'r' ? l.wdl[0] : l.wdl[2]) / 10)}/${Math.round(l.wdl[1] / 10)}/${Math.round((run.side === 'r' ? l.wdl[2] : l.wdl[0]) / 10)}` : ''}</td>` +
        `<td class="n">${secs(l.time)}</td><td class="n">${big(l.nodes)}</td></tr>`);
      prev = mv;
    }
    const changes = rows.filter(r => r.includes('class="chg"')).length;
    logEl.innerHTML = `<caption>${ds.length ? `${ds.length} độ sâu, máy đổi ý ${changes} lần` : ''}</caption>` +
      '<thead><tr><th>Độ sâu</th><th>Nước tốt nhất</th><th>Điểm</th><th title="Đỏ thắng / hòa / Đen thắng, %">Đỏ/hòa/Đen %</th><th>Thời gian</th><th>Đã xét</th></tr></thead>' +
      `<tbody>${rows.reverse().join('')}</tbody>`;
  }

  // 3. Biểu đồ điểm (theo phía Đỏ) qua từng độ sâu của 3 phương án đầu. Một trục; chiếu bí kẹp ở mép.
  function drawGraph() {
    const ds = Object.keys(run.byDepth).map(Number).sort((a, b) => a - b);
    if (ds.length < 2) { graphEl.hidden = true; return; }
    graphEl.hidden = false;
    const k = K(), n = Math.min(3, run.multi), W = Math.max(300, Math.min(640, graphEl.clientWidth || 600)), H = 170, L = 8, R = 64, T = 10, B = 22; // vẽ đúng bề rộng thật để chữ không bị thu nhỏ
    // Điểm theo phía Đỏ, tính bằng Tốt; chiếu bí kẹp ở ±(biên + 0,5). Trục dọc co theo khoảng điểm thực tế.
    const raw = l => { const r = redOf(l.score); return Math.abs(r) > WIN ? null : r / 100; };
    let lo = Infinity, hi = -Infinity;
    for (const d of ds) for (const l of run.byDepth[d].slice(0, n)) if (l) { const v = raw(l); if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (lo === Infinity) { lo = -1; hi = 1; }
    if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const val = l => { const v = raw(l); return v != null ? v : (redOf(l.score) > 0 ? hi : lo); };
    const x = d => L + (W - L - R) * (ds.length === 1 ? 0.5 : (d - ds[0]) / (ds[ds.length - 1] - ds[0]));
    const y = v => T + (H - T - B) * (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo);
    let svg = lo < 0 && hi > 0 ? `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="g-zero"/>` : '';
    const step = Math.max(1, Math.ceil(ds.length / 8));
    ds.forEach((d, i) => { if (i % step === 0 || i === ds.length - 1) svg += `<text x="${x(d)}" y="${H - 6}" class="g-ax" text-anchor="middle">${d}</text>`; });
    const ends = [];
    for (let r = n - 1; r >= 0; r--) {
      const pts = ds.filter(d => run.byDepth[d][r]).map(d => [x(d), y(val(run.byDepth[d][r]))]);
      if (pts.length < 1) continue;
      const c = k.ARROW[r];
      svg += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const [lx, ly] = pts[pts.length - 1];
      svg += `<circle cx="${lx}" cy="${ly}" r="4" fill="${c}" stroke="var(--field)" stroke-width="2"/>`;
      if (run.lines[r]) ends.push({ x: lx, y: ly, text: run.lines[r].steps[0].nota });
    }
    // Nhãn cuối đường: giãn cách tối thiểu 14 đơn vị để không đè lên nhau.
    ends.sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => { e.ly = i ? Math.max(e.y, ends[i - 1].ly + 14) : e.y; });
    const over = ends.length ? ends[ends.length - 1].ly - (H - B) : 0; // tràn xuống dưới: đẩy cả nhóm lên
    if (over > 0) ends.forEach(e => { e.ly = Math.max(T + 4, e.ly - over); });
    for (const e of ends) svg += `<text x="${e.x + 8}" y="${e.ly + 4}" class="g-lab">${esc(e.text)}</text>`;
    const fmtP = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',');
    svg += `<line class="g-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/><rect class="g-hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>`;
    const legend = Array.from({ length: n }, (_, r) => run.lines[r] ? `<span><i style="background:${k.ARROW[r]}"></i>Phương án ${r + 1}: ${esc(run.lines[r].steps[0].nota)}</span>` : '').join('');
    graphEl.innerHTML = `<figcaption>Điểm theo độ sâu <span class="hint">(điểm theo phía Đỏ: càng cao Đỏ càng ưu; trục ngang là độ sâu)</span></figcaption>` +
      `<div class="th-legend">${legend}</div><div class="g-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ điểm theo độ sâu; số liệu chi tiết ở bảng nhật ký bên dưới">${svg}</svg>` +
      `<span class="g-lbl top">${fmtP(hi)}</span><span class="g-lbl bot">${fmtP(lo)}</span><div class="tip"></div></div>`;
    // Rê chuột: đường dọc + chú thích điểm của từng phương án ở độ sâu gần nhất.
    const svgEl = graphEl.querySelector('svg'), hit = graphEl.querySelector('.g-hit'), cross = graphEl.querySelector('.g-cross'), tip = graphEl.querySelector('.tip');
    hit.addEventListener('pointermove', e => {
      const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const px = pt.matrixTransform(svgEl.getScreenCTM().inverse()).x;
      const d = ds.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a));
      cross.setAttribute('x1', x(d)); cross.setAttribute('x2', x(d)); cross.style.display = '';
      const parts = run.byDepth[d].slice(0, n).map((l, r) => l ? `${r + 1}. ${l.steps[0].nota} ${k.scoreText(l.score, run.side)}` : '').filter(Boolean);
      tip.textContent = `Độ sâu ${d} · ${parts.join(' · ')}`; tip.style.display = 'block';
      const rect = svgEl.getBoundingClientRect(), host = graphEl.querySelector('.g-plot').getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(x(d) / W * rect.width, 120), host.width - 120)}px`; tip.style.top = '0px';
    });
    hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.style.display = 'none'; });
  }

  // 4. Xem thế cờ trong biến: bấm một nước để hiện thế cờ sau nước đó; ◀ ▶ đi lui / tới.
  function showNav() {
    const l = nav.line, st = l.steps[nav.j], k = K(), next = l.steps[nav.j + 1];
    Editor.preview(st.board, st.side, next ? [{ m: next.m, color: k.ARROW[nav.r] || GRAY, w: 14 }] : [],
      `Biến ${nav.r + 1}, sau ${nav.j + 1} nước: ${l.steps.slice(0, nav.j + 1).map(s => s.nota).join(' ')}. Bấm vào bàn cờ để quay lại.`, st.m);
    navEl.hidden = false;
    navText.textContent = `Biến ${nav.r + 1}, nước ${nav.j + 1}/${l.steps.length}${next ? `, tiếp theo ${next.nota}` : ''}`;
    $('thPrev').disabled = nav.j <= 0; $('thNext').disabled = nav.j >= l.steps.length - 1;
    linesEl.querySelectorAll('.th-pv button').forEach(b => b.classList.toggle('on', +b.dataset.r === nav.r && +b.dataset.j === nav.j));
  }
  linesEl.addEventListener('click', e => {
    const b = e.target.closest('.th-pv button'); if (!b || !run) return;
    const r = +b.dataset.r, l = run.lines[r]; if (!l) return;
    nav = { r, j: +b.dataset.j, line: l }; // giữ bản sao của biến lúc bấm, kể cả khi máy đã nghĩ tiếp
    showNav();
  });
  $('thPrev').onclick = () => { if (nav && nav.j > 0) { nav.j--; showNav(); } };
  $('thNext').onclick = () => { if (nav && nav.j < nav.line.steps.length - 1) { nav.j++; showNav(); } };
  function home() { nav = null; navEl.hidden = true; linesEl.querySelectorAll('.th-pv button.on').forEach(b => b.classList.remove('on')); Editor.showHints([]); if (run) draw(); }
  $('thHome').onclick = home;

  // 5. Sao chép các dòng UCI (kèm thế cờ) để dán cho Claude hay phần mềm khác.
  $('thCopy').onclick = async () => {
    if (!run || !run.raw.length) { $('thCopyInfo').textContent = 'Chưa có gì để sao chép.'; return; }
    const text = [`# Thế cờ (FEN): ${toFEN(run.B, run.side)}`, `# ${sideName(run.side)} đi. Điểm (cp) và wdl tính theo bên đang đi; nước đi dạng tọa độ ICCS.`, ...run.raw].join('\n');
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; } ta.remove();
    }
    $('thCopyInfo').textContent = ok ? `Đã sao chép ${num(run.raw.length)} dòng.` : 'Trình duyệt không cho sao chép tự động.';
  };

  // ---------- chạy / dừng ----------
  async function start() {
    const k = K(); if (!k || run && run.active) return;
    if (k.engine() !== 'pikafish') { say('Chức năng này dùng Pikafish: hãy chọn “Pikafish (mạnh)” ở ô chọn máy trong Trợ lý AI phía trên.', true); return; }
    if (k.isBusy()) { say('Trợ lý AI đang gợi ý hoặc kiểm duyệt, hãy đợi xong hoặc bấm Dừng ở đó.', true); return; }
    let pos;
    try { pos = Editor.position(); } catch (e) { say(`Thế cờ chưa hợp lệ: ${e}`, true); return; }
    if (pos.err) { say(`Kịch bản có nước không hợp lệ: ${pos.err}. Hãy sửa trước.`, true); return; }
    if (!legal(pos.b, pos.s).length) { say(`${sideName(pos.s)} đã hết nước đi: ván cờ kết thúc.`, true); return; }
    say('Đang khởi động Pikafish…');
    if (!(await k.prepareEngine())) { say('Pikafish chưa sẵn sàng, xem hướng dẫn trong Trợ lý AI phía trên.', true); return; }
    home(); Editor.setMode('record');
    const multi = +multiSel.value, time = +timeSel.value;
    run = { B: pos.b, side: pos.s, key: posKey(pos.b, pos.s), multi, time, lines: [], byDepth: {}, raw: [], t0: performance.now(), active: true, stopped: false };
    window.thinkActive = true; goBtn.hidden = true; stopBtn.hidden = false; multiSel.disabled = timeSel.disabled = true;
    say(`Pikafish đang suy nghĩ cho ${sideName(pos.s)} (${multi} phương án, tối đa ${timeSel.selectedOptions[0].textContent})…`);
    const ticker = setInterval(() => { if (run && run.active) draw(); }, 1000);
    let err = null;
    try { await PikafishEngine.think({ board: k.toCodes(pos.b), side: k.sideNum(pos.s), history: k.gameHist(pos), multi, time }, onLine); }
    catch (e) { if (e.message !== 'stopped') err = e; }
    clearInterval(ticker); clearTimeout(paint); paint = 0;
    const r = run; r.active = false; window.thinkActive = false;
    goBtn.hidden = false; stopBtn.hidden = true; multiSel.disabled = timeSel.disabled = false;
    draw();
    if (err) { say(`Pikafish bị lỗi: ${err.message || err}`, true); return; }
    const top = r.lines[0];
    if (top) { k.remember(r.B, r.side, top.score, top.depth + 100); k.evalNow(); }
    const ds = Object.keys(r.byDepth).length;
    say((r.stopped ? r.stopped : 'Xong.') + (top ? ` Nước tốt nhất: ${top.steps[0].nota} (${k.scoreText(top.score, r.side)}), nghĩ tới độ sâu ${top.depth}, ${ds} lần báo cáo theo độ sâu.` : ''));
  }
  function stop(reason) {
    if (!run || !run.active) return;
    run.stopped = reason || 'Đã dừng.';
    PikafishEngine.stopThink();
  }
  window.stopThinking = stop;
  goBtn.onclick = start;
  stopBtn.onclick = () => stop('Đã dừng.');
  box.addEventListener('toggle', () => { if (!box.open) stop('Đã dừng vì đóng khung.'); });
  // Đi nước khác / đổi thế cờ khi đang nghĩ thì dừng (xem thế cờ trong biến thì không tính).
  window.onThinkPosition = pos => {
    if (!run || !run.active || Editor.viewing() || !pos || !pos.valid) return;
    if (posKey(pos.B, pos.s) !== run.key) stop('Đã dừng vì thế cờ trên bàn đã thay đổi.');
  };
})();
