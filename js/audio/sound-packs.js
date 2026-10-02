'use strict';
// Sound packs. Each pack may define: lift, move(e, kind), land, capture, drop, check, mate.
// Missing hooks fall back to the "classic" pack. e.p is the piece type (k a e h r c p), e.d the move duration.
// Heavier pieces sound lower: this factor scales each pack's base pitch.
const PF = { k: 0.8, r: 0.9, h: 1, e: 0.97, c: 1.06, a: 1.12, p: 1.25 };
const pf = e => PF[e && e.p] || 1;

function knock(n, freq, vol, bright) {
  hiss(n, { len: 0.12, pow: 6, f: bright, q: 1.3, v: vol });
  tone(n, { f: freq, f2: freq * 0.4, v: vol * 0.45, d: 0.12 });
}

const SOUND_PACKS = {
  classic: {
    name: 'Gỗ cổ điển',
    lift(e, n) { hiss(n, { len: 0.05, pow: 4, f: 2600, q: 2, v: 0.22 }); },
    move(e, n, kind) {
      const d = Math.max(0.3, e.d || 0.6);
      if (kind === 'whoosh') swell(n, { len: d, f: 350, f2: 1900, f3: 500, q: 1.6, v: 0.28, attack: 0.45, pow: 0.2 });
      else swell(n, { len: d, f: 700, f2: 1100, q: 0.9, v: e.p === 'r' ? 0.32 : 0.22, attack: 0.3, pow: 0.4 });
    },
    land(e, n) { knock(n, 230 * pf(e), 0.9, 1500); },
    capture(e, n) { const f = 230 * pf(e); knock(n, f, 1.1, 1300); knock(n + 0.045, f * 1.25, 0.7, 2200); hiss(n, { len: 0.08, pow: 3, type: 'highpass', f: 3000, v: 0.35 }); },
    drop(e, n) { const f = 160 * pf(e); knock(n, f, 0.6, 800); knock(n + 0.09, f * 1.1, 0.25, 1000); knock(n + 0.15, f * 1.2, 0.12, 1100); },
    check(e, n) { [[440, 0.16, 1.6], [660, 0.1, 1.2], [1110, 0.06, 0.8], [1570, 0.03, 0.6]].forEach(([f, v, d]) => tone(n, { f, v, a: 0.01, d })); },
    mate(e, n) { tone(n, { f: 80, f2: 32, v: 0.7, d: 1.4 }); hiss(n, { len: 0.9, pow: 3, type: 'lowpass', f: 500, v: 0.5 }); }
  },

  stone: {
    name: 'Gỗ gõ bàn đá',
    land(e, n) {
      const p = pf(e);
      hiss(n, { len: 0.025, pow: 3, type: 'highpass', f: 3500, v: 0.7 });
      sendReverb(tone(n, { f: 1850 * p, f2: 1500 * p, v: 0.22, d: 0.06 }), 0.15);
      tone(n, { f: 150 * p, f2: 70, v: 0.5, d: 0.09 });
    },
    capture(e, n) {
      this.land(e, n); this.land({ p: 'p' }, n + 0.05);
      sendReverb(hiss(n, { len: 0.12, pow: 2, type: 'highpass', f: 2500, v: 0.45 }), 0.3);
    },
    drop(e, n) { this.land(e, n); hiss(n + 0.08, { len: 0.02, pow: 3, type: 'highpass', f: 4000, v: 0.3 }); hiss(n + 0.13, { len: 0.015, pow: 3, type: 'highpass', f: 4000, v: 0.15 }); },
    check(e, n) { [0, 0.16].forEach(dt => sendReverb(tone(n + dt, { f: 1760, v: 0.13, d: 0.45 }), 0.35)); },
    mate(e, n) { tone(n, { f: 110, f2: 45, v: 0.8, d: 0.9 }); sendReverb(tone(n, { f: 1320, v: 0.12, d: 1.6 }), 0.5); }
  },

  woodblock: {
    name: 'Mõ gỗ',
    lift() {},
    land(e, n) {
      const f = 560 * pf(e);
      hiss(n, { len: 0.03, pow: 2, f, q: 18, v: 2.6 });
      tone(n, { f, type: 'triangle', v: 0.3, d: 0.12 });
      tone(n, { f: f * 2.7, v: 0.05, d: 0.05 });
    },
    capture(e, n) { this.land(e, n); this.land({ p: 'k' }, n + 0.07); sendReverb(tone(n + 0.07, { f: 380, type: 'triangle', v: 0.2, d: 0.25 }), 0.3); },
    drop(e, n) { const f = 420 * pf(e); tone(n, { f, type: 'triangle', v: 0.22, d: 0.1 }); tone(n + 0.1, { f: f * 1.05, type: 'triangle', v: 0.1, d: 0.08 }); },
    check(e, n) { [0, 0.12, 0.24].forEach(dt => { hiss(n + dt, { len: 0.03, pow: 2, f: 760, q: 18, v: 2.4 }); tone(n + dt, { f: 760, type: 'triangle', v: 0.25, d: 0.1 }); }); },
    mate(e, n) { sendReverb(tone(n, { f: 300, type: 'triangle', v: 0.5, d: 0.6 }), 0.6); tone(n, { f: 75, f2: 40, v: 0.6, d: 1 }); }
  },

  porcelain: {
    name: 'Sứ ngọc',
    lift(e, n) { hiss(n, { len: 0.02, pow: 3, type: 'highpass', f: 5000, v: 0.15 }); },
    move(e, n, kind) { const d = Math.max(0.3, e.d || 0.6); swell(n, { len: d, f: 2500, f2: 4000, q: 2, v: kind === 'whoosh' ? 0.12 : 0.07, attack: 0.5 }); },
    land(e, n) {
      const f = 2300 * pf(e);
      hiss(n, { len: 0.015, pow: 3, type: 'highpass', f: 4000, v: 0.35 });
      sendReverb(tone(n, { f, v: 0.1, d: 0.4 }), 0.35); tone(n, { f: f * 1.51, v: 0.05, d: 0.25 }); tone(n, { f: 180 * pf(e), f2: 90, v: 0.25, d: 0.07 });
    },
    capture(e, n) { this.land(e, n); sendReverb(tone(n + 0.05, { f: 3100, v: 0.08, d: 0.5 }), 0.4); hiss(n, { len: 0.1, pow: 2, type: 'highpass', f: 6000, v: 0.25 }); },
    drop(e, n) { [0, 0.07, 0.12].forEach((dt, i) => tone(n + dt, { f: 2000 - i * 150, v: 0.08 / (i + 1), d: 0.2 })); },
    check(e, n) { [880, 1320, 2640].forEach((f, i) => sendReverb(tone(n + i * 0.02, { f, v: 0.1 / (i + 1), a: 0.005, d: 1.4 }), 0.5)); },
    mate(e, n) { [1760, 1480, 1175, 880].forEach((f, i) => sendReverb(tone(n + i * 0.18, { f, v: 0.1, d: 1.2 }), 0.6)); tone(n, { f: 70, f2: 35, v: 0.5, d: 1.4 }); }
  },

  cinematic: {
    name: 'Điện ảnh',
    lift(e, n) { hiss(n, { len: 0.05, pow: 3, f: 3000, q: 2, v: 0.15 }); },
    move(e, n, kind) { const d = Math.max(0.35, e.d || 0.6); sendReverb(swell(n, { len: d, f: 250, f2: 2200, f3: 400, q: 1.2, v: kind === 'whoosh' ? 0.4 : 0.3, attack: 0.6, pow: 0.1 }), 0.3); },
    land(e, n) {
      const p = pf(e);
      sendReverb(tone(n, { f: 95 * p, f2: 38, v: 0.8, d: 0.3 }), 0.25);
      hiss(n, { len: 0.04, pow: 3, f: 2200, q: 1, v: 0.5 });
    },
    capture(e, n) {
      sendReverb(tone(n, { f: 70, f2: 28, v: 1, d: 0.7 }), 0.5);
      sendReverb(hiss(n, { len: 0.5, pow: 3, type: 'lowpass', f: 900, v: 0.6 }), 0.4);
      hiss(n, { len: 0.06, pow: 2, type: 'highpass', f: 2500, v: 0.5 });
    },
    drop(e, n) { tone(n, { f: 120, f2: 60, v: 0.4, d: 0.15 }); hiss(n, { len: 0.03, pow: 3, f: 1800, v: 0.25 }); },
    check(e, n) {
      [55, 110, 165].forEach(f => { const o = actx.createOscillator(), fl = actx.createBiquadFilter(), g = actx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(200, n); fl.frequency.exponentialRampToValueAtTime(2400, n + 0.25); fl.frequency.exponentialRampToValueAtTime(300, n + 1.3); env(g, n, 0.07, 0.05, 1.3); o.connect(fl).connect(g); out(g); sendReverb(g, 0.4); o.start(n); o.stop(n + 1.45); });
    },
    mate(e, n) { sendReverb(tone(n, { f: 60, f2: 24, v: 1, d: 2 }), 0.7); sendReverb(hiss(n, { len: 1.4, pow: 2, type: 'lowpass', f: 600, v: 0.7 }), 0.6); }
  },

  minimal: {
    name: 'Tối giản',
    lift() {}, move() {},
    land(e, n) { tone(n, { f: 660 * pf(e), v: 0.18, a: 0.004, d: 0.09 }); },
    capture(e, n) { tone(n, { f: 520, v: 0.18, d: 0.08 }); tone(n + 0.07, { f: 780, v: 0.18, d: 0.12 }); },
    drop(e, n) { tone(n, { f: 400, v: 0.08, d: 0.06 }); },
    check(e, n) { tone(n, { f: 880, v: 0.16, d: 0.14 }); tone(n + 0.15, { f: 660, v: 0.16, d: 0.2 }); },
    mate(e, n) { [880, 740, 587].forEach((f, i) => tone(n + i * 0.16, { f, v: 0.18, d: 0.3 })); }
  }
};
let SOUND_PACK = 'classic';

