'use strict';
// Lời thoại bằng Claude: sau khi "Kiểm duyệt kịch bản", gửi dữ kiện của máy cờ (nước đi, điểm trước/sau,
// nước máy chọn và diễn biến, ăn quân, chiếu) cho Claude để viết lời thoại tự nhiên cho từng nước.
// Người dùng sửa, chọn dòng muốn dùng rồi mới chèn vào kịch bản.
// - Gọi API bằng thư viện chính thức @anthropic-ai/sdk (vendor/anthropic-sdk.js, nạp khi cần).
// - Khóa API do người dùng nhập, chỉ gửi tới api.anthropic.com; chỉ lưu vào localStorage khi họ chọn "Nhớ khóa".
// - Mọi ký hiệu nước đi Claude viết ra được đối chiếu với dữ kiện của máy cờ; nước lạ bị đánh dấu để người dùng xem lại.
(() => {
  const box = $('cmBox'), keyIn = $('cmKey'), remember = $('cmRemember'), modelSel = $('cmModel'), styleSel = $('cmStyle');
  const notesIn = $('cmNotes'), goBtn = $('cmGo'), stopBtn = $('cmStop'), statusEl = $('cmStatus'), out = $('cmOut');
  const KEY_STORE = 'coTuongAnthropicKey';
  let data = null, stream = null, result = null;
  const say = (msg, isErr) => { statusEl.textContent = msg; statusEl.classList.toggle('err', !!isErr); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  try { const k = localStorage.getItem(KEY_STORE); if (k) { keyIn.value = k; remember.checked = true; } } catch (e) { /* bỏ qua */ }

  function loadSdk() {
    if (window.Anthropic) return Promise.resolve(window.Anthropic);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/anthropic-sdk.js';
      s.onload = () => (window.Anthropic ? res(window.Anthropic) : rej(new Error('vendor/anthropic-sdk.js không hợp lệ.')));
      s.onerror = () => rej(new Error('Không nạp được vendor/anthropic-sdk.js. Hãy chạy tools/vendor-anthropic-sdk.sh để tạo file này.'));
      document.head.appendChild(s);
    });
  }

  // ---------- dữ kiện gửi cho Claude ----------
  const STYLE = {
    lesson: 'Giọng thầy giảng bài cho người mới và trung cấp: giải thích ý đồ, vì sao nước đó hay hoặc dở, nhắc bài học rút ra.',
    match: 'Giọng bình luận viên tường thuật trận đấu: sinh động, có nhịp, nêu diễn biến và cục diện.',
    short: 'Rất ngắn gọn: mỗi nước tối đa một câu, chỉ nói điều quan trọng nhất.'
  };
  const SYSTEM = `Bạn là bình luận viên cờ tướng, viết lời thoại tiếng Việt để đọc thành giọng nói trong video bài giảng.
Dữ kiện về từng nước do máy cờ cung cấp và là sự thật; bạn chỉ diễn giải chúng thành lời.

Quy tắc:
- Chỉ dùng dữ kiện được cung cấp. Không tự nghĩ ra nước đi, biến thế hay quân cờ không có trong dữ kiện. Khi nhắc tới một nước, viết đúng ký hiệu có trong dữ kiện (ví dụ P2-5, M8.7).
- Mỗi nước 1 đến 2 câu, tối đa khoảng 35 chữ, là câu nói tự nhiên để đọc to: không markdown, không gạch đầu dòng, không emoji, không viết điểm số dạng "+0,3" mà nói thành lời (ví dụ "Đỏ hơi ưu thế", "Đen hơn hẳn").
- Nước bị máy đánh giá là chưa chính xác, sai lầm hay sai lầm nghiêm trọng: nói vì sao và nêu nước tốt hơn máy chọn. Lý do lấy theo thứ tự ưu tiên:
  1. "quan_bi_treo_sau_nuoc" và "nuoc_dap_tot_nhat_cua_doi_phuong" / "an_quan_trong_dien_bien" / "can_bang_vat_chat_sau_dien_bien": đòn trừng phạt cụ thể (mất quân, bị chiếu bí). Nếu có mất quân thì đây là lý do chính.
  2. "so_sanh_vi_tri_voi_nuoc_may_chon": số đo vị trí mà nước đã đi kém hơn nước máy chọn (quân kiểm soát ít ô hơn, Mã bị cản chân, Xe bị quân mình chặn, quân chậm ra trận…). Dùng khi không mất quân: diễn giải thành nguyên tắc chơi cờ, nói kiểu "thường thì…", không tuyệt đối hóa.
  3. Nếu không có dữ kiện nào rõ ràng, chỉ nói máy đánh giá nước khác tốt hơn, không tự nghĩ ra lý do.
- "dien_bien_sau_nuoc_da_di" là các nước máy dự đoán sẽ xảy ra sau nước đã đi; "de_doa_moi" là quân đối phương mà nước đi mới đe dọa ăn được.
- "fen_truoc_nuoc" là thế cờ ngay trước nước đó: khi cần biết quân nào đứng ở đâu thì đọc từ đây, không tự hình dung.
- "cac_phuong_an_cua_may" (chỉ có ở nước đáng xem lại) là 3 phương án tốt nhất máy tìm được kèm điểm và diễn biến; dùng để so sánh khi nói vì sao nước đã đi kém hơn.
- Chỉ giải thích ý đồ của 2 đến 3 nước đầu trong một diễn biến; các nước xa hơn là máy đi tiếp cho hết, không suy diễn mục đích của chúng.
- Không nhắc số đo khô khan (ví dụ "kiểm soát 2 ô") trừ khi giúp người nghe hiểu; nói thành ý nghĩa ("Mã ra biên nên ít đường đi").
- Nước tốt nhất hoặc nước tốt: nói ngắn ý đồ của nước đó; không cần khen mọi nước.
- Nếu có lời thoại người dùng đã viết cho nước đó, giữ ý và phong cách của họ, chỉ làm rõ và tự nhiên hơn.
- Nếu có tài liệu tham khảo của người dùng, dùng thuật ngữ và bài học trong đó khi thật sự liên quan.
- Phần intro: 1 đến 2 câu mở đầu giới thiệu ván cờ hoặc chủ đề bài giảng.
Ký hiệu: X Xe, M Mã, T Tượng, S Sĩ, Tg Tướng, P Pháo, B Tốt; dấu "." là tiến, "/" là thoái, "-" là bình.
Cán cân vật chất quy đổi theo giá trị quân: Xe 9, Pháo 4,5, Mã 4, Sĩ/Tượng 2, Tốt 1, Tốt qua sông 2 (tính bằng số Tốt).`;
  const SCHEMA = {
    type: 'object',
    properties: {
      intro: { type: 'string' },
      lines: { type: 'array', items: { type: 'object', properties: { ply: { type: 'integer' }, text: { type: 'string' } }, required: ['ply', 'text'], additionalProperties: false } }
    },
    required: ['intro', 'lines'],
    additionalProperties: false
  };
  const fmtScore = red => (Math.abs(red) > 29500 ? `${red > 0 ? 'Đỏ' : 'Đen'} chiếu bí sau ${Math.ceil((30000 - Math.abs(red)) / 2)} nước`
    : ((v => (v > 0 ? '+' : v < 0 ? '−' : '') + (Math.abs(v) / 10).toFixed(1).replace('.', ','))(Math.round(red / 10))));
  const sideName = s => (s === 'r' ? 'Đỏ' : 'Đen');
  const notaOf = (B, side, m) => { try { const n = toNotation(B, side, m); const b = resolve(B, side, n); return b[0] === m[0] && b[1] === m[1] ? n : pgnICCS(m); } catch (e) { return pgnICCS(m); } };
  function pvNotas(B, side, pv, max) {
    const o = []; let b = B, s = side;
    try { for (const m of (pv || []).slice(0, max)) { o.push(notaOf(b, s, m)); b = apply(b, m); s = opp(s); } } catch (e) { /* dừng ở nước lạ */ }
    return o;
  }
  const toRed = (sc, side) => (side === 'r' ? sc : -sc);
  // Sơ đồ bàn cờ dạng chữ để Claude đọc vị trí quân chính xác: hàng trên là phía Đen, chữ hoa là quân Đỏ.
  function boardText(B) {
    const L = { k: 'Tg', a: 'S', e: 'T', h: 'M', r: 'X', c: 'P', p: 'B' }, cols = f => f.map(n => String(n).padStart(3)).join('');
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let row = '';
      for (let c = 0; c < 9; c++) { const q = B[r * 9 + c]; row += (q ? (q.side === 'r' ? L[q.type].toUpperCase() : L[q.type].toLowerCase()) : '.').padStart(3); }
      rows.push('     ' + row);
      if (r === 4) rows.push('     ' + '~'.repeat(27) + '  (sông)');
    }
    return ['Đen: ' + cols([1, 2, 3, 4, 5, 6, 7, 8, 9]), ...rows, 'Đỏ:  ' + cols([9, 8, 7, 6, 5, 4, 3, 2, 1])].join('\n');
  }
  function narrationOf(line) { const i = line.indexOf('|'); return i < 0 ? '' : line.slice(i + 1).trim(); }

  function buildFacts() {
    const lines = scriptIn.value.split('\n'), s0 = data.s0;
    return data.plies.slice().sort((a, b) => a.idx - b.idx).map(p => {
      const after = apply(p.B, p.m), cap = p.B[p.m[1]];
      const bestPv = pvNotas(p.B, p.side, p.bestPv, 6);
      return {
        ply: p.idx, nuoc: `${p.no}${p.side === s0 ? '.' : '…'}`, ben_di: sideName(p.side), ky_hieu: p.nota, fen_truoc_nuoc: toFEN(p.B, p.side),
        danh_gia_cua_may: p.cls.label,
        diem_truoc_nuoc: fmtScore(toRed(p.best, p.side)), diem_sau_nuoc: fmtScore(toRed(p.played, p.side)),
        may_chon: bestPv[0] || null, dien_bien_may_chon: bestPv.join(' '),
        an_quan: cap ? `${NAME[cap.type]} ${sideName(cap.side)}` : null,
        chieu_tuong: inCheck(after, opp(p.side)), chieu_bi: !!p.mates,
        loi_thoai_hien_co: narrationOf(lines[p.line] || '') || null,
        ...MoveFacts.forMove(p.B, p.side, p.m, p.playedPv, p.bestMove, p.bestPv),
        ...(p.alts ? { cac_phuong_an_cua_may: p.alts.map(a => ({ nuoc: notaOf(p.B, p.side, a.move), diem_sau_nuoc: fmtScore(toRed(a.score, p.side)), dien_bien: pvNotas(p.B, p.side, a.pv, 5).join(' ') })) } : {})
      };
    });
  }
  function buildPrompt(facts) {
    const intro = scriptIn.value.split('\n').filter(l => l.trim().startsWith('|')).slice(0, 3).map(l => l.trim().slice(1).trim()).join(' ');
    return [
      `Tiêu đề video: ${titleIn.value.trim() || '(chưa đặt)'}`,
      `Thế cờ ban đầu (FEN): ${fenIn.value.trim()}`,
      `Phong cách: ${STYLE[styleSel.value]}`,
      'Điểm tính theo phía Đỏ: dương là Đỏ ưu, âm là Đen ưu, 1,0 tương đương một Tốt.',
      intro ? `Lời dẫn người dùng đã viết: ${intro}` : '',
      `Các nước và kết quả phân tích của máy cờ (JSON):\n${JSON.stringify(facts, null, 1)}`,
      notesIn.value.trim() ? `Tài liệu tham khảo của người dùng:\n${notesIn.value.trim()}` : '',
      'Viết intro và lời thoại cho từng nước trong danh sách (trường "ply" giữ nguyên như dữ kiện).'
    ].filter(Boolean).join('\n\n');
  }

  // ---------- phân tích một thế cờ (từ "Gợi ý nước đi") ----------
  const SYSTEM_POS = `Bạn là huấn luyện viên cờ tướng, phân tích thế cờ bằng tiếng Việt cho người học.
Dữ kiện do máy cờ tính và là sự thật; bạn diễn giải chúng, không tự tính thêm biến mới.

Quy tắc:
- Đọc vị trí quân từ sơ đồ bàn cờ và FEN được cung cấp, không tự hình dung. Chỉ nhắc nước đi có trong dữ kiện và viết đúng ký hiệu (ví dụ X2.4, P8-9).
- Với mỗi phương án, giải thích ý đồ của 2 đến 3 nước đầu trong diễn biến: đe dọa gì, mở đường cho quân nào, ăn quân gì. Các nước xa hơn chỉ là máy đi tiếp, không suy diễn mục đích của chúng.
- Phương án 1 là nước máy chọn. Nói vì sao phương án 2 và 3 kém hơn dựa trên chênh lệch điểm và dữ kiện: quân bị treo, nước đáp tốt nhất của đối phương, ăn quân trong diễn biến, cán cân vật chất, so sánh vị trí với nước máy chọn. Nếu điểm chênh dưới khoảng 0,3 thì nói các phương án gần tương đương, không bịa lý do.
- Dữ kiện không đủ để kết luận thì nói rõ là không chắc.
- Viết ngắn gọn bằng văn bản thường, không dùng bảng, theo ba phần có tiêu đề: Nhận định chung; Các phương án; Kết luận.
- Nếu có tài liệu tham khảo của người dùng, dùng thuật ngữ và bài học trong đó khi thật sự liên quan.
Ký hiệu: X Xe, M Mã, T Tượng, S Sĩ, Tg Tướng, P Pháo, B Tốt; dấu "." là tiến, "/" là thoái, "-" là bình. Cột của Đỏ đánh số 9 đến 1 từ trái sang phải (nhìn từ phía Đỏ), cột của Đen đánh số 1 đến 9 từ trái sang phải trên sơ đồ.
Cán cân vật chất quy đổi theo giá trị quân: Xe 9, Pháo 4,5, Mã 4, Sĩ/Tượng 2, Tốt 1, Tốt qua sông 2 (tính bằng số Tốt).`;
  let task = 'script', pos = null;
  function positionData(p) {
    const { B, side, lines } = p, best = lines[0];
    return {
      fen: toFEN(B, side), ben_di: sideName(side), dang_bi_chieu: inCheck(B, side),
      may_co: p.engine === 'pikafish' ? 'Pikafish' : 'máy có sẵn của trang', do_sau: p.depth,
      cac_phuong_an: lines.map((l, i) => ({
        thu_tu: i + 1, nuoc: notaOf(B, side, l.move), diem_sau_nuoc: fmtScore(toRed(l.score, side)),
        dien_bien: pvNotas(B, side, l.pv, 6).join(' '), fen_sau_nuoc: toFEN(apply(B, l.move), opp(side)),
        ...MoveFacts.forMove(B, side, l.move, l.pv, i ? best.move : null, i ? best.pv : null)
      }))
    };
  }
  function positionPrompt(p) {
    return [
      `Hãy phân tích thế cờ sau, ${sideName(p.side)} đi.`,
      `Sơ đồ bàn cờ (hàng trên cùng là phía Đen; chữ hoa là quân Đỏ, chữ thường là quân Đen, dấu chấm là ô trống):\n${boardText(p.B)}`,
      'Điểm tính theo phía Đỏ: dương là Đỏ ưu, âm là Đen ưu, 1,0 tương đương một Tốt.',
      `Kết quả tính của máy cờ, gồm ${p.lines.length} phương án tốt nhất (JSON):\n${JSON.stringify(positionData(p), null, 1)}`,
      notesIn.value.trim() ? `Tài liệu tham khảo của người dùng:\n${notesIn.value.trim()}` : ''
    ].filter(Boolean).join('\n\n');
  }
  const posAllowed = p => { const a = new Set(); for (const l of p.lines) pvNotas(p.B, p.side, l.pv, 7).forEach(n => a.add(n)); return a; };
  function showAnalysis(text, done) {
    const warn = done ? unknownMoves(text, posAllowed(pos)) : [];
    out.innerHTML = `<div class="cm-analysis">${esc(text)}</div>` +
      (warn.length ? `<p class="cm-warn">Nhắc tới nước không có trong phân tích của máy: ${esc(warn.join(', '))}. Hãy kiểm tra lại.</p>` : '');
  }
  async function runPosition(Anthropic, apiKey) {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    goBtn.disabled = true; stopBtn.hidden = false; out.innerHTML = '';
    say('Đang gửi thế cờ cho Claude…');
    let text = '';
    try {
      stream = client.beta.messages.stream({
        model: modelSel.value, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM_POS,
        messages: [{ role: 'user', content: positionPrompt(pos) }]
      });
      stream.on('text', d => { text += d; showAnalysis(text, false); say('Claude đang phân tích…'); });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') { say('Claude từ chối yêu cầu này. Hãy thử lại.', true); return; }
      text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      showAnalysis(text, true);
      const u = msg.usage || {};
      say(`Xong${msg.stop_reason === 'max_tokens' ? ' (bị cắt vì quá dài)' : ''}. ${msg.model} dùng ${(u.input_tokens || 0).toLocaleString('vi-VN')} token đầu vào, ${(u.output_tokens || 0).toLocaleString('vi-VN')} token đầu ra.`);
    } catch (e) { apiError(e, Anthropic); } finally { stream = null; goBtn.disabled = false; stopBtn.hidden = true; }
  }

  // Ký hiệu nước đi trong câu Claude viết mà không có trong dữ kiện của máy cờ.
  const MOVE_RE = /(?:^|[^\p{L}\p{N}])((?:Tg|[XMTSPB])[1-9ts][.\/\-][1-9]|[a-i][0-9][a-i][0-9])(?![\p{L}\p{N}])/gu;
  function unknownMoves(text, allowed) {
    const bad = []; let m;
    MOVE_RE.lastIndex = 0;
    while ((m = MOVE_RE.exec(text))) if (!allowed.has(m[1]) && !bad.includes(m[1])) bad.push(m[1]);
    return bad;
  }

  // ---------- gọi Claude ----------
  async function run() {
    if (task === 'script' && (!data || data.snapshot !== fenIn.value + '\n' + scriptIn.value)) { say('Kịch bản đã thay đổi sau khi kiểm duyệt. Hãy bấm “Kiểm duyệt kịch bản” lại trước.', true); return; }
    const apiKey = keyIn.value.trim();
    if (!apiKey) { say('Hãy nhập khóa API Anthropic (lấy ở console.anthropic.com).', true); keyIn.focus(); return; }
    try { if (remember.checked) localStorage.setItem(KEY_STORE, apiKey); else localStorage.removeItem(KEY_STORE); } catch (e) { /* bỏ qua */ }
    let Anthropic;
    try { Anthropic = await loadSdk(); } catch (e) { say(e.message, true); return; }
    if (task === 'position') return runPosition(Anthropic, apiKey);
    const facts = buildFacts();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    goBtn.disabled = true; stopBtn.hidden = false; out.innerHTML = ''; result = null;
    say(`Đang gửi ${facts.length} nước cho Claude…`);
    let chars = 0;
    try {
      stream = client.beta.messages.stream({
        model: modelSel.value,
        max_tokens: 32000,
        // Lớp an toàn của Claude có thể từ chối nhầm; "default" để máy chủ tự chuyển sang model dự phòng phù hợp.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(facts) }]
      });
      stream.on('text', d => { chars += d.length; say(`Claude đang viết… ${chars.toLocaleString('vi-VN')} ký tự`); });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') { say('Claude từ chối yêu cầu này. Hãy thử lại hoặc bớt tài liệu tham khảo.', true); return; }
      if (msg.stop_reason === 'max_tokens') { say('Kịch bản quá dài, Claude viết chưa hết. Hãy kiểm duyệt một đoạn ngắn hơn.', true); return; }
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { say('Không đọc được kết quả Claude trả về. Hãy thử lại.', true); return; }
      result = { parsed, facts };
      render();
      const u = msg.usage || {};
      say(`Xong. ${msg.model} dùng ${(u.input_tokens || 0).toLocaleString('vi-VN')} token đầu vào, ${(u.output_tokens || 0).toLocaleString('vi-VN')} token đầu ra. Sửa nếu cần rồi bấm “Chèn vào kịch bản”.`);
    } catch (e) { apiError(e, Anthropic); } finally { stream = null; goBtn.disabled = false; stopBtn.hidden = true; }
  }
  function apiError(e, Anthropic) {
    if (e instanceof Anthropic.APIUserAbortError) say('Đã dừng.');
    else if (e instanceof Anthropic.AuthenticationError) say('Khóa API không đúng hoặc đã bị thu hồi.', true);
    else if (e instanceof Anthropic.PermissionDeniedError) say('Khóa API không có quyền dùng model này.', true);
    else if (e instanceof Anthropic.RateLimitError) say('Đang gửi quá nhiều yêu cầu hoặc hết hạn mức. Hãy thử lại sau ít phút.', true);
    else if (e instanceof Anthropic.BadRequestError) say(`Yêu cầu không hợp lệ: ${e.message}`, true);
    else if (e instanceof Anthropic.APIConnectionError) say('Không kết nối được tới Claude. Hãy kiểm tra mạng.', true);
    else if (e instanceof Anthropic.APIError) say(`Lỗi từ Claude (${e.status}): ${e.message}`, true);
    else say(`Lỗi: ${e.message || e}`, true);
  }

  // ---------- dùng gói Claude qua claude.ai (sao chép – dán) ----------
  const chatTools = $('cmChatTools'), apiTools = $('cmApiTools'), pasteIn = $('cmPaste'), promptOut = $('cmPrompt'), copyInfo = $('cmCopyInfo');
  const MODE_STORE = 'coTuongClaudeMode';
  let chatFacts = null;
  function setMode(m) {
    chatTools.hidden = m !== 'chat'; apiTools.hidden = m !== 'api';
    $('cmModeChat').setAttribute('aria-pressed', String(m === 'chat')); $('cmModeApi').setAttribute('aria-pressed', String(m === 'api'));
    try { localStorage.setItem(MODE_STORE, m); } catch (e) { /* bỏ qua */ }
  }
  let savedMode = null; try { savedMode = localStorage.getItem(MODE_STORE); } catch (e) { /* bỏ qua */ }
  setMode(savedMode || (keyIn.value ? 'api' : 'chat'));
  $('cmModeChat').onclick = () => setMode('chat');
  $('cmModeApi').onclick = () => setMode('api');
  const fresh = () => data && data.snapshot === fenIn.value + '\n' + scriptIn.value;
  function chatPrompt(facts) {
    return `${SYSTEM}\n\n${buildPrompt(facts)}\n\nChỉ trả lời bằng đúng một khối JSON, không viết thêm gì khác, theo dạng:\n` +
      '{"intro": "lời mở đầu", "lines": [{"ply": <giữ nguyên số "ply" trong dữ kiện>, "text": "lời thoại cho nước đó"}]}';
  }
  async function copyPrompt() {
    let text;
    if (task === 'position') text = `${SYSTEM_POS}\n\n${positionPrompt(pos)}`;
    else {
      if (!fresh()) { say('Kịch bản đã thay đổi sau khi kiểm duyệt. Hãy bấm “Kiểm duyệt kịch bản” lại trước.', true); return; }
      chatFacts = buildFacts(); text = chatPrompt(chatFacts);
    }
    promptOut.value = text;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      // Trình duyệt chặn clipboard API (ví dụ khi mở file trực tiếp): chọn chữ rồi sao chép kiểu cũ.
      const det = promptOut.closest('details'); det.open = true; promptOut.focus(); promptOut.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    }
    const what = task === 'position' ? `yêu cầu phân tích thế cờ (${pos.lines.length} phương án)` : `yêu cầu cho ${chatFacts.length} nước`;
    copyInfo.textContent = ok ? `Đã sao chép ${what}, ${text.length.toLocaleString('vi-VN')} ký tự.`
      : 'Chưa sao chép tự động được: hãy mở “Xem nội dung yêu cầu”, chọn hết (Ctrl+A) rồi sao chép (Ctrl+C).';
    say(task === 'position' ? 'Bước tiếp: dán vào claude.ai và đọc phân tích ngay ở đó.' : 'Bước tiếp: dán vào claude.ai, rồi dán câu trả lời của Claude vào ô bên dưới.');
  }
  // Đọc câu trả lời dán vào: bỏ khung ``` nếu có, lấy phần từ { đầu tiên tới } cuối cùng.
  function readPasted() {
    if (!fresh()) { say('Kịch bản đã thay đổi sau khi kiểm duyệt. Hãy kiểm duyệt lại rồi sao chép yêu cầu mới.', true); return; }
    const raw = pasteIn.value, a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0) { say('Không thấy khối JSON trong phần dán vào. Hãy sao chép toàn bộ câu trả lời của Claude.', true); return; }
    if (b <= a) { say('Câu trả lời bị cụt (thiếu phần cuối). Hãy bấm “Continue” trên claude.ai hoặc nhờ Claude “trả lại đúng khối JSON”, rồi dán lại.', true); return; }
    let parsed;
    try { parsed = JSON.parse(raw.slice(a, b + 1)); } catch (e) { say('Câu trả lời không phải JSON hợp lệ (có thể bị thiếu một đoạn). Hãy nhờ Claude “trả lại đúng khối JSON” rồi dán lại.', true); return; }
    const facts = chatFacts || buildFacts(), plies = new Set(facts.map(f => f.ply));
    const lines = Array.isArray(parsed.lines) ? parsed.lines.filter(l => l && Number.isInteger(+l.ply) && plies.has(+l.ply) && typeof l.text === 'string').map(l => ({ ply: +l.ply, text: l.text })) : [];
    if (!lines.length && !parsed.intro) { say('Câu trả lời không có lời thoại nào khớp với các nước đã kiểm duyệt.', true); return; }
    result = { parsed: { intro: typeof parsed.intro === 'string' ? parsed.intro : '', lines }, facts };
    render();
    say(`Đã đọc ${lines.length}/${facts.length} dòng lời thoại. Sửa nếu cần rồi bấm “Chèn vào kịch bản”.`);
  }
  $('cmCopy').onclick = copyPrompt;
  $('cmRead').onclick = readPasted;

  // ---------- duyệt và chèn ----------
  function render() {
    const { parsed, facts } = result;
    const byPly = new Map(facts.map(f => [f.ply, f]));
    const allowedAll = new Set();
    for (const p of data.plies) {
      allowedAll.add(p.nota);
      pvNotas(p.B, p.side, p.bestPv, 6).forEach(n => allowedAll.add(n));
      pvNotas(p.B, p.side, p.playedPv, 7).forEach(n => allowedAll.add(n)); // cả đòn trừng phạt sau nước đã đi
      for (const a of p.alts || []) pvNotas(p.B, p.side, a.pv, 5).forEach(n => allowedAll.add(n));
    }
    const row = (key, head, old, text, warn) => `<li><label class="cm-pick"><input type="checkbox" data-k="${key}" ${text ? 'checked' : ''}> ${head}</label>` +
      (old ? `<p class="cm-old">Đang có: ${esc(old)}</p>` : '') +
      `<textarea rows="2" data-t="${key}">${esc(text)}</textarea>` +
      (warn.length ? `<p class="cm-warn">Nhắc tới nước không có trong phân tích của máy: ${esc(warn.join(', '))}. Hãy kiểm tra lại câu này.</p>` : '') + '</li>';
    let h = row('intro', '<b>Lời mở đầu</b>', '', parsed.intro || '', unknownMoves(parsed.intro || '', allowedAll));
    for (const l of (parsed.lines || []).slice().sort((a, b) => a.ply - b.ply)) {
      const f = byPly.get(l.ply); if (!f) continue;
      h += row(l.ply, `<b>${esc(f.nuoc)} ${esc(f.ky_hieu)}</b> <span class="tag">${esc(f.danh_gia_cua_may)}</span>`, f.loi_thoai_hien_co || '', l.text, unknownMoves(l.text, allowedAll));
    }
    out.innerHTML = `<ol class="cm-list">${h}</ol><div class="actions"><button class="btn primary" type="button" id="cmInsert">Chèn các dòng đã chọn vào kịch bản</button></div>` +
      '<p class="hint">Dòng được chọn sẽ thay lời thoại đang có của nước đó; lời mở đầu được thêm lên đầu kịch bản.</p>';
    $('cmInsert').onclick = insert;
  }
  function insert() {
    if (!data || data.snapshot !== fenIn.value + '\n' + scriptIn.value) { say('Kịch bản đã thay đổi sau khi kiểm duyệt nên không chèn được. Hãy kiểm duyệt lại.', true); return; }
    const lines = scriptIn.value.split('\n'), clean = s => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
    let n = 0;
    out.querySelectorAll('input[data-k]').forEach(cb => {
      if (!cb.checked || cb.dataset.k === 'intro') return;
      const text = clean(out.querySelector(`textarea[data-t="${cb.dataset.k}"]`).value); if (!text) return;
      const p = data.plies.find(q => q.idx === +cb.dataset.k); if (!p) return;
      const raw = lines[p.line], bar = raw.indexOf('|');
      lines[p.line] = `${(bar < 0 ? raw : raw.slice(0, bar)).trim()} | ${text}`; n++;
    });
    const ic = out.querySelector('input[data-k="intro"]'), introText = clean(out.querySelector('textarea[data-t="intro"]').value);
    if (ic && ic.checked && introText) { lines.unshift(`| ${introText}`); n++; }
    scriptIn.value = lines.join('\n'); scriptIn.dispatchEvent(new Event('input', { bubbles: true }));
    data = null; out.innerHTML = '';
    say(`Đã chèn ${n} dòng lời thoại vào kịch bản. Bấm “Dựng video” để xem.`);
  }

  // ai-panel.js gọi khi người dùng bấm "Viết lời thoại bằng Claude" trong kết quả kiểm duyệt.
  // Khung dùng chung cho hai việc: viết lời thoại cho kịch bản, hoặc phân tích một thế cờ.
  function setTask(t) {
    task = t; const isPos = t === 'position';
    $('cmTitle').textContent = isPos ? 'Phân tích thế cờ bằng Claude' : 'Lời thoại bằng Claude';
    $('cmIntro').textContent = isPos ? 'Claude đọc sơ đồ bàn cờ và các phương án máy cờ vừa tính, rồi giải thích ý đồ từng phương án và vì sao máy chọn nước đầu tiên.'
      : 'Claude viết lời thoại cho từng nước dựa trên kết quả kiểm duyệt của máy cờ. Bạn sửa và chọn dòng muốn dùng rồi mới chèn vào kịch bản.';
    $('cmStyleRow').hidden = isPos; $('cmStepPaste').hidden = isPos; $('cmStepRead').hidden = !isPos;
    goBtn.textContent = isPos ? 'Phân tích' : 'Viết lời thoại';
  }
  // ai-panel.js gọi từ kết quả "Gợi ý nước đi": { B, side, lines: [{ move, score, pv }], engine, depth }.
  window.openPositionAnalysis = p => {
    if (stream) stream.abort();
    pos = p; data = null; setTask('position'); box.hidden = false; out.innerHTML = ''; result = null; chatFacts = null; pasteIn.value = ''; promptOut.value = ''; copyInfo.textContent = '';
    say(`Thế cờ ${sideName(p.side)} đi, ${p.lines.length} phương án của máy sẵn sàng.`);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    (!apiTools.hidden ? (keyIn.value ? goBtn : keyIn) : $('cmCopy')).focus();
  };
  window.openCommentary = review => {
    if (stream) stream.abort();
    setTask('script'); data = review; box.hidden = false; out.innerHTML = ''; result = null; chatFacts = null; pasteIn.value = ''; promptOut.value = ''; copyInfo.textContent = '';
    say(`${review.plies.length} nước đã kiểm duyệt sẵn sàng.`);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    (!apiTools.hidden ? (keyIn.value ? goBtn : keyIn) : $('cmCopy')).focus();
  };
  goBtn.onclick = run;
  stopBtn.onclick = () => { if (stream) stream.abort(); };
  $('cmClose').onclick = () => { if (stream) stream.abort(); box.hidden = true; };
  remember.onchange = () => { if (!remember.checked) try { localStorage.removeItem(KEY_STORE); } catch (e) { /* bỏ qua */ } };
})();
