'use strict';
// Máy tính cờ tướng: sinh nước, lượng giá thế cờ, tìm kiếm alpha-beta có bảng băm.
// Toàn bộ nằm trong một hàm tự đủ (không dùng biến ngoài) để có thể chạy trong Web Worker
// (tạo từ Blob bằng xqAICore.toString()) hoặc gọi thẳng trên trang khi trình duyệt chặn Worker.
//
// Bàn cờ: mảng 90 số, ô = hàng * 9 + cột, hàng 0 là hàng đáy của Đen.
// Mã quân: 1 Tướng, 2 Sĩ, 3 Tượng, 4 Mã, 5 Xe, 6 Pháo, 7 Tốt; cộng 8 nếu là quân Đen. Bên: 0 Đỏ, 1 Đen.
// Nước đi: [từ, đến]. Điểm tính theo bên đang đi (100 ≈ một Tốt chưa qua sông).
function xqAICore(host) {
  const KING = 1, ADV = 2, ELE = 3, HORSE = 4, ROOK = 5, CANNON = 6, PAWN = 7, BLACK = 8;
  const MATE = 30000, WIN = MATE - 500, INF = 32000, MAX_PLY = 96;
  const ON = (c, r) => c >= 0 && c < 9 && r >= 0 && r < 10;
  const sideOf = p => (p & BLACK) ? 1 : 0;
  const mirror = sq => (9 - ((sq / 9) | 0)) * 9 + sq % 9;
  const inPalace = (c, r, s) => c >= 3 && c <= 5 && (s === 0 ? r >= 7 && r <= 9 : r >= 0 && r <= 2);

  // ---------- bảng nước đi tính sẵn ----------
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const HJ = [[1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1], [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]];
  const rays = [], horseTo = [], horseFrom = [], eleTo = [[], []], advTo = [[], []], kingTo = [[], []], pawnTo = [[], []];
  for (let sq = 0; sq < 90; sq++) {
    const c = sq % 9, r = (sq / 9) | 0;
    rays[sq] = ORTH.map(([dc, dr]) => { const o = []; for (let cc = c + dc, rr = r + dr; ON(cc, rr); cc += dc, rr += dr) o.push(rr * 9 + cc); return o; });
    horseTo[sq] = []; horseFrom[sq] = [];
    for (const [dc, dr, lc, lr] of HJ) {
      if (ON(c + dc, r + dr)) horseTo[sq].push([(r + dr) * 9 + c + dc, (r + lr) * 9 + c + lc]);
      const hc = c - dc, hr = r - dr; // Mã đứng ở đây thì nhảy tới được ô sq
      if (ON(hc, hr)) horseFrom[sq].push([hr * 9 + hc, (hr + lr) * 9 + hc + lc]);
    }
    for (let s = 0; s < 2; s++) {
      eleTo[s][sq] = []; advTo[s][sq] = []; kingTo[s][sq] = []; pawnTo[s][sq] = [];
      for (const [dc, dr] of DIAG) {
        const cc = c + 2 * dc, rr = r + 2 * dr;
        if (ON(cc, rr) && (s === 0 ? rr >= 5 : rr <= 4)) eleTo[s][sq].push([rr * 9 + cc, (r + dr) * 9 + c + dc]);
        if (inPalace(c + dc, r + dr, s)) advTo[s][sq].push((r + dr) * 9 + c + dc);
      }
      for (const [dc, dr] of ORTH) if (inPalace(c + dc, r + dr, s)) kingTo[s][sq].push((r + dr) * 9 + c + dc);
      const f = s === 0 ? -1 : 1, crossed = s === 0 ? r <= 4 : r >= 5;
      if (ON(c, r + f)) pawnTo[s][sq].push((r + f) * 9 + c);
      if (crossed) { if (c > 0) pawnTo[s][sq].push(sq - 1); if (c < 8) pawnTo[s][sq].push(sq + 1); }
    }
  }
  const PALACE = [[66, 67, 68, 75, 76, 77, 84, 85, 86], [3, 4, 5, 12, 13, 14, 21, 22, 23]];

  // ---------- lượng giá: giá trị quân + vị trí (nhìn từ phía Đỏ, hàng 0 là đáy địch) ----------
  const VALUE = [0, 0, 200, 200, 400, 900, 450, 100];
  const POS = [
    null,
    (c, r) => (c === 4 ? 10 : 0) - (9 - r) * 20,                                   // Tướng: nên ở giữa, không nên lên cao
    (c, r) => (c === 4 && r === 8 ? 10 : 0),                                        // Sĩ
    (c, r) => (c === 4 && r === 7 ? 15 : 0) + (r === 5 ? -5 : 0),                   // Tượng
    (c, r) => 6 * (4 - Math.abs(c - 4)) + (r <= 4 ? 20 : 0) + (r >= 1 && r <= 3 && c >= 2 && c <= 6 ? 25 : 0)
      - (c === 0 || c === 8 ? 25 : 0) - (r === 9 ? 20 : 0) - (r === 0 ? 20 : 0),   // Mã
    (c, r) => (r <= 4 ? 15 : 0) + (r === 1 || r === 2 ? 15 : 0) + (c === 3 || c === 5 ? 5 : 0) - (r === 9 ? 15 : 0), // Xe
    (c, r) => (c === 4 ? 20 : 0) + (r === 0 ? 10 : 0) + (r === 2 && c !== 4 ? 5 : 0), // Pháo
    (c, r) => r >= 5 ? (c === 4 && r === 5 ? 10 : 0) :
      70 + 8 * (4 - Math.abs(c - 4)) + (r >= 1 && r <= 3 ? 30 : r === 4 ? 10 : -40) + (r >= 1 && r <= 2 && c >= 3 && c <= 5 ? 20 : 0) // Tốt
  ];
  // PST[mã quân][ô]: điểm có dấu (Đỏ dương, Đen âm).
  const PST = [];
  for (let p = 0; p < 16; p++) {
    PST[p] = new Int16Array(90); const t = p & 7; if (!t) continue;
    for (let sq = 0; sq < 90; sq++) {
      const s = p & BLACK ? mirror(sq) : sq, v = VALUE[t] + POS[t](s % 9, (s / 9) | 0);
      PST[p][sq] = p & BLACK ? -v : v;
    }
  }

  // ---------- băm Zobrist (hai số 32 bit) ----------
  let seed = 0x2545F491;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const Z1 = [], Z2 = [];
  for (let p = 0; p < 16; p++) { Z1[p] = new Int32Array(90); Z2[p] = new Int32Array(90); for (let s = 0; s < 90; s++) { Z1[p][s] = rnd(); Z2[p][s] = rnd(); } }
  const ZS1 = rnd(), ZS2 = rnd();

  // ---------- trạng thái tìm kiếm ----------
  const B = new Int8Array(90);
  let h1 = 0, h2 = 0, score = 0, ply = 0, nodes = 0, deadline = 0, aborted = false;
  const hashStack = new Int32Array(MAX_PLY + 8);
  const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE);
  const EXACT = 1, LOWER = 2, UPPER = 3;
  const killers = new Int32Array((MAX_PLY + 8) * 2), history = new Int32Array(90 * 128);
  const pvTable = [], pvLen = new Int32Array(MAX_PLY + 8);
  for (let i = 0; i < MAX_PLY + 8; i++) pvTable.push(new Int32Array(MAX_PLY + 8));
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ABORT = {};

  function load(board) {
    h1 = 0; h2 = 0; score = 0;
    for (let i = 0; i < 90; i++) { const p = board[i] | 0; B[i] = p; if (p) { h1 ^= Z1[p][i]; h2 ^= Z2[p][i]; score += PST[p][i]; } }
  }
  const enc = (f, t) => (f << 7) | t;

  // Sinh nước giả hợp lệ (chưa xét bị chiếu). caps = chỉ nước ăn quân.
  function gen(side, caps, out) {
    const add = (f, t) => { const q = B[t]; if (q) { if (sideOf(q) !== side) out.push(enc(f, t)); } else if (!caps) out.push(enc(f, t)); };
    for (let sq = 0; sq < 90; sq++) {
      const p = B[sq]; if (!p || sideOf(p) !== side) continue;
      switch (p & 7) {
        case ROOK:
          for (const ray of rays[sq]) for (const t of ray) { const q = B[t]; if (!q) { if (!caps) out.push(enc(sq, t)); } else { if (sideOf(q) !== side) out.push(enc(sq, t)); break; } }
          break;
        case CANNON:
          for (const ray of rays[sq]) {
            let jumped = false;
            for (const t of ray) { const q = B[t]; if (!jumped) { if (q) jumped = true; else if (!caps) out.push(enc(sq, t)); } else if (q) { if (sideOf(q) !== side) out.push(enc(sq, t)); break; } }
          }
          break;
        case HORSE: for (const [t, leg] of horseTo[sq]) if (!B[leg]) add(sq, t); break;
        case ELE: for (const [t, eye] of eleTo[side][sq]) if (!B[eye]) add(sq, t); break;
        case ADV: for (const t of advTo[side][sq]) add(sq, t); break;
        case KING: for (const t of kingTo[side][sq]) add(sq, t); break;
        case PAWN: for (const t of pawnTo[side][sq]) add(sq, t); break;
      }
    }
    return out;
  }
  function kingSq(side) { const k = side ? KING | BLACK : KING; for (const s of PALACE[side]) if (B[s] === k) return s; return -1; }
  // Tướng của `side` có đang bị chiếu không (kể cả hai Tướng đối mặt).
  function inCheck(side) {
    const k = kingSq(side); if (k < 0) return true;
    const e = side ? 0 : BLACK;
    for (const ray of rays[k]) {
      let i = 0;
      for (; i < ray.length; i++) { const q = B[ray[i]]; if (q) { if (q === (e | ROOK) || q === (e | KING)) return true; break; } }
      for (i++; i < ray.length; i++) { const q = B[ray[i]]; if (q) { if (q === (e | CANNON)) return true; break; } }
    }
    for (const [h, leg] of horseFrom[k]) if (B[h] === (e | HORSE) && !B[leg]) return true;
    const pw = e | PAWN, c = k % 9, fwd = side === 0 ? k - 9 : k + 9;
    if (fwd >= 0 && fwd < 90 && B[fwd] === pw) return true;
    if (c > 0 && B[k - 1] === pw) return true;
    if (c < 8 && B[k + 1] === pw) return true;
    return false;
  }
  function make(m) {
    const f = m >> 7, t = m & 127, p = B[f], q = B[t];
    hashStack[ply] = h1;
    B[t] = p; B[f] = 0;
    score += PST[p][t] - PST[p][f]; h1 ^= Z1[p][f] ^ Z1[p][t] ^ ZS1; h2 ^= Z2[p][f] ^ Z2[p][t] ^ ZS2;
    if (q) { score -= PST[q][t]; h1 ^= Z1[q][t]; h2 ^= Z2[q][t]; }
    ply++;
    return q;
  }
  function unmake(m, q) {
    const f = m >> 7, t = m & 127, p = B[t];
    ply--;
    B[f] = p; B[t] = q;
    score -= PST[p][t] - PST[p][f]; h1 ^= Z1[p][f] ^ Z1[p][t] ^ ZS1; h2 ^= Z2[p][f] ^ Z2[p][t] ^ ZS2;
    if (q) { score += PST[q][t]; h1 ^= Z1[q][t]; h2 ^= Z2[q][t]; }
  }
  const evaluate = side => side ? -score : score;
  const repeated = () => { for (let i = ply - 2; i >= 0; i -= 2) if (hashStack[i] === h1) return true; return false; };
  // Các thế cờ đã xảy ra trước đó trong ván (opts.history), đếm số lần. Đi về một thế đã xảy ra 2 lần
  // (tức lặp lần thứ ba) thì tính là hòa, giống Pikafish/Stockfish; lặp ngay trong lúc tìm kiếm thì vẫn
  // tính hòa ở lần thứ hai (repeated). Khóa = mã băm thế cờ, đã đảo lượt theo khoảng cách tới thế
  // hiện tại để khớp với mã băm trong lúc tìm kiếm (mỗi nước đảo ZS1/ZS2 một lần).
  let histMap = new Map();
  function loadHistory(hist) {
    histMap = new Map();
    if (!hist || !hist.board || !hist.moves || !hist.moves.length) return;
    const b = hist.board.slice(), n = hist.moves.length;
    for (let i = 0; i < n; i++) {
      if (n - i <= 100) { load(b); const odd = (n - i) & 1, k = (odd ? h1 ^ ZS1 : h1) + ':' + (odd ? h2 ^ ZS2 : h2); histMap.set(k, (histMap.get(k) || 0) + 1); }
      const [f, t] = hist.moves[i]; b[t] = b[f]; b[f] = 0;
    }
  }
  function hasPieces(side) { const b = side ? BLACK : 0; for (let i = 0; i < 90; i++) { const p = B[i]; if (p && (p & BLACK) === b) { const t = p & 7; if (t === ROOK || t === HORSE || t === CANNON) return true; } } return false; }
  function tick() { if ((++nodes & 1023) === 0 && now() > deadline) { aborted = true; throw ABORT; } }

  function order(moves, ttm, pl) {
    const keys = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], q = B[m & 127];
      keys[i] = m === ttm ? 1e9 : q ? 1e6 + VALUE[q & 7] * 10 - VALUE[B[m >> 7] & 7] / 10 + ((q & 7) === KING ? 1e5 : 0)
        : m === killers[pl * 2] ? 9e5 : m === killers[pl * 2 + 1] ? 8e5 : history[(m >> 7) * 128 + (m & 127)];
    }
    for (let i = 1; i < moves.length; i++) { // sắp xếp chèn, giảm dần
      const m = moves[i], k = keys[i]; let j = i - 1;
      while (j >= 0 && keys[j] < k) { moves[j + 1] = moves[j]; keys[j + 1] = keys[j]; j--; }
      moves[j + 1] = m; keys[j + 1] = k;
    }
    return moves;
  }

  function quiesce(side, alpha, beta, qd) {
    tick();
    pvLen[ply] = ply;
    if (ply >= MAX_PLY) return evaluate(side);
    const chk = qd < 4 && inCheck(side);
    let best = -MATE + ply;
    if (!chk) { best = evaluate(side); if (best >= beta) return best; if (best > alpha) alpha = best; }
    const moves = order(gen(side, !chk, []), 0, ply);
    let legal = 0;
    for (const m of moves) {
      const q = make(m);
      if (inCheck(side)) { unmake(m, q); continue; }
      legal++;
      const v = -quiesce(side ^ 1, -beta, -alpha, qd + 1);
      unmake(m, q);
      if (v > best) { best = v; if (v > alpha) { alpha = v; if (v >= beta) break; } }
    }
    if (chk && !legal) return -MATE + ply;
    return best;
  }

  function search(side, depth, alpha, beta, allowNull) {
    tick();
    pvLen[ply] = ply;
    if (ply > 0 && (repeated() || (histMap.size && histMap.get(h1 + ':' + h2) >= 2))) return 0;
    if (ply >= MAX_PLY) return evaluate(side);
    const chk = inCheck(side);
    if (chk) depth++;
    if (depth <= 0) return quiesce(side, alpha, beta, 0);
    // khoảng cách tới chiếu bí
    const ma = Math.max(alpha, -MATE + ply), mb = Math.min(beta, MATE - ply - 1);
    if (ma >= mb) return ma;
    const slot = h1 & TT_MASK, pvNode = beta - alpha > 1;
    let ttm = 0;
    if (ttKey[slot] === h2) {
      ttm = ttMove[slot];
      if (!pvNode && ttDepth[slot] >= depth) {
        let s = ttScore[slot]; if (s > WIN) s -= ply; else if (s < -WIN) s += ply;
        const fl = ttFlag[slot];
        if (fl === EXACT || (fl === LOWER && s >= beta) || (fl === UPPER && s <= alpha)) return s;
      }
    }
    if (allowNull && !pvNode && !chk && depth >= 3 && beta < WIN && beta > -WIN && hasPieces(side)) {
      hashStack[ply] = h1; ply++; h1 ^= ZS1; h2 ^= ZS2;
      let v;
      try { v = -search(side ^ 1, depth - 3, -beta, -beta + 1, false); }
      finally { ply--; h1 ^= ZS1; h2 ^= ZS2; }
      if (v >= beta) return v >= WIN ? beta : v;
    }
    const moves = order(gen(side, false, []), ttm, ply);
    const a0 = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    for (const m of moves) {
      const q = make(m);
      if (inCheck(side)) { unmake(m, q); continue; }
      legal++;
      let v;
      if (legal === 1) v = -search(side ^ 1, depth - 1, -beta, -alpha, true);
      else {
        const red = !chk && !q && legal > 4 && depth >= 3 ? 1 : 0;
        v = -search(side ^ 1, depth - 1 - red, -alpha - 1, -alpha, true);
        if (v > alpha && (red || v < beta)) v = -search(side ^ 1, depth - 1, -beta, -alpha, true);
      }
      unmake(m, q);
      if (v > best) {
        best = v; bestMove = m;
        if (v > alpha) {
          alpha = v;
          const row = pvTable[ply], next = pvTable[ply + 1]; row[ply] = m;
          for (let i = ply + 1; i < pvLen[ply + 1]; i++) row[i] = next[i];
          pvLen[ply] = Math.max(pvLen[ply + 1], ply + 1);
          if (v >= beta) {
            if (!q) { if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; } history[(m >> 7) * 128 + (m & 127)] += depth * depth; }
            break;
          }
        }
      }
    }
    if (!legal) return -MATE + ply; // cờ tướng: hết nước đi là thua (cả khi không bị chiếu)
    let s = best; if (s > WIN) s += ply; else if (s < -WIN) s -= ply;
    ttKey[slot] = h2; ttMove[slot] = bestMove; ttScore[slot] = s; ttDepth[slot] = depth;
    ttFlag[slot] = best >= beta ? LOWER : best <= a0 ? UPPER : EXACT;
    return best;
  }

  // Tìm nước tốt nhất trong danh sách rootMoves ở độ sâu depth.
  function root(side, depth, rootMoves) {
    let alpha = -INF, best = null;
    for (let i = 0; i < rootMoves.length; i++) {
      const m = rootMoves[i], q = make(m);
      let v;
      if (i === 0) v = -search(side ^ 1, depth - 1, -INF, -alpha, true);
      else { v = -search(side ^ 1, depth - 1, -alpha - 1, -alpha, true); if (v > alpha) v = -search(side ^ 1, depth - 1, -INF, -alpha, true); }
      unmake(m, q);
      if (v > alpha) {
        alpha = v;
        const pv = [m]; for (let k = 1; k < pvLen[1]; k++) pv.push(pvTable[1][k]);
        best = { move: m, score: v, pv };
        rootMoves.splice(i, 1); rootMoves.unshift(m);
      }
    }
    return best;
  }

  function legalMoves(side) { const out = []; for (const m of gen(side, false, [])) { const q = make(m); if (!inCheck(side)) out.push(m); unmake(m, q); } return out; }
  const dec = m => [m >> 7, m & 127];
  const same = (m, a) => (m >> 7) === a[0] && (m & 127) === a[1];

  // opts: { board, side, time (ms), maxDepth, multi, only: [[từ, đến]], exclude: [[từ, đến]],
  //         history: { board, side, moves: [[từ, đến]] } = thế đầu ván và các nước đã đi tới thế hiện tại }
  function analyze(opts, progress) {
    const start = now(), total = opts.time || 1000, multi = Math.max(1, opts.multi || 1), maxDepth = opts.maxDepth || 64;
    loadHistory(opts.history);
    load(opts.board); ply = 0; nodes = 0;
    const side = opts.side | 0;
    let all = legalMoves(side);
    if (opts.only && opts.only.length) all = all.filter(m => opts.only.some(a => same(m, a)));
    if (opts.exclude && opts.exclude.length) all = all.filter(m => !opts.exclude.some(a => same(m, a)));
    const res = { lines: [], depth: 0, nodes: 0, legal: all.length, inCheck: inCheck(side) };
    if (!all.length) return res;
    killers.fill(0); history.fill(0);
    const taken = [];
    for (let k = 0; k < multi; k++) {
      const moves = all.filter(m => !taken.includes(m)); if (!moves.length) break;
      const budget = (total - (now() - start)) / (multi - k);
      deadline = now() + Math.max(budget, 30); aborted = false;
      let best = null, depth = 0;
      for (let d = 1; d <= maxDepth; d++) {
        const t0 = now();
        load(opts.board); ply = 0;
        let r;
        try { r = root(side, d, moves); } catch (e) { if (e !== ABORT) throw e; break; }
        if (!r) break;
        best = r; depth = d;
        if (progress && k === 0) progress({ depth: d, score: r.score, pv: r.pv.map(dec), nodes });
        if (Math.abs(r.score) > WIN && d >= MATE - Math.abs(r.score) + 1) break; // đã thấy chiếu bí chắc chắn
        if (moves.length === 1 && d >= 2 && !opts.maxDepth) break;
        const used = now() - t0, left = deadline - now();
        if (left < used * 2.5) break; // không kịp xong độ sâu tiếp theo
      }
      if (!best) { // hết giờ ngay ở độ sâu 1: lấy nước đầu theo thứ tự sắp xếp
        load(opts.board); ply = 0;
        best = { move: moves[0], score: 0, pv: [moves[0]] }; depth = 0;
      }
      taken.push(best.move);
      res.lines.push({ move: dec(best.move), score: best.score, pv: best.pv.map(dec), depth });
      if (k === 0) res.depth = depth;
    }
    res.nodes = nodes; res.ms = Math.round(now() - start);
    return res;
  }

  // dùng cho kiểm thử: đếm số thế cờ ở độ sâu d
  function perft(board, side, d) {
    load(board); ply = 0;
    const go = (s, dd) => { if (!dd) return 1; let n = 0; for (const m of legalMoves(s)) { const q = make(m); n += go(s ^ 1, dd - 1); unmake(m, q); } return n; };
    return go(side, d);
  }

  host.analyze = analyze;
  host.perft = perft;
  host.MATE = MATE; host.WIN = WIN;
  if (typeof host.importScripts === 'function' && typeof host.postMessage === 'function') {
    host.onmessage = e => {
      const { id, opts } = e.data;
      try {
        const result = analyze(opts, info => host.postMessage({ id, type: 'progress', info }));
        host.postMessage({ id, type: 'done', result });
      } catch (err) { host.postMessage({ id, type: 'error', error: String(err && err.message || err) }); }
    };
  }
  return host;
}
