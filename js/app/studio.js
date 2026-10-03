'use strict';
const presetSel = $('preset'), titleIn = $('title'), fenIn = $('fen'), scriptIn = $('script'), styleSel = $('style'), speedSel = $('speed'), errBox = $('errors'), info = $('buildInfo');
// Mẫu của tôi: người dùng lưu thêm, nằm trong localStorage của trình duyệt (xem js/app/my-presets.js).
const MY_KEY = 'coTuongMyPresets';
function myPresets() { try { const a = JSON.parse(localStorage.getItem(MY_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveMyPresets(list) { localStorage.setItem(MY_KEY, JSON.stringify(list)); }
let lastPreset = null; // mẫu đang mở trước lần đổi gần nhất ('custom' = đang tự soạn)
function renderPresetOptions(value) {
  presetSel.innerHTML = '';
  const add = (parent, v, text) => { const o = document.createElement('option'); o.value = v; o.textContent = text; parent.appendChild(o); };
  const g1 = document.createElement('optgroup'); g1.label = 'Mẫu có sẵn'; presetSel.appendChild(g1);
  PRESETS.forEach((p, i) => add(g1, i, p.name));
  const mine = myPresets();
  if (mine.length) { const g2 = document.createElement('optgroup'); g2.label = 'Mẫu của tôi'; presetSel.appendChild(g2); mine.forEach(p => add(g2, 'u:' + p.id, p.name)); }
  add(presetSel, 'custom', 'Tự soạn');
  presetSel.value = value != null && [...presetSel.options].some(o => o.value === String(value)) ? String(value) : 'custom';
  lastPreset = presetSel.value;
}
renderPresetOptions(0);
function showErrors(list) { if (!list.length) { errBox.style.display = 'none'; return; } errBox.style.display = 'block'; errBox.innerHTML = '<ul></ul>'; list.forEach(e => { const li = document.createElement('li'); li.textContent = e; errBox.firstChild.appendChild(li); }); }
function presetOf(v) { return String(v).startsWith('u:') ? myPresets().find(p => 'u:' + p.id === String(v)) : PRESETS[+v]; }
function loadPreset(v) { const p = presetOf(v); if (!p) return; titleIn.value = p.title; fenIn.value = p.fen; scriptIn.value = p.script; if (window.refreshEditor) window.refreshEditor(); }
function doBuild(autoplay) {
  let nt;
  try { nt = build({ fen: fenIn.value, title: titleIn.value.trim(), script: scriptIn.value, pace: +speedSel.value }); }
  catch (e) { showErrors([typeof e === 'string' ? e : 'Không dựng được: ' + e.message]); return; }
  TL = nt; showErrors(nt.errors);
  info.textContent = `Đã dựng: ${nt.hud.length} nước, dài ${fmt(nt.DUR)}.`;
  scrub.max = nt.DUR.toFixed(2); renderChapters();
  t = 0; playing = false; if (autoplay) play(); else syncButtons(); dirty = true;
}
// Tự lưu bản đang soạn (tiêu đề, thế cờ, kịch bản) vào trình duyệt; mở lại trang thì soạn tiếp được.
const DRAFT_KEY = 'coTuongDraft', draftNote = $('draftNote');
let draftTimer = 0;
function saveDraft() {
  clearTimeout(draftTimer);
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: titleIn.value, fen: fenIn.value, script: scriptIn.value, preset: presetSel.value, at: Date.now() })); } catch (e) { /* bộ nhớ đầy / ẩn danh: bỏ qua */ }
}
const queueDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); };
function restoreDraft() {
  let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { d = null; }
  if (!d || typeof d.fen !== 'string' || typeof d.script !== 'string') return false;
  titleIn.value = d.title || ''; fenIn.value = d.fen; scriptIn.value = d.script;
  // Nếu bản nháp đúng là một mẫu chưa sửa thì giữ mẫu đó trong ô chọn, còn lại là "Tự soạn".
  const p = d.preset != null && d.preset !== 'custom' ? presetOf(d.preset) : null;
  const same = p && p.fen === d.fen && p.script === d.script && p.title === d.title;
  presetSel.value = same ? String(d.preset) : 'custom';
  if (!same) {
    const at = new Date(d.at || Date.now());
    draftNote.textContent = `Đã mở lại bản bạn đang soạn lần trước (tự lưu lúc ${at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày ${at.toLocaleDateString('vi-VN')}).`;
    draftNote.hidden = false;
  }
  return true;
}
for (const el of [titleIn, fenIn, scriptIn]) el.addEventListener('input', queueDraft);
window.addEventListener('pagehide', saveDraft);

presetSel.onchange = () => {
  // Đang soạn dở mà chọn mẫu khác thì kịch bản sẽ bị thay: hỏi trước.
  if (lastPreset === 'custom' && scriptIn.value.trim() && presetSel.value !== 'custom' &&
      !confirm('Mở mẫu này sẽ thay thế kịch bản bạn đang soạn. Muốn giữ lại thì bấm “Hủy” rồi “Lưu thành mẫu” trước.\n\nVẫn mở mẫu?')) {
    presetSel.value = 'custom'; return;
  }
  if (presetSel.value !== 'custom') { loadPreset(presetSel.value); doBuild(false); draftNote.hidden = true; }
  lastPreset = presetSel.value; saveDraft();
  if (window.onPresetChange) window.onPresetChange();
};
for (const el of [titleIn, fenIn, scriptIn]) el.addEventListener('input', () => { presetSel.value = 'custom'; lastPreset = 'custom'; });
$('startPos').onclick = () => $('edStart').click();
const soundSel = $('sound');
Object.entries(SOUND_PACKS).forEach(([k, p]) => { const o = document.createElement('option'); o.value = k; o.textContent = p.name; soundSel.appendChild(o); });
soundSel.onchange = () => { SOUND_PACK = soundSel.value; previewPack(); };
$('previewSound').onclick = previewPack;
$('subs').onchange = e => { SHOW_SUBS = e.target.value === '1'; dirty = true; };
styleSel.onchange = () => { THEME = THEMES[styleSel.value]; dirty = true; };
speedSel.onchange = () => doBuild(false);
$('buildBtn').onclick = () => { doBuild(true); stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

if (!restoreDraft()) loadPreset(0);
lastPreset = presetSel.value;
doBuild(false);
requestAnimationFrame(frame);
if (document.fonts && document.fonts.load) Promise.all([document.fonts.load(`900 50px ${CJK}`, '帥將'), document.fonts.load(`700 20px ${UI}`, 'Chiếu')]).then(() => { dirty = true; }).catch(() => {});
