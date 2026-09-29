'use strict';
// Audio engine: one master bus so the exporter can record everything, plus small synth helpers
// that the sound packs are built from. All sounds are synthesized, no audio files needed.
let actx = null, master = null, reverbIn = null, muted = false, recDest = null;

function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; return; }
    master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
  }
  if (actx.state === 'suspended') actx.resume();
}
const out = node => node.connect(master);

// Short generated room reverb, created on first use.
function sendReverb(node, amount) {
  if (!reverbIn) {
    const conv = actx.createConvolver(), len = Math.floor(actx.sampleRate * 1.8), buf = actx.createBuffer(2, len, actx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    conv.buffer = buf; reverbIn = actx.createGain(); reverbIn.connect(conv); out(conv);
  }
  const g = actx.createGain(); g.gain.value = amount; node.connect(g); g.connect(reverbIn);
}
function noise(len, pow) {
  const buf = actx.createBuffer(1, Math.max(1, Math.floor(actx.sampleRate * len)), actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, pow);
  const s = actx.createBufferSource(); s.buffer = buf; return s;
}
function env(g, n, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), n + attack); g.gain.exponentialRampToValueAtTime(0.0001, n + attack + decay);
}
// A pitched oscillator hit. Returns its gain node so callers can add reverb.
function tone(n, { f, f2, type = 'sine', v = 0.2, a = 0.003, d = 0.2 }) {
  const o = actx.createOscillator(), g = actx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f, n); if (f2) o.frequency.exponentialRampToValueAtTime(f2, n + a + d);
  env(g, n, v, a, d); o.connect(g); out(g); o.start(n); o.stop(n + a + d + 0.05); return g;
}
// A filtered noise burst (clicks, cracks, swooshes).
function hiss(n, { len = 0.1, pow = 5, type = 'bandpass', f = 1500, f2, q = 1, v = 0.5 }) {
  const s = noise(len, pow), fl = actx.createBiquadFilter(), g = actx.createGain();
  fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, n); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, n + len);
  g.gain.value = v; s.connect(fl).connect(g); out(g); s.start(n); return g;
}
// Noise swell with an attack/decay envelope (slides and swooshes).
function swell(n, { len, f, f2, f3, q = 1, v = 0.25, attack = 0.4, pow = 0.3 }) {
  const s = noise(len, pow), fl = actx.createBiquadFilter(), g = actx.createGain();
  fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(f, n);
  if (f3) { fl.frequency.exponentialRampToValueAtTime(f2, n + len * 0.5); fl.frequency.exponentialRampToValueAtTime(f3, n + len); }
  else if (f2) fl.frequency.exponentialRampToValueAtTime(f2, n + len);
  env(g, n, v, len * attack, len * (1 - attack)); s.connect(fl).connect(g); out(g); s.start(n); return g;
}
