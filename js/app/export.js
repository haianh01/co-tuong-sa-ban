'use strict';
let downloads = null;
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
  recording = true; $('recNote').style.display = 'block';
  t = 0; render(0); rec.start(500); play();
  await new Promise(r => recDone = r);
  rec.stop(); await stopped;
  recording = false; if (recDest) { try { master.disconnect(recDest); } catch (err) {} } recDest = null; forceSize = null; resize(); $('recNote').style.display = 'none'; syncButtons();
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
