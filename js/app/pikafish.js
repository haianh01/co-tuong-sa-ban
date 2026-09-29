'use strict';
// Cầu nối tới Pikafish (máy cờ tướng mạnh nhất hiện nay, GPLv3) biên dịch sang WebAssembly.
// - Mã máy (tạo bằng tools/pikafish/build.sh) được nạp khi cần, chạy trong Web Worker:
//   engine/pikafish-mt.js (đa luồng) khi trang có SharedArrayBuffer, tức được phục vụ kèm header
//   COOP/COEP (tools/serve.py); còn lại engine/pikafish.js (đơn luồng, chạy được cả với file://).
// - Mạng nơ-ron pikafish.nnue (~50 MB) không nằm trong repo: trang thử tải engine/pikafish.nnue
//   (khi chạy qua máy chủ web), nếu không được thì người dùng chọn file một lần; file được lưu trong
//   IndexedDB của trình duyệt để lần sau dùng ngay.
// Giao diện analyze(opts, progress) giống máy có sẵn (js/core/ai-core.js) để Trợ lý AI dùng chung.
const PikafishEngine = (() => {
  const MATE = 30000;
  const NNUE_URL = 'https://github.com/official-pikafish/Networks/releases/download/master-net/pikafish.nnue';
  const DB = 'co-tuong-pikafish', STORE = 'files', KEY = 'pikafish.nnue';
  const FEN_LETTER = [null, 'k', 'a', 'b', 'n', 'r', 'c', 'p'];
  let nnue = null, worker = null, ready = null, job = null, seq = 0;
  // Đa luồng cần SharedArrayBuffer, trình duyệt chỉ bật khi trang "cross-origin isolated".
  const canMT = self.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function';
  const hw = navigator.hardwareConcurrency || 4;
  const THREADS = Math.max(1, Math.min(hw - 1, 16)); // chừa một nhân cho giao diện
  let mode = null; // { threads } sau khi khởi động

  // ---------- lưu mạng nơ-ron trong IndexedDB ----------
  function idb(mode, fn) {
    return new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction(STORE, mode), r = fn(tx.objectStore(STORE));
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
  // Bản đa luồng nếu dùng được, không thì bản đơn luồng.
  async function loadEngine() {
    if (canMT) { try { return { src: await loadScript('pikafish-mt.js', 'PIKAFISH_MT_SRC'), mt: true }; } catch (e) { /* dùng bản đơn luồng */ } }
    return { src: await loadScript('pikafish.js', 'PIKAFISH_SRC'), mt: false };
  }
  // Chạy sau mã máy trong cùng Worker. Luồng con của bản đa luồng nạp lại chính script này
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
  function reset() {
    if (worker) worker.terminate();
    worker = null; ready = null; mode = null;
    if (job) { const j = job; job = null; j.reject(new Error('stopped')); }
  }
  // Khởi động worker (nếu chưa). Trả về Promise, lỗi nếu thiếu mạng nơ-ron hoặc mã máy.
  function start() {
    if (ready) return ready;
    ready = (async () => {
      const net = await findNet();
      if (!net) { const e = new Error('Chưa có mạng nơ-ron pikafish.nnue.'); e.code = 'NO_NET'; throw e; }
      const eng = await loadEngine();
      const url = URL.createObjectURL(new Blob([eng.src, GLUE], { type: 'text/javascript' }));
      const w = new Worker(url, { name: 'pikafish' }); worker = w;
      await new Promise((res, rej) => {
        const errs = [];
        w.onmessage = e => {
          const d = e.data;
          if (d.type === 'ready') res();
          else if (d.type === 'line' && /error|fail/i.test(d.line)) errs.push(d.line);
          else if (d.type === 'fatal') rej(new Error(errs.concat(d.error).join(' ')));
        };
        w.onerror = e => { e.preventDefault(); rej(new Error(e.message || 'Worker của Pikafish bị lỗi.')); };
        // Luồng tìm kiếm tạo sẵn: THREADS + 2 (dự phòng lúc đổi số luồng).
        w.postMessage({ type: 'init', nnue: net, pool: eng.mt ? THREADS + 2 : 0 });
      });
      if (eng.mt) await raw([`setoption name Threads value ${THREADS}`, 'setoption name Hash value 64', 'isready']);
      // Thử một nước để chắc mạng nơ-ron đọc được.
      await raw(['position startpos', 'go depth 1']);
      mode = { threads: eng.mt ? THREADS : 1 };
      return true;
    })();
    ready.catch(e => {
      if (worker) worker.terminate(); worker = null; ready = null;
      // Worker hỏng khi đọc mạng nơ-ron: file không đúng, bỏ khỏi bộ nhớ để người dùng chọn lại.
      if (!e.code && nnue) { nnue = null; cacheDel(); }
    });
    return ready;
  }

  // Gửi một loạt lệnh UCI, gom các dòng trả lời cho đến khi lệnh cuối chạy xong. Với "go", chờ tới
  // dòng "bestmove" (bản đa luồng trả về ngay, luồng tìm kiếm in kết quả sau).
  function raw(cmds, onLine) {
    return new Promise((resolve, reject) => {
      const id = ++seq, lines = [], j = { resolve, reject };
      let sent = false, best = !cmds[cmds.length - 1].startsWith('go');
      const finish = () => { if (sent && best) { if (job === j) job = null; resolve(lines); } };
      job = j;
      worker.onmessage = e => {
        const d = e.data;
        if (d.type === 'line') { lines.push(d.line); if (onLine) onLine(d.line); if (d.line.startsWith('bestmove')) { best = true; finish(); } }
        else if (d.type === 'cmd-done' && d.id === id) { sent = true; finish(); }
        else if (d.type === 'fatal') { if (job === j) job = null; reject(new Error(lines.filter(l => /error/i.test(l)).concat(d.error).join(' '))); }
      };
      worker.onerror = e => { e.preventDefault(); if (job === j) job = null; reject(new Error(e.message || 'Pikafish bị lỗi.')); };
      cmds.forEach((c, i) => worker.postMessage({ type: 'cmd', cmd: c, id: i === cmds.length - 1 ? id : 0 }));
    });
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
  function parseInfo(line) {
    const t = line.split(/\s+/); if (t[0] !== 'info' || !t.includes('pv') || !t.includes('score')) return null;
    if (t.includes('lowerbound') || t.includes('upperbound')) return null;
    const get = k => { const i = t.indexOf(k); return i < 0 ? null : t[i + 1]; };
    const si = t.indexOf('score'), kind = t[si + 1], v = +t[si + 2];
    const score = kind === 'mate' ? (v > 0 ? MATE - (2 * v - 1) : -(MATE - 2 * -v)) : v;
    return { depth: +get('depth'), multipv: +(get('multipv') || 1), nodes: +(get('nodes') || 0), score, pv: t.slice(t.indexOf('pv') + 1).map(fromUci) };
  }

  // opts giống xqAICore.analyze: { board, side, time, maxDepth, multi, only }
  async function analyze(opts, progress) {
    await start();
    const t0 = performance.now(), multi = Math.max(1, opts.multi || 1);
    // Mỗi vòng tìm kiếm in lại đủ các dòng MultiPV (bắt đầu từ multipv 1). Hết giờ giữa vòng thì vòng
    // cuối chỉ có vài dòng: lấy vòng cuối trước, thiếu thì bù từ vòng trước, bỏ nước trùng.
    let cur = [], prev = [];
    let go = `go movetime ${Math.max(50, Math.round(opts.time || 1000))}`;
    if (opts.maxDepth) go = `go depth ${opts.maxDepth} movetime ${Math.round((opts.time || 1000) * 2)}`;
    if (opts.only && opts.only.length) go += ' searchmoves ' + opts.only.map(toUci).join(' ');
    let best = null, nodes = 0;
    await raw([`setoption name MultiPV value ${multi}`, `position fen ${fenOf(opts.board, opts.side)}`, go], line => {
      if (line.startsWith('bestmove')) { best = line.split(/\s+/)[1]; return; }
      const info = parseInfo(line); if (!info) return;
      if (info.multipv === 1 && cur.length) { prev = cur; cur = []; }
      cur[info.multipv - 1] = info; nodes = Math.max(nodes, info.nodes);
      if (info.multipv === 1 && progress) progress({ depth: info.depth, score: info.score, pv: info.pv, nodes: info.nodes });
    });
    const res = { lines: [], depth: 0, nodes, ms: Math.round(performance.now() - t0), engine: 'pikafish' };
    if (!best || best === '(none)') return res;
    const lines = [];
    for (const l of cur.concat(prev)) if (l && lines.length < multi && !lines.some(x => x.pv[0] + '' === l.pv[0] + '')) lines.push(l);
    if (!lines.length) lines.push({ depth: 0, score: 0, pv: [fromUci(best)] });
    res.lines = lines.map(l => ({ move: l.pv[0], score: l.score, pv: l.pv, depth: l.depth }));
    res.depth = res.lines[0].depth;
    return res;
  }

  return { analyze, start, stop: reset, useFile, info: () => mode, canMT, hasNet: async () => !!(await findNet()), forget: () => { reset(); nnue = null; return cacheDel(); }, NNUE_URL };
})();
