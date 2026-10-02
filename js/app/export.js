'use strict';
let downloads = null, recCancelled = false;
(async () => { try { if (window.claude && window.claude.use) downloads = await window.claude.use('downloads'); } catch (e) { downloads = null; } exportBtn.hidden = !(window.MediaRecorder && cv.captureStream); })();
exportBtn.onclick = async () => {
  if (recording) return;
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) { showErrors(['Trình duyệt này không hỗ trợ ghi video. Hãy dùng Chrome, Edge hoặc Safari bản mới, hoặc quay màn hình.']); return; }
  ensureAudio(); setMode(false); mb = 0;
  forceSize = FORMATS[FORMAT].size.slice(); resize();
  const stream = cv.captureStream(30);
  if (actx && actx.createMediaStreamDestination) { recDest = actx.createMediaStreamDestination(); recDest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr)); master.connect(recDest); }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 }), chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => rec.onstop = r);
  // Video quay theo thời gian thực: chuyển sang tab khác thì trình duyệt ngừng vẽ trang, video sẽ bị
  // đứng hình. Vì vậy tạm dừng cả ghi hình, âm thanh và dòng thời gian, quay lại tab thì quay tiếp.
  const onVis = () => {
    if (document.hidden) {
      if (rec.state !== 'recording') return;
      rec.pause(); if (actx) actx.suspend(); playing = false;
      $('recText').textContent = 'Đã tạm dừng quay vì bạn chuyển tab; quay lại tab này để quay tiếp';
    } else if (rec.state === 'paused' && !recCancelled) { if (actx) actx.resume(); rec.resume(); playing = true; last = null; dirty = true; }
  };
  document.addEventListener('visibilitychange', onVis);
  recCancelled = false; recording = true; $('recNote').style.display = 'block';
  t = 0; render(0); rec.start(500); play();
  await new Promise(r => recDone = r);
  document.removeEventListener('visibilitychange', onVis);
  if (actx && actx.state === 'suspended') actx.resume();
  rec.stop(); await stopped;
  recording = false; if (recDest) { try { master.disconnect(recDest); } catch (err) {} } recDest = null; forceSize = null; resize(); $('recNote').style.display = 'none'; syncButtons();
  if (recCancelled) { pause(); return; }
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const slug = (TL.title || 'the-co').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'the-co';
  const blob = new Blob(chunks, { type: mime }), fname = `co-tuong-${slug}.${ext}`;
  if (downloads) {
    try { await downloads.save({ filename: fname, data: blob }); }
    catch (e) { if (e && e.code !== 'declined') showErrors([`Không lưu được file (${e && e.code || 'lỗi'}).`]); }
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
};
// Hủy quay giữa chừng: dừng ghi, không lưu file.
$('recCancel').onclick = () => {
  if (!recording || !recDone) return;
  recCancelled = true; playing = false;
  const f = recDone; recDone = null; f();
};
