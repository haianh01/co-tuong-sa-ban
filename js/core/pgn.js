'use strict';
// Đọc và ghi PGN cờ tướng.
// Nhận nước đi dạng tọa độ ICCS (h2e2, H2-E2), ký hiệu Việt (X4.5, P2-5), WXF tiếng Anh (C2.5, H2+3, R1-1)
// và ký hiệu Trung Quốc (炮二平五, 马8进7, 前车进一). Lời bình {…} trở thành lời thoại trong kịch bản.
const PGN_VN = { r: 'X', h: 'M', e: 'T', a: 'S', k: 'Tg', c: 'P', p: 'B' };
const PGN_WXF_TYPE = { R: 'r', H: 'h', N: 'h', E: 'e', B: 'e', A: 'a', K: 'k', C: 'c', P: 'p' };
const PGN_CN_TYPE = { '車': 'r', '车': 'r', '俥': 'r', '馬': 'h', '马': 'h', '傌': 'h', '相': 'e', '象': 'e', '仕': 'a', '士': 'a',
  '帥': 'k', '帅': 'k', '將': 'k', '将': 'k', '炮': 'c', '砲': 'c', '包': 'c', '兵': 'p', '卒': 'p' };
const PGN_CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const PGN_CN_DIR = { '進': '.', '进': '.', '退': '/', '平': '-' };
const cnNum = ch => PGN_CN_NUM[ch] || (/[１-９]/.test(ch) ? ch.charCodeAt(0) - 0xFF10 : /[1-9]/.test(ch) ? +ch : 0);

