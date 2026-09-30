'use strict';
// Dữ kiện "vì sao" cho một nước đi, đo bằng luật cờ (engine.js) và diễn biến của máy cờ, để lời bình
// dựa trên sự thật thay vì đoán:
//  - chuỗi diễn biến sau nước đã đi (đòn trừng phạt) và các lần ăn quân, cán cân vật chất;
//  - quân của bên vừa đi đang bị tấn công mà không có quân bảo vệ (quân treo);
//  - đe dọa mới mà nước đi tạo ra;
//  - so sánh vị trí giữa nước đã đi và nước máy chọn: số ô quân vừa đi kiểm soát, độ linh hoạt của
//    Xe / Mã, Mã bị cản chân, Xe bị quân mình chặn đường tiến, số quân chưa ra trận, số ô kiểm soát
//    bên sân đối phương.
// Mọi câu trả ra đều là số đo cụ thể; chọn lý do nào để giảng là việc của người viết lời bình.
const MoveFacts = (() => {
  const VAL = { k: 0, a: 2, e: 2, h: 4, r: 9, c: 4.5, p: 1 };
  const sideName = s => (s === 'r' ? 'Đỏ' : 'Đen');
  const crossed = (p, i) => p.type === 'p' && (p.side === 'r' ? ((i / 9) | 0) <= 4 : ((i / 9) | 0) >= 5);
  const value = (p, i) => (crossed(p, i) ? 2 : VAL[p.type]);
  const colOf = i => i % 9, rowOf = i => (i / 9) | 0;
  // "Pháo Đỏ cột 5" - cột theo cách đếm của bên sở hữu quân.
  const where = (p, i) => `${NAME[p.type]} ${sideName(p.side)} cột ${fileOf(p.side, colOf(i))}`;
  const fmtNum = v => String(Math.round(v * 10) / 10).replace('.', ',');
  function nota(B, side, m) {
    try { const n = toNotation(B, side, m), b = resolve(B, side, n); if (b[0] === m[0] && b[1] === m[1]) return n; } catch (e) { /* dùng tọa độ */ }
    const f = i => String.fromCharCode(97 + i % 9) + (9 - rowOf(i)); return f(m[0]) + f(m[1]);
  }

  // Quân của `side` (trừ Tướng) đang bị đối phương ăn được mà không có quân bảo vệ.
  function hanging(B, side) {
    const out = [], caps = legal(B, opp(side)).filter(m => B[m[1]] && B[m[1]].side === side && B[m[1]].type !== 'k');
    const seen = new Set();
    for (const m of caps) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      const target = B[m[1]];
      // Có quân bảo vệ = nếu đối phương ăn vào ô đó thì bên mình ăn lại được.
      const after = apply(B, m);
      const defended = pseudo(after, side).some(x => x[1] === m[1]);
      const attackerNames = [...new Set(caps.filter(x => x[1] === m[1]).map(x => NAME[B[x[0]].type]))];
      if (!defended) out.push({ sq: m[1], text: `${where(target, m[1])} bị ${attackerNames.join(', ')} ${sideName(opp(side))} tấn công mà không có quân bảo vệ`, value: value(target, m[1]) });
      else if (caps.some(x => x[1] === m[1] && value(B[x[0]], x[0]) < value(target, m[1]))) {
        const low = caps.filter(x => x[1] === m[1]).map(x => B[x[0]]).sort((a, b) => VAL[a.type] - VAL[b.type])[0];
        out.push({ sq: m[1], text: `${where(target, m[1])} bị ${NAME[low.type]} ${sideName(low.side)} tấn công, dù có quân bảo vệ vẫn thiệt vì ${NAME[low.type]} rẻ hơn`, value: value(target, m[1]) - VAL[low.type] });
      }
    }
    return out.sort((a, b) => b.value - a.value);
  }

  // Quân đối phương mà `side` ăn được (có lời): chưa bảo vệ, hoặc đáng giá hơn quân ăn.
  function targets(B, side) {
    const out = new Map();
    for (const m of pseudo(B, side)) {
      const t = B[m[1]]; if (!t || t.side === side || t.type === 'k') continue;
      const after = apply(B, m); if (inCheck(after, side)) continue;
      const defended = pseudo(after, opp(side)).some(x => x[1] === m[1]);
      const gain = defended ? value(t, m[1]) - value(B[m[0]], m[0]) : value(t, m[1]);
      if (gain > 0 && (!out.has(m[1]) || out.get(m[1]).gain < gain)) out.set(m[1], { sq: m[1], gain, text: `${where(t, m[1])}${defended ? '' : ' đang không có quân bảo vệ'}` });
    }
    return out;
  }
  // Đe dọa mới: quân đối phương bên vừa đi ăn được có lời sau nước đi mà trước đó chưa ăn được.
  function newThreats(B, side, m) {
    const before = targets(B, side), after = targets(apply(B, m), side);
    const res = [];
    for (const [sq, t] of after) if (!before.has(sq) && sq !== m[1]) res.push(t);
    return res.sort((a, b) => b.gain - a.gain).map(t => t.text);
  }

  // Đi theo chuỗi nước (bắt đầu từ B, lượt side), ghi các lần ăn quân và cán cân vật chất.
  function material(B, side, line, max) {
    const caps = []; let b = B, s = side, bal = { r: 0, b: 0 }, n = 0;
    for (const m of line.slice(0, max)) {
      const p = b[m[0]], t = b[m[1]];
      if (!p || p.side !== s) break;
      const txt = nota(b, s, m);
      if (t) { caps.push(`${txt}: ${sideName(s)} ăn ${NAME[t.type]} ${sideName(t.side)}`); bal[t.side] += value(t, m[1]); }
      b = apply(b, m); s = opp(s); n++;
      if (!legal(b, s).length) { caps.push(`${txt}: ${sideName(opp(s))} chiếu bí`); break; }
    }
    const net = bal.b - bal.r; // dương: Đỏ lời
    const summary = !caps.length ? 'không bên nào mất quân' : Math.abs(net) < 0.5 ? 'hai bên đổi quân ngang nhau'
      : `${net > 0 ? 'Đỏ' : 'Đen'} lời khoảng ${fmtNum(Math.abs(net))} Tốt`;
    return { caps, summary, plies: n };
  }

  // ---------- đặc điểm vị trí ----------
  function horseBlocked(B, i) {
    const c = colOf(i), r = rowOf(i); let n = 0;
    for (const [dc, dr, lc, lr] of HORSE) if (onB(c + dc, r + dr) && B[(r + lr) * 9 + c + lc]) n++;
    return n;
  }
  // Số ô trống Xe tiến thẳng được về phía đối phương, và quân đầu tiên chặn đường (nếu là quân mình).
  function rookForward(B, i) {
    const p = B[i], c = colOf(i), dir = p.side === 'r' ? -1 : 1; let r = rowOf(i) + dir, n = 0;
    while (r >= 0 && r <= 9 && !B[r * 9 + c]) { n++; r += dir; }
    const block = r >= 0 && r <= 9 ? B[r * 9 + c] : null;
    return { n, ownBlock: block && block.side === p.side ? block : null };
  }
  function features(B, side) {
    const moves = pseudo(B, side), pieces = {};
    for (let i = 0; i < 90; i++) {
      const p = B[i]; if (!p || p.side !== side) continue;
      pieces[p.id] = { p, i, mob: moves.filter(m => m[0] === i).length, legs: p.type === 'h' ? horseBlocked(B, i) : 0, fwd: p.type === 'r' ? rookForward(B, i) : null };
    }
    const home = side === 'r' ? 9 : 0;
    const idle = Object.values(pieces).filter(x => (x.p.type === 'r' || x.p.type === 'h') && rowOf(x.i) === home).length;
    const enemyHalf = new Set(moves.map(m => m[1]).filter(t => (side === 'r' ? rowOf(t) <= 4 : rowOf(t) >= 5))).size;
    return { pieces, total: moves.length, idle, enemyHalf };
  }
  // So sánh sau nước đã đi và sau nước máy chọn. Chỉ giữ khác biệt đáng kể mà nước đã đi KÉM hơn
  // (cùng chiều với đánh giá của máy cờ); số đo nghiêng về nước đã đi dễ làm lời bình hiểu sai nên bỏ.
  function compare(B, side, played, best, max = 5) {
    const A = apply(B, played), C = apply(B, best), fa = features(A, side), fc = features(C, side);
    const bn = nota(B, side, best), items = [];
    const push = (weight, text) => items.push({ weight, text });
    const mp = B[played[0]], mb = B[best[0]];
    const pa = fa.pieces[mp.id], pc = fc.pieces[mb.id];
    if (pa && pc && mp.type === mb.type && pa.mob < pc.mob) push(3 + pc.mob - pa.mob, `${NAME[mp.type]} vừa đi chỉ kiểm soát ${pa.mob} ô, trong khi đi ${bn} thì ${NAME[mb.type]} kiểm soát ${pc.mob} ô`);
    for (const id of Object.keys(fa.pieces)) {
      const a = fa.pieces[id], c = fc.pieces[id]; if (!c || !['r', 'h'].includes(a.p.type)) continue;
      if (a.p.type === 'h' && a.legs > c.legs) push(2 + a.legs - c.legs, `${where(a.p, a.i)} bị cản chân ở ${a.legs} hướng, đi ${bn} thì chỉ ${c.legs} hướng`);
      if (a.p.type === 'r') {
        if (a.fwd.ownBlock && (!c.fwd.ownBlock || a.fwd.n < c.fwd.n)) push(3, `${where(a.p, a.i)} bị chính ${NAME[a.fwd.ownBlock.type]} phe mình chặn đường tiến, chỉ tiến được ${a.fwd.n} ô, đi ${bn} thì tiến được ${c.fwd.n} ô`);
        else if (c.mob - a.mob >= 2) push(1 + (c.mob - a.mob) / 2, `${where(a.p, a.i)} chỉ đi được ${a.mob} ô, đi ${bn} thì được ${c.mob} ô`);
      }
    }
    if (fa.idle > fc.idle) push(2, `Còn ${fa.idle} quân Xe, Mã chưa ra trận, đi ${bn} thì chỉ còn ${fc.idle}`);
    if (fc.total - fa.total >= 3) push(1 + (fc.total - fa.total) / 4, `Quân ${sideName(side)} kém linh hoạt hơn: tổng cộng ${fa.total} nước có thể đi, đi ${bn} thì ${fc.total} nước`);
    if (fc.enemyHalf - fa.enemyHalf >= 2) push(1 + (fc.enemyHalf - fa.enemyHalf) / 3, `${sideName(side)} kiểm soát ${fa.enemyHalf} ô bên sân ${sideName(opp(side))}, đi ${bn} thì ${fc.enemyHalf} ô`);
    return items.sort((a, b) => b.weight - a.weight).slice(0, max).map(x => x.text);
  }

  // Giá trị quy đổi dùng cho "lời khoảng … Tốt": Xe 9, Pháo 4,5, Mã 4, Sĩ/Tượng 2, Tốt 1, Tốt qua sông 2.
  // Toàn bộ dữ kiện "vì sao" cho một nước.
  //   B, side: thế cờ trước nước; played: nước đã đi; playedPv: diễn biến máy tính cho nước đã đi
  //   (bắt đầu bằng chính nước đó); best, bestPv: nước máy chọn và diễn biến của nó.
  function forMove(B, side, played, playedPv, best, bestPv) {
    const A = apply(B, played), same = best && best[0] === played[0] && best[1] === played[1];
    const line = playedPv && playedPv.length && playedPv[0][0] === played[0] && playedPv[0][1] === played[1] ? playedPv : [played];
    const reply = line[1] ? nota(A, opp(side), line[1]) : null;
    const replyLine = [];
    { let b = A, s = opp(side); for (const m of line.slice(1, 7)) { if (!b[m[0]] || b[m[0]].side !== s) break; replyLine.push(nota(b, s, m)); b = apply(b, m); s = opp(s); } }
    const mat = material(B, side, line, 7);
    const facts = {
      nuoc_dap_tot_nhat_cua_doi_phuong: reply,
      dien_bien_sau_nuoc_da_di: replyLine.join(' ') || null,
      an_quan_trong_dien_bien: mat.caps,
      can_bang_vat_chat_sau_dien_bien: mat.summary,
      quan_bi_treo_sau_nuoc: hanging(A, side).map(h => h.text).slice(0, 3),
      de_doa_moi: newThreats(B, side, played).slice(0, 3)
    };
    if (best && !same) {
      facts.so_sanh_vi_tri_voi_nuoc_may_chon = compare(B, side, played, best);
      facts.vat_chat_neu_di_nuoc_may_chon = material(B, side, bestPv && bestPv.length ? bestPv : [best], 7).summary;
    }
    return facts;
  }
  // Mọi ký hiệu nước đi xuất hiện trong dữ kiện (để kiểm tra lời bình không nhắc nước lạ).
  function notations(B, side, pv, max = 7) {
    const o = []; let b = B, s = side;
    for (const m of (pv || []).slice(0, max)) { if (!b[m[0]] || b[m[0]].side !== s) break; o.push(nota(b, s, m)); b = apply(b, m); s = opp(s); }
    return o;
  }
  return { forMove, notations, hanging, compare, material };
})();
