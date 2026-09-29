'use strict';
// Trợ lý AI:
//  - "Gợi ý nước đi": máy tính 3 nước tốt nhất ở thế cờ cuối kịch bản, vẽ mũi tên trên bàn, bấm để đi luôn.
//  - "Kiểm duyệt kịch bản": chấm từng nước trong kịch bản (tốt nhất, chưa chính xác, sai lầm…) và chỉ ra nước nên đi.
//  - Nhập / xuất PGN: dán hoặc mở file PGN để thành kịch bản; xuất kịch bản ra PGN.
// Máy chạy trong Web Worker để trang không bị đứng; nếu trình duyệt chặn Worker thì chạy ngay trên trang.
const AIEngine = (() => {
  let worker = null, canWorker = typeof Worker !== 'undefined', job = null, seq = 0, local = null;
  const getLocal = () => local || (local = xqAICore({}));
  function runLocal(j) {
    job = j;
    setTimeout(() => {
      if (job !== j) return;
      try { const r = getLocal().analyze(j.opts, j.progress); job = null; j.resolve(r); } catch (e) { job = null; j.reject(e); }
    }, 30);
  }
  function spawn() {
    if (worker || !canWorker) return worker;
    try {
      const url = URL.createObjectURL(new Blob([`(${xqAICore.toString()})(self);`], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = e => {
        const d = e.data; if (!job || d.id !== job.id) return;
        if (d.type === 'progress') { if (job.progress) job.progress(d.info); return; }
        const j = job; job = null;
        if (d.type === 'done') j.resolve(d.result); else j.reject(new Error(d.error));
      };
      worker.onerror = e => {
        if (e && e.preventDefault) e.preventDefault();
        canWorker = false; try { worker.terminate(); } catch (_) { /* bỏ qua */ } worker = null;
        if (job) { const j = job; job = null; runLocal(j); }
      };
    } catch (e) { canWorker = false; worker = null; }
    return worker;
  }
  let kind = 'builtin'; // 'builtin' = máy có sẵn (js/core/ai-core.js), 'pikafish' = js/app/pikafish.js
  function analyze(opts, progress) {
    if (kind === 'pikafish') return PikafishEngine.analyze(opts, progress);
    return new Promise((resolve, reject) => {
      if (job) stop();
      const j = { id: ++seq, opts, progress, resolve, reject };
      if (spawn()) { job = j; worker.postMessage({ id: j.id, opts }); } else runLocal(j);
    });
  }
  function stop() {
    if (kind === 'pikafish') PikafishEngine.stop();
    if (!job) return;
    const j = job; job = null;
    if (worker) { worker.terminate(); worker = null; }
    j.reject(new Error('stopped'));
  }
  return { analyze, stop, setKind: k => { kind = k; } };
})();

(() => {
  const MATE = 30000, WIN = MATE - 500;
  const CODE = { k: 1, a: 2, e: 3, h: 4, r: 5, c: 6, p: 7 };
  const toCodes = B => B.map(p => p ? CODE[p.type] + (p.side === 'b' ? 8 : 0) : 0);
  const sideNum = s => s === 'r' ? 0 : 1;
  const sideName = s => s === 'r' ? 'Đỏ' : 'Đen';
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const levelSel = $('aiLevel'), hintBtn = $('aiHint'), reviewBtn = $('aiReview'), stopBtn = $('aiStop'), statusEl = $('aiStatus'), out = $('aiOut');
  const ARROW = ['#2fbf6a', '#3b82f6', '#a855f7'];
  let busy = false, lastReview = null;

  // Ký hiệu một nước đi, có kiểm tra ngược để chắc chắn đọc lại được.
  function nota(B, side, m) {
    let n = toNotation(B, side, m);
    try { const back = resolve(B, side, n); if (!same(back, m)) throw 0; } catch (e) { n = pgnICCS(m); }
    return n;
  }
  function pvText(B, side, pv, max = 8) {
    const o = []; let b = B, s = side;
    try { for (const m of pv.slice(0, max)) { o.push(nota(b, s, m)); b = apply(b, m); s = opp(s); } } catch (e) { /* diễn biến lạ: dừng ở đây */ }
    return o.join(' ');
  }
  // Điểm nhìn từ phía Đỏ: dương là Đỏ ưu, 1,0 ≈ một Tốt.
  function scoreText(sc, side) {
    if (Math.abs(sc) > WIN) {
      const plies = MATE - Math.abs(sc), winner = sc > 0 ? side : opp(side);
      return `${sideName(winner)} chiếu bí sau ${Math.ceil(plies / 2)} nước`;
    }
    const red = side === 'r' ? sc : -sc;
    return (red > 0 ? '+' : red < 0 ? '−' : '') + (Math.abs(red) / 100).toFixed(1).replace('.', ',');
  }
  // Điểm để so sánh: chiếu bí càng nhanh càng cao, còn lại chặn trong ±25 Tốt.
  const norm = sc => sc > WIN ? 3000 - (MATE - sc) : sc < -WIN ? -3000 + (MATE + sc) : clamp(sc, -2500, 2500);
  const timeBudget = () => +levelSel.value;

  function setBusy(b) {
    busy = b; hintBtn.disabled = b; reviewBtn.disabled = b; stopBtn.hidden = !b;
  }
  function say(msg, isErr) { statusEl.textContent = msg; statusEl.classList.toggle('err', !!isErr); }

  // ---------- gợi ý nước đi ----------
  async function suggest() {
    if (busy) return;
    let pos;
    try { pos = Editor.position(); } catch (e) { say(`Thế cờ chưa hợp lệ: ${e}`, true); return; }
    Editor.setMode('record');
    if (pos.err) {
      say(`Máy chưa gợi ý được vì kịch bản có nước đi không hợp lệ. ${pos.err}.`, true);
      out.innerHTML = `<div class="actions"><button class="btn sm" type="button" id="aiCut">Xóa từ dòng lỗi trở xuống rồi gợi ý</button></div>`;
      $('aiCut').onclick = () => { Editor.cutAtError(); suggest(); };
      return;
    }
    const { b: B, s: side } = pos;
    if (!legal(B, side).length) { say(`${sideName(side)} đã hết nước đi: ván cờ kết thúc.`); out.innerHTML = ''; return; }
    if (!(await prepareEngine())) return;
    setBusy(true); out.innerHTML = '';
    say(`Máy đang tính cho ${sideName(side)}…`);
    let res;
    try {
      res = await AIEngine.analyze({ board: toCodes(B), side: sideNum(side), time: timeBudget(), multi: 3 }, info => {
        say(`Máy đang tính cho ${sideName(side)}: độ sâu ${info.depth}, tạm chọn ${pvText(B, side, info.pv, 1)} (${scoreText(info.score, side)})`);
      });
    } catch (e) { setBusy(false); say(e.message === 'stopped' ? 'Đã dừng.' : `Lỗi khi tính: ${e.message || e}`, e.message !== 'stopped'); return; }
    setBusy(false);
    const lines = res.lines;
    say(`Lượt ${sideName(side)}. ${res.engine === 'pikafish' ? 'Pikafish' : 'Máy có sẵn'} đã xét ${res.nodes.toLocaleString('vi-VN')} thế cờ, độ sâu ${res.depth}.`);
    out.innerHTML = `<ol class="ai-list">${lines.map((l, i) => `<li><span class="ai-dot" style="background:${ARROW[i]}"></span>` +
      `<span class="ai-main"><b>${esc(nota(B, side, l.move))}</b> <span class="ai-ev">${esc(scoreText(l.score, side))}</span>` +
      `<span class="ai-pv">${esc(pvText(B, side, l.pv))}</span></span>` +
      `<button class="btn sm" type="button" data-i="${i}">Đi nước này</button></li>`).join('')}</ol>` +
      `<p class="hint">Điểm tính theo Đỏ: dương là Đỏ ưu, 1,0 ≈ một Tốt. Dòng xám là diễn biến máy dự đoán.</p>`;
    out.querySelectorAll('button[data-i]').forEach(btn => btn.onclick = () => {
      const l = lines[+btn.dataset.i]; out.innerHTML = '';
      if (Editor.play(l.move)) say(`Đã thêm ${nota(B, side, l.move)} vào kịch bản.`);
    });
    Editor.showHints(lines.map((l, i) => ({ m: l.move, color: ARROW[i], w: i ? 10 : 16 })).reverse());
  }

  // ---------- kiểm duyệt kịch bản ----------
  function readPlies() {
    const { B: B0, side: s0 } = parseFEN(fenIn.value);
    const plies = []; let B = B0, side = s0, err = '';
    const lines = scriptIn.value.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim(); if (!l || l.startsWith('|') || l.startsWith('//')) continue;
      const mv = l.split('|')[0].trim();
      if (!legal(B, side).length) { err = `Dòng ${i + 1} (“${mv}”): ván cờ đã kết thúc trước nước này.`; break; }
      let m;
      try { m = resolve(B, side, mv); } catch (e) { err = `Dòng ${i + 1} (“${mv}”): ${e}.`; break; }
      plies.push({ line: i, B, side, m, text: mv, nota: nota(B, side, m), no: 0 });
      B = apply(B, m); side = opp(side);
    }
    let no = 1; plies.forEach((p, i) => { if (i && p.side === s0) no++; p.no = no; });
    return { plies, err, s0 };
  }
  function classify(p) {
    const loss = Math.max(0, norm(p.best) - norm(p.played));
    if (p.mates) return { key: 'best', label: 'Chiếu bí!', sym: '' };
    if (same(p.m, p.bestMove)) return { key: 'best', label: 'Nước tốt nhất', sym: '' };
    if (p.best > WIN && p.played <= WIN) return { key: loss > 300 ? 'blunder' : 'mistake', label: 'Bỏ lỡ chiếu bí', sym: '?' };
    if (loss <= 40) return { key: 'good', label: 'Nước tốt', sym: '' };
    if (loss <= 120) return { key: 'inacc', label: 'Chưa chính xác', sym: '?!' };
    if (loss <= 300) return { key: 'mistake', label: 'Sai lầm', sym: '?' };
    return { key: 'blunder', label: 'Sai lầm nghiêm trọng', sym: '??' };
  }
  async function review() {
    if (busy) return;
    let data;
    try { data = readPlies(); } catch (e) { say(`Thế cờ chưa hợp lệ: ${e}`, true); return; }
    const { plies, err, s0 } = data;
    if (!plies.length) { say(err || 'Kịch bản chưa có nước đi nào để kiểm duyệt.', !!err); out.innerHTML = ''; return; }
    if (!(await prepareEngine())) return;
    setBusy(true); out.innerHTML = '';
    const snapshot = fenIn.value + '\n' + scriptIn.value, T = Math.round(timeBudget() * 0.6);
    let stopped = false;
    for (let i = 0; i < plies.length; i++) {
      const p = plies[i], board = toCodes(p.B), side = sideNum(p.side);
      say(`Đang chấm nước ${i + 1}/${plies.length}: ${p.nota}…`);
      try {
        const r = await AIEngine.analyze({ board, side, time: T });
        const best = r.lines[0];
        p.bestMove = best.move; p.best = best.score; p.bestPv = best.pv; p.depth = r.depth;
        if (same(best.move, p.m)) p.played = best.score;
        else {
          const rp = await AIEngine.analyze({ board, side, time: T * 2, maxDepth: Math.max(1, r.depth), only: [p.m] });
          p.played = rp.lines.length ? rp.lines[0].score : best.score;
        }
        const after = apply(p.B, p.m);
        p.mates = !legal(after, opp(p.side)).length;
        p.cls = classify(p);
      } catch (e) {
        if (e.message === 'stopped') { stopped = true; break; }
        setBusy(false); say(`Lỗi khi tính: ${e.message || e}`, true); return;
      }
    }
    setBusy(false);
    const done = plies.filter(p => p.cls);
    lastReview = { snapshot, plies: done };
    renderReview(done, s0);
    const bad = done.filter(p => ['inacc', 'mistake', 'blunder'].includes(p.cls.key)).length;
    say((stopped ? `Đã dừng sau ${done.length}/${plies.length} nước. ` : `Đã chấm xong ${done.length} nước. `) +
      (bad ? `Có ${bad} nước đáng xem lại; bấm vào từng dòng để xem trên bàn cờ.` : 'Không có nước nào đáng ngại.') +
      (err ? ` Lưu ý: ${err}` : ''), !!err);
  }
  function renderReview(plies, s0) {
    if (!plies.length) { out.innerHTML = ''; return; }
    const sum = side => {
      const own = plies.filter(p => p.side === side); if (!own.length) return '';
      const c = k => own.filter(p => p.cls.key === k).length;
      const parts = [`${own.length} nước`, `${c('best')} tốt nhất`];
      if (c('inacc')) parts.push(`${c('inacc')} chưa chính xác`);
      if (c('mistake')) parts.push(`${c('mistake')} sai lầm`);
      if (c('blunder')) parts.push(`${c('blunder')} sai lầm nghiêm trọng`);
      return `<li><b class="side-${side}">${sideName(side)}</b>: ${parts.join(' · ')}</li>`;
    };
    const flagged = plies.filter(p => ['inacc', 'mistake', 'blunder'].includes(p.cls.key));
    out.innerHTML = `<ul class="ai-sum">${sum(s0)}${sum(opp(s0))}</ul>` +
      `<ol class="ai-review">${plies.map((p, i) => `<li class="k-${p.cls.key}"><button type="button" data-i="${i}">` +
        `<span class="n">${p.no}${p.side === s0 ? '.' : '…'}</span><b>${esc(p.nota)}${p.cls.sym}</b>` +
        `<span class="tag">${esc(p.cls.label)}</span><span class="ai-ev">${esc(scoreText(p.played, p.side))}</span>` +
        (same(p.m, p.bestMove) ? '' : `<span class="alt">Máy chọn ${esc(nota(p.B, p.side, p.bestMove))}</span>`) +
        `</button></li>`).join('')}</ol>` +
      (flagged.length ? `<div class="actions"><button class="btn sm" type="button" id="aiInsert">Chèn nhận xét của máy vào kịch bản</button></div>` : '');
    out.querySelectorAll('.ai-review button').forEach(btn => btn.onclick = () => {
      const p = plies[+btn.dataset.i];
      const hints = [{ m: p.m, color: same(p.m, p.bestMove) ? ARROW[0] : '#f59e0b', w: 16 }];
      if (!same(p.m, p.bestMove)) hints.unshift({ m: p.bestMove, color: ARROW[0], w: 12 });
      const ply = +btn.dataset.i; // số nước đã đi trước nước này
      const note = `Trước nước ${p.no}${p.side === s0 ? '' : '…'} (${sideName(p.side)} đi). Kịch bản: ${p.nota} (mũi tên cam nếu khác máy)` +
        (same(p.m, p.bestMove) ? ', trùng nước máy chọn.' : `; máy chọn ${nota(p.B, p.side, p.bestMove)} (mũi tên xanh): ${pvText(p.B, p.side, p.bestPv, 6)}.`) + ' Bấm vào bàn cờ để quay lại.';
      Editor.view(ply, hints, note);
    });
    const ins = $('aiInsert');
    if (ins) ins.onclick = () => {
      if (!lastReview || lastReview.snapshot !== fenIn.value + '\n' + scriptIn.value) { say('Kịch bản đã thay đổi sau khi chấm. Hãy bấm “Kiểm duyệt kịch bản” lại.', true); return; }
      const lines = scriptIn.value.split('\n');
      for (const p of flagged.slice().reverse()) {
        const alt = nota(p.B, p.side, p.bestMove);
        lines.splice(p.line + 1, 0, `| Máy nhận xét: ${p.nota} là nước ${p.cls.label.toLowerCase()}, tốt hơn là ${alt}.`);
      }
      scriptIn.value = lines.join('\n'); scriptIn.dispatchEvent(new Event('input', { bubbles: true }));
      out.innerHTML = ''; lastReview = null;
      say(`Đã chèn ${flagged.length} dòng nhận xét vào kịch bản. Bấm “Dựng video” để xem.`);
    };
  }

  // ---------- chọn máy: có sẵn hoặc Pikafish ----------
  const engineSel = $('aiEngine'), pfBox = $('pfBox'), pfMsg = $('pfMsg'), pfNeedNet = $('pfNeedNet');
  $('pfDownload').href = PikafishEngine.NNUE_URL;
  try { if (localStorage.getItem('aiEngine') === 'pikafish') engineSel.value = 'pikafish'; } catch (e) { /* bỏ qua */ }
  function pfSay(msg, isErr) { pfMsg.textContent = msg; pfMsg.classList.toggle('err', !!isErr); }
  // Chuẩn bị máy đang chọn; trả về false nếu Pikafish chưa dùng được (đã hiện hướng dẫn).
  async function prepareEngine() {
    const pf = engineSel.value === 'pikafish';
    pfBox.hidden = !pf; AIEngine.setKind('builtin');
    if (!pf) return true;
    pfNeedNet.hidden = true; pfSay('Đang khởi động Pikafish…');
    try {
      await PikafishEngine.start();
      AIEngine.setKind('pikafish');
      const n = (PikafishEngine.info() || {}).threads || 1;
      pfSay(n > 1 ? `Pikafish sẵn sàng, chạy ${n} luồng song song. Máy chạy ngay trên trình duyệt, không cần mạng.`
        : 'Pikafish sẵn sàng (đơn luồng). Máy chạy ngay trên trình duyệt, không cần mạng. Muốn nhanh hơn nhiều lần: mở trang bằng tools/serve.py để chạy đa luồng.');
      return true;
    } catch (e) {
      if (e.code === 'NO_NET') {
        pfNeedNet.hidden = false;
        pfSay('Pikafish cần file mạng nơ-ron pikafish.nnue (khoảng 50 MB). Bước 1: tải file về. Bước 2: chọn file vừa tải. Trình duyệt sẽ nhớ file này cho những lần sau.');
      } else pfSay(`Chưa khởi động được Pikafish: ${e.message || e}`, true);
      say('Pikafish chưa sẵn sàng, xem hướng dẫn ở trên. Hoặc chọn “Máy có sẵn”.', true);
      return false;
    }
  }
  engineSel.onchange = () => {
    try { localStorage.setItem('aiEngine', engineSel.value); } catch (e) { /* bỏ qua */ }
    if (busy) AIEngine.stop();
    say(''); prepareEngine();
  };
  $('pfFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    pfNeedNet.hidden = true; pfSay(`Đang nạp ${f.name}…`);
    try { await PikafishEngine.useFile(f); } catch (err) { pfNeedNet.hidden = false; pfSay(err.message || String(err), true); return; }
    if (await prepareEngine()) say('Đã sẵn sàng. Bấm “Gợi ý nước đi” hoặc “Kiểm duyệt kịch bản”.');
  };
  if (engineSel.value === 'pikafish') prepareEngine();

  hintBtn.onclick = suggest;
  reviewBtn.onclick = review;
  stopBtn.onclick = () => AIEngine.stop();
  for (const el of [fenIn, scriptIn]) el.addEventListener('input', () => { if (!busy && out.querySelector('.ai-list')) out.innerHTML = ''; });

  // ---------- PGN ----------
  const pgnText = $('pgnText'), pgnInfo = $('pgnInfo');
  function pgnSay(msg, isErr) { pgnInfo.textContent = msg; pgnInfo.classList.toggle('err', !!isErr); }
  function importPGN(text) {
    if (!text.trim()) { pgnSay('Hãy dán PGN vào ô trên hoặc mở một file .pgn.', true); return; }
    let r;
    try { r = pgnToScript(text); } catch (e) { pgnSay(`Không đọc được PGN: ${typeof e === 'string' ? e : e.message}`, true); return; }
    if (!r.moves && r.errors.length) { pgnSay(r.errors.join(' '), true); return; }
    titleIn.value = r.title; fenIn.value = r.fen; scriptIn.value = r.script;
    for (const el of [titleIn, fenIn, scriptIn]) el.dispatchEvent(new Event('input', { bubbles: true }));
    Editor.setMode('record'); doBuild(false);
    pgnSay(r.errors.length ? `Chỉ nhập được ${r.moves} nước đầu. ${r.errors.join(' ')}`
      : `Đã nhập ${r.moves} nước, mọi nước đều hợp lệ. Bấm “Kiểm duyệt kịch bản” để máy chấm từng nước.`, r.errors.length > 0);
  }
  $('pgnImport').onclick = () => importPGN(pgnText.value);
  $('pgnFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) { try { text = new TextDecoder('gb18030').decode(buf); } catch (_) { /* giữ bản utf-8 */ } }
    pgnText.value = text; e.target.value = '';
    importPGN(text);
  };
  $('pgnExport').onclick = () => {
    let r;
    try { r = scriptToPGN(fenIn.value, titleIn.value.trim(), scriptIn.value); } catch (e) { pgnSay(`Thế cờ chưa hợp lệ: ${e}`, true); return; }
    pgnText.value = r.pgn;
    pgnSay(`Đã xuất ${r.moves} nước.` + (r.errors.length ? ` Dừng ở lỗi: ${r.errors[0]}` : ''), r.errors.length > 0);
  };
  $('pgnDownload').onclick = () => {
    if (!pgnText.value.trim()) $('pgnExport').click();
    if (!pgnText.value.trim()) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([pgnText.value], { type: 'application/x-chess-pgn' }));
    a.download = (titleIn.value.trim() || 'co-tuong').replace(/[\\/:*?"<>|]+/g, '') + '.pgn';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
})();
