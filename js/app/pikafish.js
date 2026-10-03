'use strict';
// Cầu nối tới Pikafish (máy cờ tướng mạnh nhất hiện nay, GPLv3) biên dịch sang WebAssembly.
// - Mã máy (tạo bằng tools/pikafish/build.sh) được nạp khi cần, chạy trong Web Worker.
// - Người dùng chọn số luồng. Chạy nhiều luồng có hai cách, tùy cách mở trang:
//   * "chung bộ nhớ": trang có SharedArrayBuffer (mở qua tools/serve.py, kèm header COOP/COEP)
//     → một bản engine/pikafish-mt.js chạy N luồng như Pikafish trên máy tính. Hiệu quả nhất.
//   * "nhiều bản": mở index.html trực tiếp (file://) thì trình duyệt không cho dùng SharedArrayBuffer
//     → chạy N bản engine/pikafish.js (đơn luồng) độc lập. Kiểm duyệt chấm N nước cùng lúc;
//     gợi ý chia các nước đi cho N bản rồi gộp kết quả.
// - Mạng nơ-ron pikafish.nnue (~50 MB) không nằm trong repo: trang thử tải engine/pikafish.nnue
//   (khi chạy qua máy chủ web), nếu không được thì người dùng chọn file một lần; file được lưu trong
//   IndexedDB của trình duyệt để lần sau dùng ngay.
// Giao diện analyze(opts, progress) giống máy có sẵn (js/core/ai-core.js) để Trợ lý AI dùng chung.
const PikafishEngine = (() => {
  const MATE = 30000;
  const NNUE_URL = 'https://github.com/official-pikafish/Networks/releases/download/master-net/pikafish.nnue';
  const DB = 'co-tuong-pikafish', STORE = 'files', KEY = 'pikafish.nnue';
  const FEN_LETTER = [null, 'k', 'a', 'b', 'n', 'r', 'c', 'p'];
  // Đa luồng chung bộ nhớ cần SharedArrayBuffer, trình duyệt chỉ bật khi trang "cross-origin isolated".
  const canShared = self.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function';
  const hw = navigator.hardwareConcurrency || 4;
  // Mỗi bản độc lập giữ riêng mạng nơ-ron và bộ nhớ tìm kiếm (đo được khoảng 450 MB một bản trên Chrome)
  // nên chế độ nhiều bản giới hạn 4 bản, mặc định 2. Chung bộ nhớ chỉ một bản nên dùng được nhiều luồng.
  const MAX = canShared ? Math.max(1, Math.min(hw, 16)) : Math.max(1, Math.min(hw, 4));
  const RECOMMENDED = Math.max(1, Math.min(hw - 1, canShared ? 16 : 2)); // chừa một nhân cho giao diện
  let nnue = null, ready = null, insts = [], waiters = [], mode = null, want = RECOMMENDED;

  // ---------- lưu mạng nơ-ron trong IndexedDB ----------
  function idb(dbMode, fn) {
    return new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction(STORE, dbMode), r = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); res(r && r.result); };
        tx.onerror = () => { db.close(); rej(tx.error); };
      };
    });
  }
  const cacheGet = () => idb('readonly', s => s.get(KEY)).catch(() => null);
  const cachePut = buf => idb('readwrite', s => s.put(buf, KEY)).catch(() => null);
  const cacheDel = () => idb('readwrite', s => s.delete(KEY)).catch(() => null);

  function looksLikeNet(buf) { return buf && buf.byteLength > 1e6; }
  async function findNet() {
    if (nnue) return nnue;
    const cached = await cacheGet();
    if (looksLikeNet(cached)) return (nnue = cached);
    if (location.protocol !== 'file:') {
      try {
        const r = await fetch('engine/pikafish.nnue');
        if (r.ok) { const b = await r.arrayBuffer(); if (looksLikeNet(b)) return (nnue = b); }
      } catch (e) { /* không có file cạnh trang */ }
    }
    return null;
  }
  async function useFile(file) {
    const buf = await file.arrayBuffer();
    if (!looksLikeNet(buf)) throw new Error('File này không phải mạng nơ-ron của Pikafish (pikafish.nnue nặng khoảng 50 MB).');
    reset(); nnue = buf;
    await start();
    cachePut(buf);
  }

  // ---------- nạp mã máy ----------
  function loadScript(file, v) {
    if (window[v]) return Promise.resolve(window[v]);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'engine/' + file;
      const fail = msg => { const e = new Error(msg); e.code = 'NO_SCRIPT'; rej(e); };
      s.onload = () => window[v] ? res(window[v]) : fail(`engine/${file} không hợp lệ.`);
      s.onerror = () => fail(`Không nạp được engine/${file}. Hãy chạy tools/pikafish/build.sh để tạo file này.`);
      document.head.appendChild(s);
    });
  }
  // Chạy sau mã máy trong cùng Worker. Luồng con của bản chung bộ nhớ nạp lại chính script này
  // (tên "em-pthread") và tự xử lý tin nhắn, nên không được gắn onmessage ở đó.
  const GLUE = `
let mod = null;
if (self.name !== 'em-pthread') onmessage = async e => {
  const d = e.data;
  try {
    if (d.type === 'init') {
      mod = await PikafishModule({ pfPoolSize: d.pool, print: l => postMessage({ type: 'line', line: l }), printErr: l => postMessage({ type: 'line', line: l }) });
      mod.FS.writeFile('/pikafish.nnue', new Uint8Array(d.nnue));
      mod.ccall('pf_init', null, [], []);
      try { mod.FS.unlink('/pikafish.nnue'); } catch (_) {}
      postMessage({ type: 'ready' });
    } else if (d.type === 'cmd') {
      mod.ccall('pf_command', null, ['string'], [d.cmd]);
      postMessage({ type: 'cmd-done', id: d.id });
    }
  } catch (err) { postMessage({ type: 'fatal', error: String(err && err.message || err) }); }
};`;

  // Một bản Pikafish trong một Worker.
  function makeInstance(src, pool, net) {
    const url = URL.createObjectURL(new Blob([src, GLUE], { type: 'text/javascript' }));
    const inst = { worker: new Worker(url, { name: 'pikafish' }), job: null, seq: 0, busy: false };
    // Gửi một loạt lệnh UCI, gom các dòng trả lời cho đến khi lệnh cuối chạy xong. Với "go", chờ tới
    // dòng "bestmove" (bản chung bộ nhớ trả về ngay, luồng tìm kiếm in kết quả sau).
    inst.raw = (cmds, onLine) => new Promise((resolve, reject) => {
      const id = ++inst.seq, lines = [], j = { resolve, reject };
      let sent = false, best = !cmds[cmds.length - 1].startsWith('go');
      const finish = () => { if (sent && best) { if (inst.job === j) inst.job = null; resolve(lines); } };
      inst.job = j;
      inst.worker.onmessage = e => {
        const d = e.data;
        if (d.type === 'line') { lines.push(d.line); if (onLine) onLine(d.line); if (d.line.startsWith('bestmove')) { best = true; finish(); } }
        else if (d.type === 'cmd-done' && d.id === id) { sent = true; finish(); }
        else if (d.type === 'fatal') { if (inst.job === j) inst.job = null; reject(new Error(lines.filter(l => /error/i.test(l)).concat(d.error).join(' '))); }
      };
      inst.worker.onerror = e => { e.preventDefault(); if (inst.job === j) inst.job = null; reject(new Error(e.message || 'Pikafish bị lỗi.')); };
      cmds.forEach((c, i) => inst.worker.postMessage({ type: 'cmd', cmd: c, id: i === cmds.length - 1 ? id : 0 }));
    });
    inst.ready = new Promise((res, rej) => {
      const errs = [];
      inst.worker.onmessage = e => {
        const d = e.data;
        if (d.type === 'ready') res();
        else if (d.type === 'line' && /error|fail/i.test(d.line)) errs.push(d.line);
        else if (d.type === 'fatal') rej(new Error(errs.concat(d.error).join(' ')));
      };
      inst.worker.onerror = e => { e.preventDefault(); rej(new Error(e.message || 'Worker của Pikafish bị lỗi.')); };
      inst.worker.postMessage({ type: 'init', nnue: net, pool });
    });
    return inst;
  }

  let boot = null; // mã máy + mạng nơ-ron đã nạp, để thay một bản máy mà không phải khởi động lại tất cả
  function reset() {
    for (const i of insts) { i.worker.terminate(); if (i.job) { const j = i.job; i.job = null; j.reject(new Error('stopped')); } }
    insts = []; ready = null; mode = null;
    const w = waiters; waiters = []; w.forEach(x => x.reject(new Error('stopped')));
  }
  // Khởi động các bản máy (nếu chưa). Lỗi nếu thiếu mạng nơ-ron hoặc mã máy.
  function start() {
    if (ready) return ready;
    ready = (async () => {
      const net = await findNet();
      if (!net) { const e = new Error('Chưa có mạng nơ-ron pikafish.nnue.'); e.code = 'NO_NET'; throw e; }
      const n = Math.max(1, Math.min(want, MAX));
      let shared = canShared && n > 1, src;
      if (shared) { try { src = await loadScript('pikafish-mt.js', 'PIKAFISH_MT_SRC'); } catch (e) { shared = false; } }
      if (!shared) src = await loadScript('pikafish.js', 'PIKAFISH_SRC');
      const count = shared ? 1 : n;
      boot = { src, pool: shared ? n + 2 : 0, net };
      // Luồng tìm kiếm của bản chung bộ nhớ được tạo sẵn: n + 2 (dự phòng lúc đổi số luồng).
      const list = Array.from({ length: count }, () => makeInstance(src, shared ? n + 2 : 0, net));
      insts = list;
      await Promise.all(list.map(i => i.ready));
      await Promise.all(list.map(async i => {
        if (shared) await i.raw([`setoption name Threads value ${n}`, 'setoption name Hash value 64', 'isready']);
        await i.raw(['position startpos', 'go depth 1']); // thử một nước để chắc mạng nơ-ron đọc được
      }));
      mode = { threads: n, shared, instances: count };
      return true;
    })();
    ready.catch(e => {
      for (const i of insts) i.worker.terminate();
      insts = []; ready = null; mode = null;
      // Worker hỏng khi đọc mạng nơ-ron: file không đúng, bỏ khỏi bộ nhớ để người dùng chọn lại.
      if (!e.code && nnue) { nnue = null; cacheDel(); }
    });
    return ready;
  }

  // Mượn một bản đang rảnh (chờ nếu tất cả đang bận).
  function acquire() {
    const free = insts.find(i => !i.busy);
    if (free) { free.busy = true; return Promise.resolve(free); }
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }
  function release(inst) {
    if (!insts.includes(inst)) return;
    const w = waiters.shift();
    if (w) w.resolve(inst); else inst.busy = false;
  }

  // ---------- chuyển đổi ----------
  function fenOf(board, side) {
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let row = '', gap = 0;
      for (let c = 0; c < 9; c++) {
        const p = board[r * 9 + c];
        if (!p) { gap++; continue; }
        if (gap) { row += gap; gap = 0; }
        const l = FEN_LETTER[p & 7]; row += p & 8 ? l : l.toUpperCase();
      }
      rows.push(row + (gap || ''));
    }
    return rows.join('/') + (side ? ' b' : ' w') + ' - - 0 1';
  }
  const sq = s => (9 - +s[1]) * 9 + (s.charCodeAt(0) - 97);
  const fromUci = u => [sq(u.slice(0, 2)), sq(u.slice(2, 4))];
  const toUci = m => { const f = i => String.fromCharCode(97 + i % 9) + (9 - ((i / 9) | 0)); return f(m[0]) + f(m[1]); };
  const key = m => m[0] + ',' + m[1];
  function parseInfo(line) {
    const t = line.split(/\s+/); if (t[0] !== 'info' || !t.includes('pv') || !t.includes('score')) return null;
    if (t.includes('lowerbound') || t.includes('upperbound')) return null;
    const get = k => { const i = t.indexOf(k); return i < 0 ? null : t[i + 1]; };
    const si = t.indexOf('score'), kind = t[si + 1], v = +t[si + 2];
    const score = kind === 'mate' ? (v > 0 ? MATE - (2 * v - 1) : -(MATE - 2 * -v)) : v;
    return { depth: +get('depth'), multipv: +(get('multipv') || 1), nodes: +(get('nodes') || 0), score, pv: t.slice(t.indexOf('pv') + 1).map(fromUci) };
  }

  // Một lần tìm kiếm trên một bản máy.
  async function search(inst, opts, progress) {
    const multi = Math.max(1, opts.multi || 1);
    // Mỗi vòng tìm kiếm in lại đủ các dòng MultiPV (bắt đầu từ multipv 1). Hết giờ giữa vòng thì vòng
    // cuối chỉ có vài dòng: lấy vòng cuối trước, thiếu thì bù từ vòng trước, bỏ nước trùng.
    let cur = [], prev = [], best = null, nodes = 0;
    let go = `go movetime ${Math.max(50, Math.round(opts.time || 1000))}`;
    // Có maxDepth: dừng khi đủ độ sâu, time chỉ là giới hạn trên (giống máy có sẵn).
    if (opts.maxDepth) go = `go depth ${opts.maxDepth} movetime ${Math.max(50, Math.round(opts.time || 1000))}`;
    if (opts.only && opts.only.length) go += ' searchmoves ' + opts.only.map(toUci).join(' ');
    // Có lịch sử ván thì gửi "thế đầu + các nước đã đi" để Pikafish xét luật lặp nước, chiếu dai, đuổi dai.
    const h = opts.history, position = h && h.moves && h.moves.length
      ? `position fen ${fenOf(h.board, h.side)} moves ${h.moves.map(toUci).join(' ')}` : `position fen ${fenOf(opts.board, opts.side)}`;
    await inst.raw([`setoption name MultiPV value ${multi}`, position, go], line => {
      if (line.startsWith('bestmove')) { best = line.split(/\s+/)[1]; return; }
      const info = parseInfo(line); if (!info) return;
      if (info.multipv === 1 && cur.length) { prev = cur; cur = []; }
      cur[info.multipv - 1] = info; nodes = Math.max(nodes, info.nodes);
      if (info.multipv === 1 && progress) progress(info);
    });
    const lines = [];
    if (best && best !== '(none)') {
      for (const l of cur.concat(prev)) if (l && lines.length < multi && !lines.some(x => key(x.pv[0]) === key(l.pv[0]))) lines.push(l);
      if (!lines.length) lines.push({ depth: 0, score: 0, pv: [fromUci(best)] });
    }
    return { lines: lines.map(l => ({ move: l.pv[0], score: l.score, pv: l.pv, depth: l.depth })), nodes };
  }

  // opts giống xqAICore.analyze: { board, side, time, maxDepth, multi, only }, thêm:
  //   moves: các nước hợp lệ (để chia cho nhiều bản máy), split: false để không chia.
  async function analyze(opts, progress) {
    await start();
    const t0 = performance.now(), multi = Math.max(1, opts.multi || 1);
    const free = insts.filter(i => !i.busy);
    const canSplit = opts.split !== false && !(opts.only && opts.only.length) && opts.moves && opts.moves.length > 1 && free.length > 1;
    let parts;
    if (!canSplit) {
      const inst = await acquire();
      try { parts = [await search(inst, opts, progress && (i => progress(i)))]; } finally { release(inst); }
    } else {
      // Chia các nước đi xen kẽ cho các bản đang rảnh, mỗi bản tìm trong phần của mình.
      const k = Math.min(free.length, opts.moves.length), groups = Array.from({ length: k }, () => []);
      opts.moves.forEach((m, i) => groups[i % k].push(m));
      const use = free.slice(0, k); use.forEach(i => { i.busy = true; });
      const latest = [];
      const report = (g, info) => {
        latest[g] = info; if (!progress) return;
        progress(latest.filter(Boolean).reduce((a, b) => (b.score > a.score ? b : a)));
      };
      try {
        parts = await Promise.all(groups.map((g, gi) => search(use[gi], { ...opts, only: g, multi: Math.min(multi, g.length) }, info => report(gi, info))));
      } finally { use.forEach(release); }
    }
    const all = parts.flatMap(p => p.lines).sort((a, b) => b.score - a.score).slice(0, multi);
    return { lines: all, depth: all.length ? all[0].depth : 0, nodes: parts.reduce((s, p) => s + p.nodes, 0), ms: Math.round(performance.now() - t0), engine: 'pikafish' };
  }

  // ---------- "Suy nghĩ của máy": chạy lâu và chuyển nguyên từng dòng UCI ra ngoài ----------
  // opts: { board, side, history, multi, time (ms) }; onLine(line) nhận mọi dòng Pikafish in ra.
  let thinkInst = null;
  async function think(opts, onLine) {
    await start();
    const inst = await acquire(); thinkInst = inst;
    const h = opts.history, position = h && h.moves && h.moves.length
      ? `position fen ${fenOf(h.board, h.side)} moves ${h.moves.map(toUci).join(' ')}` : `position fen ${fenOf(opts.board, opts.side)}`;
    try {
      await inst.raw(['setoption name UCI_ShowWDL value true', `setoption name MultiPV value ${Math.max(1, opts.multi || 1)}`, position,
        `go movetime ${Math.max(500, Math.round(opts.time || 30000))}`], onLine);
    } finally {
      if (thinkInst === inst) thinkInst = null;
      if (insts.includes(inst)) { await inst.raw(['setoption name UCI_ShowWDL value false']).catch(() => {}); release(inst); }
    }
  }
  // Dừng sớm. Bản đa luồng nhận lệnh "stop" ngay (in bestmove rồi kết thúc). Bản đơn luồng đang bận tính
  // nên không đọc được lệnh: tắt hẳn bản đó (kết quả đã in vẫn giữ) rồi khởi động một bản mới thay vào ở nền.
  function stopThink() {
    const inst = thinkInst; if (!inst) return;
    if (mode && mode.shared) { inst.worker.postMessage({ type: 'cmd', cmd: 'stop', id: 0 }); return; }
    thinkInst = null;
    const i = insts.indexOf(inst); if (i < 0) return;
    inst.worker.terminate();
    if (inst.job) { const j = inst.job; inst.job = null; j.reject(new Error('stopped')); }
    const ni = makeInstance(boot.src, boot.pool, boot.net); ni.busy = true; insts[i] = ni;
    ni.ready.then(() => ni.raw(['position startpos', 'go depth 1'])).then(() => release(ni)).catch(() => reset());
  }

  return {
    analyze, think, stopThink, start, stop: reset, useFile, NNUE_URL, canShared, MAX, RECOMMENDED,
    info: () => mode,
    // Số lần phân tích chạy song song được (kiểm duyệt chấm nhiều nước cùng lúc).
    lanes: () => (mode ? mode.instances : 1),
    setThreads: n => { n = Math.max(1, Math.min(+n || 1, MAX)); if (n !== want) { want = n; reset(); } },
    threads: () => want,
    hasNet: async () => !!(await findNet()),
    forget: () => { reset(); nnue = null; return cacheDel(); }
  };
})();
