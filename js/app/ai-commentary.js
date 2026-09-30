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
    : (red > 0 ? '+' : red < 0 ? '−' : '') + (Math.abs(red) / 100).toFixed(1).replace('.', ','));
  const sideName = s => (s === 'r' ? 'Đỏ' : 'Đen');
  const notaOf = (B, side, m) => { try { const n = toNotation(B, side, m); const b = resolve(B, side, n); return b[0] === m[0] && b[1] === m[1] ? n : pgnICCS(m); } catch (e) { return pgnICCS(m); } };
  function pvNotas(B, side, pv, max) {
    const o = []; let b = B, s = side;
    try { for (const m of (pv || []).slice(0, max)) { o.push(notaOf(b, s, m)); b = apply(b, m); s = opp(s); } } catch (e) { /* dừng ở nước lạ */ }
    return o;
  }
  function narrationOf(line) { const i = line.indexOf('|'); return i < 0 ? '' : line.slice(i + 1).trim(); }

  function buildFacts() {
    const lines = scriptIn.value.split('\n'), s0 = data.s0;
    return data.plies.slice().sort((a, b) => a.idx - b.idx).map(p => {
      const after = apply(p.B, p.m), cap = p.B[p.m[1]], toRed = (sc, side) => (side === 'r' ? sc : -sc);
      const bestPv = pvNotas(p.B, p.side, p.bestPv, 6);
      return {
        ply: p.idx, nuoc: `${p.no}${p.side === s0 ? '.' : '…'}`, ben_di: sideName(p.side), ky_hieu: p.nota,
        danh_gia_cua_may: p.cls.label,
        diem_truoc_nuoc: fmtScore(toRed(p.best, p.side)), diem_sau_nuoc: fmtScore(toRed(p.played, p.side)),
        may_chon: bestPv[0] || null, dien_bien_may_chon: bestPv.join(' '),
        an_quan: cap ? `${NAME[cap.type]} ${sideName(cap.side)}` : null,
        chieu_tuong: inCheck(after, opp(p.side)), chieu_bi: !!p.mates,
        loi_thoai_hien_co: narrationOf(lines[p.line] || '') || null,
        ...MoveFacts.forMove(p.B, p.side, p.m, p.playedPv, p.bestMove, p.bestPv)
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
    if (!data || data.snapshot !== fenIn.value + '\n' + scriptIn.value) { say('Kịch bản đã thay đổi sau khi kiểm duyệt. Hãy bấm “Kiểm duyệt kịch bản” lại trước.', true); return; }
    const apiKey = keyIn.value.trim();
    if (!apiKey) { say('Hãy nhập khóa API Anthropic (lấy ở console.anthropic.com).', true); keyIn.focus(); return; }
    try { if (remember.checked) localStorage.setItem(KEY_STORE, apiKey); else localStorage.removeItem(KEY_STORE); } catch (e) { /* bỏ qua */ }
    let Anthropic;
    try { Anthropic = await loadSdk(); } catch (e) { say(e.message, true); return; }
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
    } catch (e) {
      if (e instanceof Anthropic.APIUserAbortError) say('Đã dừng.');
      else if (e instanceof Anthropic.AuthenticationError) say('Khóa API không đúng hoặc đã bị thu hồi.', true);
      else if (e instanceof Anthropic.PermissionDeniedError) say('Khóa API không có quyền dùng model này.', true);
      else if (e instanceof Anthropic.RateLimitError) say('Đang gửi quá nhiều yêu cầu hoặc hết hạn mức. Hãy thử lại sau ít phút.', true);
      else if (e instanceof Anthropic.BadRequestError) say(`Yêu cầu không hợp lệ: ${e.message}`, true);
      else if (e instanceof Anthropic.APIConnectionError) say('Không kết nối được tới Claude. Hãy kiểm tra mạng.', true);
      else if (e instanceof Anthropic.APIError) say(`Lỗi từ Claude (${e.status}): ${e.message}`, true);
      else say(`Lỗi: ${e.message || e}`, true);
    } finally { stream = null; goBtn.disabled = false; stopBtn.hidden = true; }
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
    if (!fresh()) { say('Kịch bản đã thay đổi sau khi kiểm duyệt. Hãy bấm “Kiểm duyệt kịch bản” lại trước.', true); return; }
    chatFacts = buildFacts();
    const text = chatPrompt(chatFacts);
    promptOut.value = text;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      // Trình duyệt chặn clipboard API (ví dụ khi mở file trực tiếp): chọn chữ rồi sao chép kiểu cũ.
      const det = promptOut.closest('details'); det.open = true; promptOut.focus(); promptOut.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    }
    copyInfo.textContent = ok ? `Đã sao chép yêu cầu cho ${chatFacts.length} nước (${text.length.toLocaleString('vi-VN')} ký tự).`
      : 'Chưa sao chép tự động được: hãy mở “Xem nội dung yêu cầu”, chọn hết (Ctrl+A) rồi sao chép (Ctrl+C).';
    say('Bước tiếp: dán vào claude.ai, rồi dán câu trả lời của Claude vào ô bên dưới.');
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
  window.openCommentary = review => {
    data = review; box.hidden = false; out.innerHTML = ''; result = null; chatFacts = null; pasteIn.value = ''; promptOut.value = ''; copyInfo.textContent = '';
    say(`${review.plies.length} nước đã kiểm duyệt sẵn sàng.`);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    (!apiTools.hidden ? (keyIn.value ? goBtn : keyIn) : $('cmCopy')).focus();
  };
  goBtn.onclick = run;
  stopBtn.onclick = () => { if (stream) stream.abort(); };
  $('cmClose').onclick = () => { if (stream) stream.abort(); box.hidden = true; };
  remember.onchange = () => { if (!remember.checked) try { localStorage.removeItem(KEY_STORE); } catch (e) { /* bỏ qua */ } };
})();