// Timeline event name -> pack hook.
const HOOK = { lift: 'lift', slide: 'move', whoosh: 'move', clack: 'land', capture: 'capture', drop: 'drop', check: 'check', boom: 'mate' };
// at: thời điểm phát theo đồng hồ của actx (mặc định là ngay bây giờ; khi dựng âm thanh offline thì là e.t).
function playSfx(e, at) {
  if (!actx) return;
  const hook = HOOK[e.s]; if (!hook) return;
  const pack = SOUND_PACKS[SOUND_PACK], fn = pack[hook] ? pack : SOUND_PACKS.classic;
  try { fn[hook].call(fn, e, at == null ? actx.currentTime : at, e.s); } catch (err) {}
}
function fire(prev, t) { if (!actx || muted) return; for (const e of TL.sounds) if (prev < e.t && t >= e.t) playSfx(e); }

// A short demo phrase: slide and land, jump and capture, captured piece hits the table, check.
function previewPack() {
  ensureAudio(); if (!actx) return;
  const seq = [[0, { s: 'lift', p: 'r' }], [40, { s: 'slide', p: 'r', d: 0.5 }], [560, { s: 'clack', p: 'r' }],
    [1000, { s: 'lift', p: 'h' }], [1040, { s: 'whoosh', p: 'h', d: 0.8 }], [1860, { s: 'capture', p: 'h' }],
    [2600, { s: 'drop', p: 'p' }], [3100, { s: 'check' }]];
  seq.forEach(([ms, e]) => setTimeout(() => playSfx(e), ms));
}
