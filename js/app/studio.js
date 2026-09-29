'use strict';
const presetSel = $('preset'), titleIn = $('title'), fenIn = $('fen'), scriptIn = $('script'), styleSel = $('style'), speedSel = $('speed'), errBox = $('errors'), info = $('buildInfo');
PRESETS.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p.name; presetSel.appendChild(o); });
const custom = document.createElement('option'); custom.value = 'custom'; custom.textContent = 'Tự soạn'; presetSel.appendChild(custom);
function showErrors(list) { if (!list.length) { errBox.style.display = 'none'; return; } errBox.style.display = 'block'; errBox.innerHTML = '<ul></ul>'; list.forEach(e => { const li = document.createElement('li'); li.textContent = e; errBox.firstChild.appendChild(li); }); }
function loadPreset(i) { const p = PRESETS[i]; titleIn.value = p.title; fenIn.value = p.fen; scriptIn.value = p.script; if (window.refreshEditor) window.refreshEditor(); }
function doBuild(autoplay) {
  let nt;
  try { nt = build({ fen: fenIn.value, title: titleIn.value.trim(), script: scriptIn.value, pace: +speedSel.value }); }
  catch (e) { showErrors([typeof e === 'string' ? e : 'Không dựng được: ' + e.message]); return; }
  TL = nt; showErrors(nt.errors);
  info.textContent = `Đã dựng: ${nt.hud.length} nước, dài ${fmt(nt.DUR)}.`;
  scrub.max = nt.DUR.toFixed(2); renderChapters();
  t = 0; playing = false; if (autoplay) play(); else syncButtons(); dirty = true;
}
presetSel.onchange = () => { if (presetSel.value !== 'custom') { loadPreset(+presetSel.value); doBuild(false); } };
for (const el of [titleIn, fenIn, scriptIn]) el.addEventListener('input', () => { presetSel.value = 'custom'; });
$('startPos').onclick = () => $('edStart').click();
const soundSel = $('sound');
Object.entries(SOUND_PACKS).forEach(([k, p]) => { const o = document.createElement('option'); o.value = k; o.textContent = p.name; soundSel.appendChild(o); });
soundSel.onchange = () => { SOUND_PACK = soundSel.value; previewPack(); };
$('previewSound').onclick = previewPack;
$('subs').onchange = e => { SHOW_SUBS = e.target.value === '1'; dirty = true; };
styleSel.onchange = () => { THEME = THEMES[styleSel.value]; dirty = true; };
speedSel.onchange = () => doBuild(false);
$('buildBtn').onclick = () => { doBuild(true); stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

loadPreset(0); doBuild(false);
requestAnimationFrame(frame);
if (document.fonts && document.fonts.load) Promise.all([document.fonts.load(`900 50px ${CJK}`, '帥將'), document.fonts.load(`700 20px ${UI}`, 'Chiếu')]).then(() => { dirty = true; }).catch(() => {});
