'use strict';
// Xuất video.
// - Cách nhanh (Chrome/Edge có WebCodecs): dựng từng khung hình theo đúng thời điểm, mã hóa bằng
//   VideoEncoder, âm thanh dựng một lần bằng OfflineAudioContext rồi mã hóa bằng AudioEncoder, đóng gói MP4
//   bằng vendor/mp4-muxer.js. Không phụ thuộc thời gian thực nên nhanh hơn, video không bị giật, và vẫn chạy
//   khi chuyển sang tab khác.
// - Cách dự phòng (trình duyệt không có WebCodecs): quay canvas theo thời gian thực bằng MediaRecorder.
let downloads = null, recCancelled = false;
const FPS = 30, ARATE = 48000;
(async () => { try { if (window.claude && window.claude.use) downloads = await window.claude.use('downloads'); } catch (e) { downloads = null; } exportBtn.hidden = !(window.VideoEncoder || (window.MediaRecorder && cv.captureStream)); })();

function loadMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/mp4-muxer.js';
    s.onload = () => (window.Mp4Muxer ? res(window.Mp4Muxer) : rej(new Error('vendor/mp4-muxer.js không hợp lệ.')));
    s.onerror = () => rej(new Error('Không nạp được vendor/mp4-muxer.js.'));
    document.head.appendChild(s);
  });
}
// Chọn codec máy hỗ trợ: ưu tiên H.264 + AAC (mở được ở mọi nơi), không có thì VP9/AV1 + Opus.
async function pickCodecs(w, h) {
  if (!window.VideoEncoder || !window.VideoFrame) return null;
  let video = null, audio = null;
  for (const [codec, mux] of [['avc1.640028', 'avc'], ['avc1.640032', 'avc'], ['avc1.4d0028', 'avc'], ['vp09.00.40.08', 'vp9'], ['av01.0.08M.08', 'av1']]) {
    const cfg = { codec, width: w, height: h, bitrate: 10e6, framerate: FPS };
    if (mux === 'avc') cfg.avc = { format: 'avc' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) { video = { cfg, mux }; break; } } catch (e) { /* thử codec khác */ }
  }
  if (!video) return null;
  if (window.AudioEncoder && window.AudioData) {
    for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
      const cfg = { codec, sampleRate: ARATE, numberOfChannels: 2, bitrate: 160000 };
      try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) { audio = { cfg, mux }; break; } } catch (e) { /* thử codec khác */ }
    }
  }
  return { video, audio };
}
// Dựng toàn bộ tiếng động của video vào một AudioBuffer: tạm thay actx/master của bộ âm thanh bằng
// OfflineAudioContext, đặt từng tiếng vào đúng thời điểm của nó.
async function renderAudio(dur) {
  const oc = new OfflineAudioContext(2, Math.ceil(dur * ARATE), ARATE), saved = [actx, master, reverbIn];
  actx = oc; master = oc.createGain(); master.gain.value = 0.9; master.connect(oc.destination); reverbIn = null;
  try { for (const e of TL.sounds) if (e.t < dur) playSfx(e, e.t); }
  finally { [actx, master, reverbIn] = saved; }
  if (window.renderNarration) await window.renderNarration(oc); // giọng đọc (js/app/narration.js), nếu bật
  return oc.startRendering();
}
// Nhường luồng cho trình duyệt vẽ lại giao diện; MessageChannel không bị làm chậm khi tab ở chế độ nền.
const yieldUI = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

