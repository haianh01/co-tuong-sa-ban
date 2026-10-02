'use strict';
const CH = { r: { k: '帥', a: '仕', e: '相', h: '傌', r: '俥', c: '炮', p: '兵' }, b: { k: '將', a: '士', e: '象', h: '馬', r: '車', c: '砲', p: '卒' } };
const NAME = { k: 'Tướng', a: 'Sĩ', e: 'Tượng', h: 'Mã', r: 'Xe', c: 'Pháo', p: 'Tốt' };
const LETTER = { k: 'Tg', a: 'S', e: 'T', h: 'M', r: 'X', c: 'P', p: 'B' };
const FEN_MAP = { k: 'k', a: 'a', b: 'e', e: 'e', n: 'h', h: 'h', r: 'r', c: 'c', p: 'p' };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HORSE = [[1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1], [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]];
const onB = (c, r) => c >= 0 && c < 9 && r >= 0 && r < 10;
const inPal = (c, r, s) => c >= 3 && c <= 5 && (s === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
const opp = s => s === 'r' ? 'b' : 'r';

function parseFEN(fen) {
  const parts = fen.trim().split(/\s+/), rows = (parts[0] || '').split('/');
  if (rows.length !== 10) throw 'FEN cần đúng 10 hàng, ngăn cách bằng dấu /.';
  const B = new Array(90).fill(null); let n = 0;
  rows.forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { c += +ch; continue; }
      const t = FEN_MAP[ch.toLowerCase()];
      if (!t) throw `FEN có ký tự lạ “${ch}”.`;
      if (c > 8) throw `Hàng ${r + 1} của FEN dài quá 9 cột.`;
      B[r * 9 + c] = { id: 'q' + (n++), side: ch === ch.toUpperCase() ? 'r' : 'b', type: t }; c++;
    }
    if (c !== 9) throw `Hàng ${r + 1} của FEN có ${c} cột, cần đúng 9.`;
  });
  if (kingIdx(B, 'r') < 0 || kingIdx(B, 'b') < 0) throw 'FEN phải có đủ Tướng Đỏ và Tướng Đen.';
  return { B, side: (parts[1] || 'w').toLowerCase() === 'b' ? 'b' : 'r' };
}
// Ghi thế cờ ra FEN (Tượng ghi "b", Mã ghi "n" như Pikafish và các phần mềm khác).
const FEN_LETTER = { k: 'k', a: 'a', e: 'b', h: 'n', r: 'r', c: 'c', p: 'p' };
function toFEN(B, side) {
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
function pseudo(B, side) {
  const mv = [];
  for (let i = 0; i < 90; i++) {
    const p = B[i]; if (!p || p.side !== side) continue;
    const c = i % 9, r = (i / 9) | 0;
    const add = (cc, rr) => { if (!onB(cc, rr)) return; const q = B[rr * 9 + cc]; if (q && q.side === side) return; mv.push([i, rr * 9 + cc]); };
    if (p.type === 'r') {
      for (const [dc, dr] of DIRS) { let cc = c + dc, rr = r + dr; while (onB(cc, rr)) { const q = B[rr * 9 + cc]; if (q) { if (q.side !== side) mv.push([i, rr * 9 + cc]); break; } mv.push([i, rr * 9 + cc]); cc += dc; rr += dr; } }
    } else if (p.type === 'c') {
      for (const [dc, dr] of DIRS) { let cc = c + dc, rr = r + dr, jumped = false; while (onB(cc, rr)) { const q = B[rr * 9 + cc]; if (!jumped) { if (q) jumped = true; else mv.push([i, rr * 9 + cc]); } else if (q) { if (q.side !== side) mv.push([i, rr * 9 + cc]); break; } cc += dc; rr += dr; } }
    } else if (p.type === 'h') {
      for (const [dc, dr, lc, lr] of HORSE) if (onB(c + lc, r + lr) && !B[(r + lr) * 9 + c + lc]) add(c + dc, r + dr);
    } else if (p.type === 'e') {
      for (const [dc, dr] of DIAG) { const cc = c + 2 * dc, rr = r + 2 * dr; if (!onB(cc, rr) || (side === 'r' ? rr < 5 : rr > 4) || B[(r + dr) * 9 + c + dc]) continue; add(cc, rr); }
    } else if (p.type === 'a') {
      for (const [dc, dr] of DIAG) if (inPal(c + dc, r + dr, side)) add(c + dc, r + dr);
    } else if (p.type === 'k') {
      for (const [dc, dr] of DIRS) if (inPal(c + dc, r + dr, side)) add(c + dc, r + dr);
    } else if (p.type === 'p') {
      add(c, r + (side === 'r' ? -1 : 1));
      if (side === 'r' ? r <= 4 : r >= 5) { add(c - 1, r); add(c + 1, r); }
    }
  }
  return mv;
}
function kingIdx(B, s) { return B.findIndex(p => p && p.type === 'k' && p.side === s); }
function kingsFace(B) {
  const a = kingIdx(B, 'r'), b = kingIdx(B, 'b'); if (a < 0 || b < 0 || a % 9 !== b % 9) return false;
  for (let i = Math.min(a, b) + 9; i < Math.max(a, b); i += 9) if (B[i]) return false; return true;
}
function attackers(B, side) { const k = kingIdx(B, side); return pseudo(B, opp(side)).filter(m => m[1] === k).map(m => m[0]); }
function inCheck(B, side) { return kingsFace(B) || attackers(B, side).length > 0; }
function apply(B, m) { const N = B.slice(); N[m[1]] = N[m[0]]; N[m[0]] = null; return N; }
function legal(B, side) { return pseudo(B, side).filter(m => !inCheck(apply(B, m), side)); }
const fileOf = (side, c) => side === 'r' ? 9 - c : c + 1;
function describe(B, side, m) {
  const p = B[m[0]], fc = m[0] % 9, fr = (m[0] / 9) | 0, tc = m[1] % 9, tr = (m[1] / 9) | 0;
  const fwd = side === 'r' ? fr - tr : tr - fr, dir = fwd > 0 ? '.' : fwd < 0 ? '/' : '-';
  const straight = 'rcpk'.includes(p.type);
  return { type: p.type, file: fileOf(side, fc), dir, num: straight && dir !== '-' ? Math.abs(fwd) : fileOf(side, tc) };
}
function sameFile(B, side, type, col) { const o = []; for (let r = 0; r < 10; r++) { const q = B[r * 9 + col]; if (q && q.side === side && q.type === type) o.push(r); } return o; }
// Nhiều quân cùng loại trên một cột: 2 quân ghi t (trước) / s (sau), 3 quân ghi t / g (giữa) / s.
function frontTag(B, side, m) {
  const p = B[m[0]], same = sameFile(B, side, p.type, m[0] % 9); if (same.length < 2 || same.length > 3) return null;
  if (side === 'b') same.reverse(); // tính từ phía trước của bên đi (Đỏ tiến lên hàng nhỏ, Đen tiến xuống hàng lớn)
  return (same.length === 2 ? 'ts' : 'tgs')[same.indexOf((m[0] / 9) | 0)];
}
function toNotation(B, side, m) { const d = describe(B, side, m), tag = frontTag(B, side, m); return LETTER[d.type] + (tag || d.file) + d.dir + d.num; }
const TYPE_OF = { X: 'r', R: 'r', M: 'h', N: 'h', H: 'h', T: 'e', E: 'e', S: 'a', A: 'a', P: 'c', C: 'c', B: 'p', K: 'k' };
function resolve(B, side, raw) {
  const s = raw.trim().replace(/\s+/g, '').replace(/[+#!?]+$/, '');
  let m = s.match(/^([a-i])(\d)-?([a-i])(\d)$/i);
  if (m) {
    const from = (9 - +m[2]) * 9 + (m[1].toLowerCase().charCodeAt(0) - 97), to = (9 - +m[4]) * 9 + (m[3].toLowerCase().charCodeAt(0) - 97);
    const L = legal(B, side).find(x => x[0] === from && x[1] === to);
    if (!L) throw 'nước đi không hợp lệ ở thế cờ này'; return L;
  }
  m = s.match(/^(Tg|[XMNHTESAPCBK])([1-9]|[tgsTGS])([.\/\-+=])([1-9])$/i);
  if (!m) throw 'không đọc được ký hiệu (ví dụ đúng: X4.5, M2.3, P2-5)';
  const type = /^tg$/i.test(m[1]) ? 'k' : TYPE_OF[m[1].toUpperCase()];
  const fsel = m[2].toLowerCase(), dir = { '+': '.', '=': '-' }[m[3]] || m[3], num = +m[4];
  const cands = legal(B, side).filter(x => {
    if (B[x[0]].type !== type) return false;
    const d = describe(B, side, x); if (d.dir !== dir || d.num !== num) return false;
    if ('tgs'.includes(fsel)) return frontTag(B, side, x) === fsel;
    return d.file === +fsel;
  });
  if (!cands.length) {
    // Nói rõ lý do: không có quân đó, quân không ở cột đó, hay quân có nhưng không đi được.
    const name = `${NAME[type]} ${side === 'r' ? 'Đỏ' : 'Đen'}`, files = [];
    B.forEach((q, i) => { if (q && q.side === side && q.type === type && !files.includes(fileOf(side, i % 9))) files.push(fileOf(side, i % 9)); });
    if (!files.length) throw `trên bàn không còn ${name} nào`;
    if (/\d/.test(fsel) && !files.includes(+fsel)) throw `không có ${name} ở cột ${fsel} (${name} đang ở cột ${files.sort((a, b) => a - b).join(', ')})`;
    throw `${name} ở cột ${fsel} không đi được “${m[3]}${num}” (sai luật, bị quân khác cản, hoặc để Tướng bị chiếu)`;
  }
  return cands[0];
}