// Đổi một nước đi ở mọi ký hiệu được hỗ trợ sang ký hiệu Việt (hoặc giữ nguyên tọa độ ICCS).
function pgnTokenToVN(tok, format) {
  const s = tok.replace(/[!?+#]+$/, '');
  if (/^[a-i]\d-?[a-i]\d$/i.test(s)) return s.toLowerCase().replace('-', '');
  // 炮二平五, 马8进7 (quân, cột, hướng, số) hoặc 前炮平五 (trước/sau, quân, hướng, số)
  const fr = s.match(/^([前後后])(.)(.)(.)$/);
  if (fr && PGN_CN_TYPE[fr[2]] && PGN_CN_DIR[fr[3]] && cnNum(fr[4]))
    return PGN_VN[PGN_CN_TYPE[fr[2]]] + (fr[1] === '前' ? 't' : 's') + PGN_CN_DIR[fr[3]] + cnNum(fr[4]);
  const cn = s.match(/^(.)(.)(.)(.)$/);
  if (cn && PGN_CN_TYPE[cn[1]] && cnNum(cn[2]) && PGN_CN_DIR[cn[3]] && cnNum(cn[4]))
    return PGN_VN[PGN_CN_TYPE[cn[1]]] + cnNum(cn[2]) + PGN_CN_DIR[cn[3]] + cnNum(cn[4]);
  if (format === 'wxf') {
    // C2.5  H2+3  R1-1  C+.5  +C.5
    const m = s.match(/^([+-])?([RHNEBAKCP])([1-9+-])([+\-.=])([1-9])$/i);
    if (m) {
      const type = PGN_WXF_TYPE[m[2].toUpperCase()];
      const file = m[1] ? (m[1] === '+' ? 't' : 's') : m[3] === '+' ? 't' : m[3] === '-' ? 's' : m[3];
      const dir = { '+': '.', '-': '/', '.': '-', '=': '-' }[m[4]];
      return PGN_VN[type] + file + dir + m[5];
    }
  }
  return s;
}
function pgnDetectFormat(headers, tokens) {
  const f = (headers.Format || '').toLowerCase();
  if (f.includes('wxf')) return 'wxf';
  if (f.includes('iccs')) return 'iccs';
  if (tokens.some(t => /^[+-]?[RHNEACK][1-9+-][+\-.=]\d/.test(t))) return 'wxf';
  return 'vn';
}

// Tách PGN thành tiêu đề, lời bình và các nước đi (bỏ qua nhánh biến trong ngoặc tròn).
function pgnTokenize(text) {
  const headers = {}, items = [];
  let body = text.replace(/^﻿/, '').replace(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm, (_, k, v) => { headers[k] = v.replace(/\\(.)/g, '$1'); return ''; });
  let i = 0, depth = 0, tok = '';
  const flush = () => {
    let t = tok.trim(); tok = ''; if (!t) return;
    t = t.replace(/^\d*\s*\.+/, ''); if (!t) return;
    if (/^(1-0|0-1|1\/2-1\/2|\*|\$\d+)$/.test(t)) return;
    if (depth === 0) items.push({ kind: 'move', raw: t });
  };
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{') {
      flush(); const j = body.indexOf('}', i); const c = body.slice(i + 1, j < 0 ? body.length : j);
      if (depth === 0) items.push({ kind: 'comment', text: c.replace(/\s+/g, ' ').trim() });
      i = j < 0 ? body.length : j + 1; continue;
    }
    if (ch === ';') { flush(); const j = body.indexOf('\n', i); i = j < 0 ? body.length : j + 1; continue; }
    if (ch === '(') { flush(); depth++; i++; continue; }
    if (ch === ')') { flush(); depth = Math.max(0, depth - 1); i++; continue; }
    if (/\s/.test(ch)) { flush(); i++; continue; }
    // số thứ tự dính liền nước đi: "1.h2e2"
    tok += ch; i++;
    if (/^\d+\.+$/.test(tok) && !/\d/.test(body[i] || '')) { tok = ''; }
  }
  flush();
  return { headers, items };
}

// PGN → { fen, title, script, moves, errors }
function pgnToScript(text) {
  const { headers, items } = pgnTokenize(text);
  const fen = (headers.FEN || '').trim() || START_FEN;
  const { B: B0, side: s0 } = parseFEN(fen);
  const format = pgnDetectFormat(headers, items.filter(x => x.kind === 'move').map(x => x.raw));
  const lines = [], errors = [];
  let B = B0, side = s0, n = 0, stopped = false;
  const clean = s => s.replace(/\|/g, '/');
  for (const it of items) {
    if (stopped) break;
    if (it.kind === 'comment') {
      if (!it.text) continue;
      const last = lines[lines.length - 1];
      if (last && last.move && !last.text) last.text = clean(it.text);
      else lines.push({ move: '', text: clean(it.text) });
      continue;
    }
    const vn = pgnTokenToVN(it.raw, format);
    let m;
    try { if (!vn) throw 'không đọc được ký hiệu'; m = resolve(B, side, vn); }
    catch (e) { errors.push(`Nước ${Math.floor(n / 2) + 1}${side === 'r' ? '' : '…'} “${it.raw}”: ${e}. Các nước sau bị bỏ qua.`); stopped = true; break; }
    let nota = toNotation(B, side, m);
    try { const back = resolve(B, side, nota); if (back[0] !== m[0] || back[1] !== m[1]) throw 0; } catch (e) { nota = pgnICCS(m); }
    lines.push({ move: nota, text: '' });
    B = apply(B, m); side = opp(side); n++;
  }
  const script = lines.map(l => l.move ? (l.text ? `${l.move} | ${l.text}` : l.move) : `| ${l.text}`).join('\n');
  const who = headers.Red && headers.Black ? `${headers.Red} – ${headers.Black}` : '';
  const title = headers.Title || headers.Event && headers.Event !== '?' && headers.Event || who || 'Ván cờ từ PGN';
  return { fen: fenIsStart(fen) ? START_FEN : fen, title, script, moves: n, errors, format };
}
const fenIsStart = f => f.split(/\s+/)[0] === START_FEN.split(' ')[0] && !/\sb\b/.test(f);
const pgnICCS = m => { const f = i => String.fromCharCode(97 + i % 9) + (9 - ((i / 9) | 0)); return f(m[0]) + f(m[1]); };

// Kịch bản → PGN (nước đi dạng ICCS, lời thoại thành lời bình).
function scriptToPGN(fen, title, script) {
  const { B: B0, side: s0 } = parseFEN(fen);
  let B = B0, side = s0, n = 0, out = '', errors = [];
  const q = s => s.replace(/[\\"]/g, '\\$&');
  const head = [['Game', 'Chinese Chess'], ['Event', title || '?'], ['Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.')], ['Red', '?'], ['Black', '?']];
  const body = [];
  const lines = script.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim(); if (!line || line.startsWith('//')) continue;
    const bar = line.indexOf('|'), mv = (bar < 0 ? line : line.slice(0, bar)).trim(), text = bar < 0 ? '' : line.slice(bar + 1).trim();
    if (mv) {
      let m;
      try { m = resolve(B, side, mv); } catch (e) { errors.push(`Dòng ${li + 1} (“${mv}”): ${e}`); break; }
      const no = Math.floor(n / 2) + 1;
      if (side === s0) body.push(`${no}.`); else if (n === 0) body.push(`${no}...`);
      body.push(pgnICCS(m));
      B = apply(B, m); side = opp(side); n++;
    }
    if (text) body.push(`{${text.replace(/[{}]/g, '')}}`);
  }
  let result = '*';
  if (!legal(B, side).length) result = side === 'r' ? '0-1' : '1-0';
  head.push(['Result', result]);
  if (!fenIsStart(fen)) head.push(['FEN', fen.trim().split(/\s+/).length > 1 ? fen.trim() : fen.trim() + ' w']);
  head.push(['Format', 'ICCS']);
  out = head.map(([k, v]) => `[${k} "${q(v)}"]`).join('\n') + '\n\n';
  // gói dòng ~80 ký tự
  let row = '';
  for (const tk of body.concat(result)) { if (row && row.length + tk.length + 1 > 80) { out += row + '\n'; row = ''; } row += (row ? ' ' : '') + tk; }
  out += row + '\n';
  return { pgn: out, errors, moves: n };
}
