'use strict';
// Giao diện quanh sa bàn: đồng hồ, biểu đồ thủy triều, quân đang chọn, mục tiêu, chiến báo, màn kết thúc.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const SEL_HINT = TOUCH ? 'Chạm vào quân ta để chọn, rồi chạm chỗ cần tới hoặc quân giặc để ra lệnh.'
  : 'Bấm vào quân ta để chọn, kéo chuột để chọn nhiều. Chuột phải để ra lệnh.';

BD.HUD = {
  bind(w) {
    this.w = w; this.logN = 0; this.selKey = '';
    $('log').innerHTML = ''; $('stakeMax').textContent = w.battle.maxStakes;
    $('banner').hidden = true;
    this.renderGoals();
  },
  renderGoals() {
    const B = this.w.battle, s = this.w.stats;
    const items = B.victory.map(c => `<li class="ok">Đánh chìm ${c.sunkAtLeast} / ${B.enemy.length} thuyền giặc <b>(${s.sunk})</b></li>`)
      .concat(['Giữ đồn và thuyền chỉ huy của Ngô Quyền',
        `Không để quá ${B.defeat.find(c => c.escapedAtLeast).escapedAtLeast - 1} thuyền giặc thoát ra biển <b>(${s.escaped})</b>`,
        `Hết giờ lúc ${BD.fmtTime(B.defeat.find(c => c.time).time)} (nước lên lại)`].map(t => `<li>${t}</li>`));
    const html = items.join('');
    if (html !== this.goalsHtml) { $('goals').innerHTML = html; this.goalsHtml = html; }
  },

  update(view, paused) {
    const w = this.w;
    $('clock').textContent = BD.fmtTime(w.t);
    $('phase').textContent = w.phase === 'plan' ? 'Bày trận' : w.phase === 'end' ? 'Kết thúc' : paused ? 'Tạm dừng' : 'Giao chiến';
    $('stakeCount').textContent = w.terrain.stakes.size;
    $('planCard').hidden = w.phase !== 'plan';
    this.drawTide();
    this.renderGoals();
    this.renderSel(view);
    for (; this.logN < w.log.length; this.logN++) this.addLog(w.log[this.logN]);
  },

  drawTide() {
    const cv = $('tideCv'), g = cv.getContext('2d'), w = this.w, T = w.terrain, W = cv.width, H = cv.height;
    const span = w.battle.defeat.find(c => c.time).time, pad = 4, y = lv => H - pad - lv * (H - 2 * pad), x = t => t / span * W;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(79,176,255,.18)'; g.beginPath(); g.moveTo(0, H);
    for (let px = 0; px <= W; px += 3) g.lineTo(px, y(T.level(px / W * span)));
    g.lineTo(W, H); g.fill();
    g.strokeStyle = '#4fb0ff'; g.lineWidth = 1.5; g.beginPath();
    for (let px = 0; px <= W; px += 3) g[px ? 'lineTo' : 'moveTo'](px, y(T.level(px / W * span)));
    g.stroke();
    const sl = y(T.tide.stakeLevel);
    g.strokeStyle = '#ffb13b'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(0, sl); g.lineTo(W, sl); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#fff'; g.fillRect(x(w.t) - 1, 0, 2, H);
    g.beginPath(); g.arc(x(w.t), y(w.level), 3.5, 0, 7); g.fill();
    const lv = w.level, txt = T.stakesBite(lv) ? (lv < T.tide.stakeVisible ? 'Cọc nhô khỏi mặt nước' : 'Cọc đâm thủng thuyền') : (T.falling(w.t) ? 'Nước đang rút' : 'Nước đang lên');
    $('tideTxt').textContent = `Triều ${Math.round(lv * 100)}% · ${txt}`;
    $('tideTxt').className = T.stakesBite(lv) ? 'hot' : '';
  },

  renderSel(view) {
    const sel = [...view.sel].filter(u => !u.dead);
    const key = sel.map(u => u.id + ':' + Math.round(u.hp) + u.holdFire + u.state + (u.order ? u.order.kind : '') + this.w.concealed(u)).join(',');
    if (key === this.selKey) return; this.selKey = key;
    $('selActions').hidden = !sel.some(u => u.type.domain !== 'fixed');
    if (!sel.length) { $('selInfo').className = 'sel-empty'; $('selInfo').textContent = SEL_HINT; return; }
    $('selInfo').className = '';
    if (sel.length > 1) {
      const groups = {};
      for (const u of sel) groups[u.type.name] = (groups[u.type.name] || 0) + 1;
      $('selInfo').innerHTML = `<p><b>${sel.length} đơn vị</b></p><p class="muted">${Object.entries(groups).map(([n, c]) => `${c} ${esc(n.toLowerCase())}`).join(' · ')}</p>`;
    } else {
      const u = sel[0], t = u.type;
      const status = [u.state === 'impaled' ? 'Mắc cọc' : u.state === 'aground' ? 'Mắc cạn' : '', this.w.concealed(u) ? 'Đang ẩn nấp' : '', u.holdFire ? 'Giữ im lặng' : ''].filter(Boolean);
      $('selInfo').innerHTML = `<p><b>${esc(u.name)}</b>${u.name !== t.name ? ` <span class="muted">· ${esc(t.name)}</span>` : ''}</p>
        <div class="hp"><i style="width:${Math.round(BD.clamp(u.hp / u.maxHp) * 100)}%"></i></div>
        <dl class="kv"><dt>Máu</dt><dd>${Math.ceil(u.hp)} / ${u.maxHp}</dd><dt>Công</dt><dd>${t.atk}</dd><dt>Thủ</dt><dd>${t.def}</dd>
        <dt>Tầm</dt><dd>${t.range}</dd><dt>Tốc độ</dt><dd>${t.speed}</dd></dl>
        ${status.length ? `<p class="tags">${status.map(s => `<span>${s}</span>`).join('')}</p>` : ''}`;
    }
    $('holdBtn').textContent = sel.every(u => u.holdFire) ? 'Cho phép bắn (H)' : 'Giữ im lặng (H)';
  },

  addLog(l) {
    const li = document.createElement('li');
    li.className = l.kind;
    li.innerHTML = `<time>${BD.fmtTime(l.t)}</time> ${l.who ? `<b>${esc(l.who)}:</b> ` : ''}${esc(l.text)}`;
    $('log').prepend(li);
    if (l.kind === 'story' || l.kind === 'enemy') this.banner(l);
  },
  banner(l) {
    const b = $('banner');
    b.className = 'banner ' + l.kind;
    b.innerHTML = `${l.who ? `<b>${esc(l.who)}</b>` : ''}<span>${esc(l.text)}</span>`;
    b.hidden = false;
    clearTimeout(this.bt); this.bt = setTimeout(() => { b.hidden = true; }, 5000);
  },

  showEnd(w) {
    const r = w.result, B = w.battle, s = r.stats;
    const stars = r.win ? 1 + (s.sunk >= B.enemy.length - 1 ? 1 : 0) + (s.lost <= 3 ? 1 : 0) : 0;
    $('endEyebrow').textContent = r.win ? `Chiến thắng · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` : 'Thất bại';
    $('endTitle').textContent = r.win ? 'Đại thắng Bạch Đằng' : 'Quân ta thất thủ';
    $('endText').textContent = r.text;
    $('endStats').innerHTML = `<dt>Thời gian</dt><dd>${BD.fmtTime(r.t)}</dd><dt>Thuyền giặc bị đánh chìm</dt><dd>${s.sunk} / ${B.enemy.length}</dd>
      <dt>Mắc cọc</dt><dd>${s.impaled}</dd><dt>Thoát ra biển</dt><dd>${s.escaped}</dd><dt>Quân ta tổn thất</dt><dd>${s.lost}</dd>`;
    $('endLore').innerHTML = r.win ? `<p class="unlock">Đã mở khóa trong Bách khoa: <b>${esc(B.lore.title)}</b></p>${this.loreHtml(B)}`
      : '<p class="muted">Gợi ý: cọc chỉ có tác dụng khi nước rút. Hãy giữ chân giặc ở thượng nguồn cho tới khi nước xuống, và đừng đánh soái thuyền quá sớm.</p>';
    $('endModal').hidden = false;
  },
  loreHtml(B) {
    return `<div class="lore"><h3>${esc(B.lore.title)}</h3>${B.lore.sections.map(s => `<h4>${esc(s.h)}</h4>${s.p.map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>`;
  },
};
