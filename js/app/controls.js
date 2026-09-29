'use strict';
const $ = id => document.getElementById(id);
// Output frame formats. The camera focal length follows the shorter side, so the board fits every shape.
const FORMATS = {
  youtube: { name: 'YouTube 16:9', size: [1920, 1080] },
  shorts: { name: 'Shorts, TikTok, Reels 9:16', size: [1080, 1920] },
  feed: { name: 'Facebook, Instagram 4:5', size: [1080, 1350] },
  square: { name: 'Vuông 1:1', size: [1080, 1080] }
};
let FORMAT = 'youtube';
function setFormat(key) {
  FORMAT = key; const [w, h] = FORMATS[key].size;
  stage.style.aspectRatio = `${w} / ${h}`;
  stage.style.width = `min(100%, calc(78vh * ${(w / h).toFixed(4)}))`;
  resize();
}
{
  const sel = $('format');
  Object.entries(FORMATS).forEach(([k, f]) => { const o = document.createElement('option'); o.value = k; o.textContent = f.name; sel.appendChild(o); });
  sel.onchange = () => setFormat(sel.value);
}
const scrub = $('scrub'), timeEl = $('time'), playBtn = $('playBtn'), muteBtn = $('muteBtn'), bigPlay = $('bigPlay'), exportBtn = $('exportBtn'), chapList = $('chapters');
let t = 0, playing = false, last = null, recording = false, recDone = null, chapBtns = [];
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateDOM(t) {
  if (document.activeElement !== scrub) scrub.value = t;
  timeEl.textContent = `${fmt(t)} / ${fmt(TL.DUR)}`;
  let ci = 0; TL.chapters.forEach((c, i) => { if (t >= c[0]) ci = i; }); chapBtns.forEach((b, i) => b.classList.toggle('on', i === ci));
  if (recording) $('recNote').textContent = `Đang quay video ${fmt(t)} / ${fmt(TL.DUR)}`;
}
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6" stroke-linecap="round"/></svg>'
};
function syncButtons() {
  playBtn.innerHTML = playing ? ICON.pause : ICON.play; playBtn.setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát');
  muteBtn.innerHTML = muted ? ICON.mute : ICON.sound; muteBtn.setAttribute('aria-label', muted ? 'Bật tiếng' : 'Tắt tiếng');
  bigPlay.style.display = playing || t > 0.05 ? 'none' : '';
  for (const b of [playBtn, $('restartBtn'), scrub, exportBtn, $('buildBtn')]) b.disabled = recording;
}
function play() { ensureAudio(); if (t >= TL.DUR - 0.01) t = 0; playing = true; last = null; syncButtons(); dirty = true; }
function pause() { playing = false; syncButtons(); }
playBtn.onclick = () => playing ? pause() : play();
bigPlay.onclick = play;
$('restartBtn').onclick = () => { t = 0; play(); };
muteBtn.onclick = () => { muted = !muted; syncButtons(); };
scrub.addEventListener('input', () => { t = +scrub.value; dirty = true; syncButtons(); });
scrub.addEventListener('change', () => scrub.blur());
const setMode = flat => { mbTarget = flat ? 1 : 0; dirty = true; $('modeCine').setAttribute('aria-pressed', String(!flat)); $('modeFlat').setAttribute('aria-pressed', String(flat)); };
$('modeCine').onclick = () => setMode(false); $('modeFlat').onclick = () => setMode(true);
document.addEventListener('keydown', e => { if (e.code === 'Space' && !recording && !['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { e.preventDefault(); playing ? pause() : play(); } });
function renderChapters() {
  chapList.innerHTML = ''; chapBtns = [];
  TL.chapters.forEach(([ct, name]) => { const li = document.createElement('li'), b = document.createElement('button'); b.innerHTML = `<b>${fmt(ct)}</b>`; b.append(name); b.onclick = () => { if (recording) return; t = ct; play(); }; li.appendChild(b); chapList.appendChild(li); chapBtns.push(b); });
}

function frame(now) {
  const dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) { const prev = t; t = Math.min(TL.DUR, t + dt); fire(prev, t); if (t >= TL.DUR) { playing = false; syncButtons(); if (recDone) { const f = recDone; recDone = null; setTimeout(f, 300); } } dirty = true; }
  if (mb !== mbTarget) { mb += (mbTarget - mb) * Math.min(1, dt * 5 || 0.08); if (Math.abs(mb - mbTarget) < .002) mb = mbTarget; dirty = true; }
  if (dirty) { dirty = false; render(t); }
  requestAnimationFrame(frame);
}