async function exportFast(codecs) {
  const Mux = await loadMuxer(), [w, h] = FORMATS[FORMAT].size, withAudio = codecs.audio && !muted;
  const target = new Mux.ArrayBufferTarget();
  const muxer = new Mux.Muxer({
    target, fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    video: { codec: codecs.video.mux, width: w, height: h, frameRate: FPS },
    audio: withAudio ? { codec: codecs.audio.mux, numberOfChannels: 2, sampleRate: ARATE } : undefined
  });
  let encErr = null;
  const say = s => { $('recText').textContent = s; };
  if (withAudio) {
    say('Đang dựng âm thanh…'); await yieldUI();
    const buf = await renderAudio(TL.DUR);
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => { encErr = e; } });
    aenc.configure(codecs.audio.cfg);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), N = 4800;
    for (let i = 0; i < buf.length; i += N) {
      const n = Math.min(N, buf.length - i), data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: ARATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / ARATE * 1e6), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush(); aenc.close();
  }
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { encErr = e; } });
  venc.configure(codecs.video.cfg);
  const total = Math.ceil(TL.DUR * FPS), t0 = performance.now();
  for (let i = 0; i < total; i++) {
    if (recCancelled) break;
    if (encErr) throw encErr;
    const tt = i / FPS; t = tt; render(tt);
    const vf = new VideoFrame(cv, { timestamp: Math.round(tt * 1e6), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
    const el = (performance.now() - t0) / 1000, left = el / (i + 1) * (total - i - 1);
    say(`Đang dựng video ${Math.floor((i + 1) / total * 100)}% · còn khoảng ${Math.ceil(left)} giây`);
    if (venc.encodeQueueSize > 6) await new Promise(r => venc.addEventListener('dequeue', r, { once: true }));
    if (i % 4 === 0) await yieldUI();
  }
  if (recCancelled) { try { venc.close(); } catch (e) { /* bỏ qua */ } return null; }
  await venc.flush(); venc.close();
  if (encErr) throw encErr;
  muxer.finalize();
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4', note: `${codecs.video.mux === 'avc' ? 'H.264' : codecs.video.mux.toUpperCase()}${withAudio ? ' + ' + (codecs.audio.mux === 'aac' ? 'AAC' : 'Opus') : ''}` };
}

// Cách dự phòng: quay canvas theo thời gian thực.
async function exportRealtime() {
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Trình duyệt này không hỗ trợ ghi video. Hãy dùng Chrome, Edge hoặc Safari bản mới, hoặc quay màn hình.');
  ensureAudio();
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
  t = 0; render(0); rec.start(500); play();
  await new Promise(r => recDone = r);
  document.removeEventListener('visibilitychange', onVis);
  if (actx && actx.state === 'suspended') actx.resume();
  rec.stop(); await stopped;
  if (recDest) { try { master.disconnect(recDest); } catch (err) { /* bỏ qua */ } } recDest = null;
  if (recCancelled) { pause(); return null; }
  return { blob: new Blob(chunks, { type: mime }), ext: mime.includes('mp4') ? 'mp4' : 'webm', note: 'quay thời gian thực' };
}

async function saveVideo(blob, ext) {
  const slug = (TL.title || 'the-co').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'the-co';
  const fname = `co-tuong-${slug}.${ext}`;
  if (downloads) {
    try { await downloads.save({ filename: fname, data: blob }); }
    catch (e) { if (e && e.code !== 'declined') showErrors([`Không lưu được file (${e && e.code || 'lỗi'}).`]); }
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  return fname;
}

exportBtn.onclick = async () => {
  if (recording) return;
  const [w, h] = FORMATS[FORMAT].size;
  const codecs = await pickCodecs(w, h);
  setMode(false); mb = 0; pause();
  forceSize = [w, h]; resize();
  recCancelled = false; recording = true; syncButtons(); $('recNote').style.display = 'block';
  const started = performance.now();
  let res = null, err = null;
  try { res = codecs ? await exportFast(codecs) : await exportRealtime(); }
  catch (e) { err = e; }
  recording = false; forceSize = null; resize(); $('recNote').style.display = 'none';
  t = 0; dirty = true; syncButtons();
  if (err) { showErrors([`Không xuất được video: ${err.message || err}`]); return; }
  if (!res) { info.textContent = 'Đã hủy xuất video.'; return; }
  const fname = await saveVideo(res.blob, res.ext);
  info.textContent = `Đã xuất ${fname} (${(res.blob.size / 1048576).toFixed(1)} MB, ${res.note}) trong ${Math.round((performance.now() - started) / 1000)} giây.`;
};
// Hủy giữa chừng: dừng dựng / dừng quay, không lưu file.
$('recCancel').onclick = () => {
  if (!recording) return;
  recCancelled = true; playing = false;
  if (recDone) { const f = recDone; recDone = null; f(); }
};
