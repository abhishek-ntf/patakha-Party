import { envAD, sweep } from './SoundSynth.js';
import { lerp } from '../utils/math.js';

/*
 * Every sound is a recipe: play(a, o, v) builds nodes on the Voice `v`.
 *   a = { ctx, synth, reverbIn, duck(depth, seconds) }
 *   o = per-play options ({ delay, duration, size, kind, variant, intensity ... })
 * Looping sounds (fuse, sparkler, anar, spinner) keep running until voice.stop() and expose
 * voice.set({...}) so the visual side can drive them every frame.
 * Nothing here uses audio files - all sounds are synthesised from oscillators, noise buffers,
 * filters and envelopes.
 */

const T = (a, o) => a.ctx.currentTime + (o.delay || 0);

/** Filtered noise with an AD envelope (optionally sweeping the filter). */
function noiseHit(a, v, t, { kind = 'white', type = 'bandpass', f0 = 2000, f1 = f0, q = 1, peak = 0.4, attack = 0.004, decay = 0.1 }) {
  const S = a.synth;
  const n = S.noise(v, kind, { when: t });
  const f = S.filter(v, type, f0, q);
  if (f1 !== f0) sweep(f.frequency, t, f0, f1, attack + decay);
  const g = S.gain(v, 0);
  envAD(g.gain, t, peak, attack, decay);
  S.chain(n, f, g);
  g.connect(v.out);
  n.stop(t + attack + decay + 0.06);
}

/** Oscillator with a pitch sweep and AD envelope. */
function toneHit(a, v, t, { type = 'sine', f0 = 200, f1 = f0, peak = 0.4, attack = 0.004, decay = 0.1 }) {
  const S = a.synth;
  const o = S.osc(v, type, f0, t);
  sweep(o.frequency, t, f0, f1, attack + decay);
  const g = S.gain(v, 0);
  envAD(g.gain, t, peak, attack, decay);
  S.chain(o, g);
  g.connect(v.out);
  o.stop(t + attack + decay + 0.06);
}

const fadeIn = (v, t, s = 0.05) => {
  v.out.gain.setValueAtTime(0.0001, t);
  v.out.gain.linearRampToValueAtTime(1, t + s);
};

// ------------------------------------------------------------------ UI sounds
function click(a, o, v) {
  const t = T(a, o);
  toneHit(a, v, t, { type: 'triangle', f0: 880, f1: 1320, peak: 0.22, attack: 0.004, decay: 0.07 });
  a.synth.click(v, t, { gain: 0.1, rate: 1.4 });
  v.finishAfter(0.2);
}

function select(a, o, v) {
  const t = T(a, o);
  toneHit(a, v, t, { f0: 240, f1: 130, peak: 0.34, attack: 0.003, decay: 0.07 });
  a.synth.click(v, t, { gain: 0.18, rate: 0.9, variant: 6 });
  a.synth.bell(v, t + 0.03, 784, 0.1, 0.9);
  a.synth.reverbSend(v, a.reverbIn, 0.3);
  v.finishAfter(1);
}

function whoosh(a, o, v) {
  const t = T(a, o);
  noiseHit(a, v, t, { type: 'bandpass', f0: 400, f1: 2600, q: 1.1, peak: 0.22, attack: 0.12, decay: 0.28 });
  v.finishAfter(0.6);
}

function levelUp(a, o, v) {
  const t = T(a, o);
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => a.synth.bell(v, t + i * 0.09, f, 0.16, 1.5));
  for (let i = 0; i < 10; i++) a.synth.click(v, t + 0.3 + i * 0.05, { gain: 0.06, rate: 2 + Math.random(), variant: 12 });
  a.synth.reverbSend(v, a.reverbIn, 0.45);
  v.finishAfter(2);
}

function star(a, o, v) {
  const t = T(a, o);
  a.synth.bell(v, t, 988, 0.14, 1.1);
  a.synth.bell(v, t + 0.09, 1319, 0.14, 1.3);
  a.synth.reverbSend(v, a.reverbIn, 0.35);
  v.finishAfter(1.6);
}

// ----------------------------------------------------------------- ignition
function match(a, o, v) {
  const t = T(a, o);
  // scratch, flare, then a faint burn
  noiseHit(a, v, t, { type: 'bandpass', f0: 3200, f1: 1400, q: 1.6, peak: 0.22, attack: 0.01, decay: 0.2 });
  a.synth.click(v, t + 0.05, { gain: 0.2, variant: 9 });
  noiseHit(a, v, t + 0.2, { type: 'highpass', f0: 1800, peak: 0.3, attack: 0.03, decay: 0.35 });
  noiseHit(a, v, t + 0.25, { kind: 'pink', type: 'lowpass', f0: 1200, peak: 0.1, attack: 0.1, decay: 0.5 });
  v.finishAfter(1);
}

/** Looping fuse sizzle with spitting crackles. */
function fuse(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const n = S.noise(v, 'white');
  const bp = S.filter(v, 'bandpass', 3800, 0.8);
  const g = S.gain(v, 0.07);
  const lfo = S.noise(v, 'pink');
  const lp = S.filter(v, 'lowpass', 18, 0.7);
  const depth = S.gain(v, 0.05);
  S.chain(lfo, lp, depth);
  depth.connect(g.gain);
  S.chain(n, bp, g);
  g.connect(v.out);
  const crack = S.crackle(v, { rate: 26, gain: 0.16, pitchLo: 1, pitchHi: 1.9 });
  fadeIn(v, t);
  v.set = (p) => {
    if (p.intensity != null) crack.rate = 26 * p.intensity;
  };
}

/** Phuljhadi: shimmering sizzle with bright fine crackle. */
function sparkler(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const n = S.noise(v, 'white');
  const hp = S.filter(v, 'highpass', 3500, 0.7);
  const bp = S.filter(v, 'bandpass', 7000, 0.5);
  const g = S.gain(v, 0.13);
  const lfo = S.noise(v, 'pink');
  const lp = S.filter(v, 'lowpass', 35, 0.7);
  const depth = S.gain(v, 0.09);
  S.chain(lfo, lp, depth);
  depth.connect(g.gain);
  S.chain(n, hp, bp, g);
  g.connect(v.out);
  const body = S.noise(v, 'pink');
  const blp = S.filter(v, 'lowpass', 900, 0.7);
  const bg = S.gain(v, 0.03);
  S.chain(body, blp, bg);
  bg.connect(v.out);
  const crack = S.crackle(v, { rate: 55, gain: 0.24, pitchLo: 0.9, pitchHi: 2.2 });
  fadeIn(v, t, 0.08);
  v.set = (p) => {
    if (p.intensity == null) return;
    const i = p.intensity;
    g.gain.setTargetAtTime(0.13 * i, a.ctx.currentTime, 0.1);
    crack.rate = 55 * i;
  };
}

/** Anar: rising fizz that opens into a roaring hiss with sparkling crackles. */
function anar(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const n = S.noise(v, 'white');
  const bp = S.filter(v, 'bandpass', 900, 0.7);
  const hiss = S.gain(v, 0.02);
  S.chain(n, bp, hiss);
  hiss.connect(v.out);
  const r = S.noise(v, 'pink');
  const rl = S.filter(v, 'lowpass', 500, 0.7);
  const rumble = S.gain(v, 0.02);
  S.chain(r, rl, rumble);
  rumble.connect(v.out);
  const crack = S.crackle(v, { rate: 0, gain: 0.26, pitchLo: 0.8, pitchHi: 2 });
  fadeIn(v, t, 0.05);
  const now = () => a.ctx.currentTime;
  v.set = (p) => {
    if (p.intensity == null) return;
    const i = Math.max(0, Math.min(1, p.intensity));
    bp.frequency.setTargetAtTime(900 + i * 3600, now(), 0.08);
    hiss.gain.setTargetAtTime(0.02 + 0.2 * i, now(), 0.08);
    rumble.gain.setTargetAtTime(0.02 + 0.12 * i, now(), 0.1);
    crack.rate = 50 * Math.pow(i, 1.5);
  };
  if (o.intensity != null) v.set({ intensity: o.intensity });
}

const SPINNERS = {
  chakri: { noiseF: [600, 3200], q: 3, tremHz: [3, 14], sawF: [70, 240], sawGain: [0.035, 0.09], crack: [15, 50], square: false },
  zameen: { noiseF: [350, 1800], q: 2, tremHz: [5, 20], sawF: [46, 120], sawGain: [0.05, 0.12], crack: [20, 60], square: true },
};

/** Ground spinners: whirring noise with tremolo at the spin rate, plus a motor-like buzz. */
function spinner(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const c = SPINNERS[o.variant === 'zameen' ? 'zameen' : 'chakri'];
  const n = S.noise(v, 'white');
  const bp = S.filter(v, 'bandpass', c.noiseF[0], c.q);
  const trem = S.gain(v, 0.55);
  const lfo = S.osc(v, 'sine', c.tremHz[0]);
  const lfoDepth = S.gain(v, 0.45);
  S.chain(lfo, lfoDepth);
  lfoDepth.connect(trem.gain);
  const whirr = S.gain(v, 0.06);
  S.chain(n, bp, trem, whirr);
  whirr.connect(v.out);

  const saw = S.osc(v, c.square ? 'square' : 'sawtooth', c.sawF[0]);
  const slp = S.filter(v, 'lowpass', 900, 0.8);
  const buzz = S.gain(v, 0.035);
  S.chain(saw, slp, buzz);
  if (c.square) {
    // amplitude-modulate the square wave for a rough motor buzz
    const am = S.osc(v, 'square', 37);
    const amDepth = S.gain(v, 0.5);
    S.chain(am, amDepth);
    amDepth.connect(buzz.gain);
  }
  buzz.connect(v.out);

  const crack = S.crackle(v, { rate: c.crack[0], gain: 0.22, pitchLo: 0.7, pitchHi: 1.4 });
  fadeIn(v, t, 0.1);
  v.set = (p) => {
    if (p.speed == null) return;
    const s = Math.max(0, Math.min(1, p.speed));
    const now = a.ctx.currentTime;
    bp.frequency.setTargetAtTime(lerp(c.noiseF[0], c.noiseF[1], s), now, 0.06);
    whirr.gain.setTargetAtTime(0.06 + 0.16 * s, now, 0.06);
    lfo.frequency.setTargetAtTime(lerp(c.tremHz[0], c.tremHz[1], s), now, 0.06);
    saw.frequency.setTargetAtTime(lerp(c.sawF[0], c.sawF[1], s), now, 0.06);
    buzz.gain.setTargetAtTime(lerp(c.sawGain[0], c.sawGain[1], s), now, 0.06);
    crack.rate = lerp(c.crack[0], c.crack[1], s);
  };
  v.set({ speed: 0 });
}

// ------------------------------------------------------- rockets and shells
/** Rocket flight: ignition whoosh, roaring burn and a noisy rising whistle (not a pure tone) for `duration` s. */
function rocketFlight(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const dur = o.duration || 1.6;
  noiseHit(a, v, t, { type: 'lowpass', f0: 500, f1: 3000, q: 0.8, peak: 0.5, attack: 0.02, decay: 0.6 });
  S.bang(v, t, { kind: 'tick', gain: 0.35, rate: 0.7 }); // the pop of the motor catching
  // burn roar
  const n = S.noise(v, 'white', { when: t });
  const bp = S.filter(v, 'bandpass', 1400, 0.6);
  const g = S.gain(v, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.24, t + 0.25);
  g.gain.setValueAtTime(0.24, t + dur - 0.2);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
  S.chain(n, bp, g);
  g.connect(v.out);
  n.stop(t + dur + 0.15);
  // whistle = narrow, wavering band of noise sweeping upward, with a quieter octave above
  for (const [mul, level] of [[1, 0.22], [1.9, 0.1]]) {
    const wn = S.noise(v, 'white', { when: t });
    const wf = S.filter(v, 'bandpass', 900 * mul, 22);
    sweep(wf.frequency, t, 900 * mul, 3200 * mul, dur * 0.92);
    const vib = S.osc(v, 'sine', 7 + Math.random() * 3, t);
    const vd = S.gain(v, 60 * mul);
    S.chain(vib, vd);
    vd.connect(wf.frequency);
    const wg = S.gain(v, 0);
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.linearRampToValueAtTime(level, t + 0.3);
    wg.gain.setValueAtTime(level, t + dur - 0.25);
    wg.gain.linearRampToValueAtTime(0.0001, t + dur);
    S.chain(wn, wf, wg);
    wg.connect(v.out);
    wn.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }
  const crack = S.crackle(v, { rate: 40, gain: 0.2, pitchLo: 0.9, pitchHi: 1.8 });
  v.after(() => { crack.rate = 0; }, dur * 1000);
  v.finishAfter(dur + 0.3);
}

/** Sky shot mortar: a muffled cannon thump, breath of air and a soft rising whoosh. */
function mortar(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const dur = o.duration || 1.5;
  S.bang(v, t, { kind: 'bomb', gain: 0.7, rate: 0.62 });
  toneHit(a, v, t, { f0: 90, f1: 38, peak: 0.35, attack: 0.006, decay: 0.3 });
  noiseHit(a, v, t, { type: 'lowpass', f0: 600, q: 0.7, peak: 0.45, attack: 0.004, decay: 0.25 });
  noiseHit(a, v, t + 0.05, { type: 'bandpass', f0: 400, f1: 1800, q: 0.9, peak: 0.1, attack: 0.15, decay: dur * 0.8 });
  S.reverbSend(v, a.reverbIn, 0.4);
  v.finishAfter(dur + 0.6);
}

const BURSTS = {
  rocket: { main: ['crack', 0.95, 1.0], sub: ['bomb', 0.35, 1.3], tail: [22, 0.9, 0.3] },
  shell:  { main: ['shell', 1.0, 1.0], sub: ['crack', 0.5, 0.8], tail: [38, 1.6, 0.32], echo: 0.3 },
  peony:  { main: ['bomb', 0.85, 1.05], sub: ['crack', 0.5, 1.1], tail: [26, 1.1, 0.28] },
  willow: { main: ['crack', 0.7, 0.9], sub: ['tick', 0.4, 1.2], tail: [64, 2.8, 0.22], sizzle: 1.9 },
  ring:   { main: ['crack', 0.95, 1.1], sub: ['tick', 0.5, 1.4], tail: [18, 0.8, 0.26], shine: true },
};

/**
 * Aerial burst: a shock-wave "bang" sample layer (sharp crack + body + rumble), a second layer for
 * depth, a randomly spaced glitter-crackle tail and courtyard echo. Differs per burst kind.
 */
function burst(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const k = BURSTS[o.kind] || BURSTS.peony;
  const size = o.size || 1;
  S.bang(v, t, { kind: k.main[0], gain: k.main[1] * size, rate: k.main[2] * (0.94 + Math.random() * 0.12) });
  S.bang(v, t + 0.012, { kind: k.sub[0], gain: k.sub[1] * size, rate: k.sub[2] * (0.94 + Math.random() * 0.12) });
  toneHit(a, v, t, { f0: 70, f1: 32, peak: 0.16 * size, attack: 0.01, decay: 0.45 }); // faint chest thump
  if (k.echo) S.bang(v, t + k.echo, { kind: 'bomb', gain: 0.3 * size, rate: 0.7 }); // reflection off the far buildings
  if (k.shine) noiseHit(a, v, t + 0.02, { type: 'bandpass', f0: 5000, f1: 2500, q: 2, peak: 0.12, attack: 0.02, decay: 0.5 });
  if (k.sizzle) noiseHit(a, v, t + 0.1, { type: 'highpass', f0: 4500, peak: 0.05, attack: 0.3, decay: k.sizzle });
  const [n, span, g] = k.tail;
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const loud = Math.random() < 0.12 ? 1.8 : 1;
    S.bang(v, t + 0.08 + Math.pow(f, 1.4) * span, {
      kind: 'tick', gain: g * loud * Math.pow(1 - f, 1.1) * (0.4 + Math.random() * 0.9), rate: 1 + Math.random() * 1.1,
    });
  }
  S.reverbSend(v, a.reverbIn, 0.5);
  if (size >= 0.9) a.duck(0.5, 0.9);
  v.finishAfter(Math.max(2.2, span + 0.6, k.echo ? k.echo + 1.4 : 0));
}

// ----------------------------------------------------------------- bombs etc
/** Sutli bomb: one hard shock-wave crack with body and rumble, a thump underneath, echoing off the walls. */
function bomb(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const s = o.size || 1;
  S.bang(v, t, { kind: 'bomb', gain: 1.0 * s, rate: 0.95 + Math.random() * 0.1 });
  S.bang(v, t, { kind: 'crack', gain: 0.55 * s, rate: 0.8 });
  toneHit(a, v, t, { f0: 70, f1: 34, peak: 0.25 * s, attack: 0.006, decay: 0.5 });
  S.bang(v, t + 0.19, { kind: 'bomb', gain: 0.28 * s, rate: 0.6 }); // slap-back from the walls
  S.bang(v, t + 0.34, { kind: 'crack', gain: 0.16 * s, rate: 0.55 });
  S.reverbSend(v, a.reverbIn, 0.6);
  a.duck(0.4, 1.2);
  v.finishAfter(2.2);
}

/** Ladi / garland pop: a dry sharp crack (varied pitch and weight), with a hint of room. */
function snap(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  const size = o.size || 1;
  const big = size > 1.2;
  S.bang(v, t, { kind: big ? 'crack' : 'tick', gain: big ? 0.85 : 0.9, rate: (0.9 + Math.random() * 0.3) / (0.8 + size * 0.2) });
  if (!big && Math.random() < 0.3) S.bang(v, t + 0.004, { kind: 'tick', gain: 0.35, rate: 1.6 }); // double-crack of loose powder
  S.reverbSend(v, a.reverbIn, 0.22);
  v.finishAfter(0.6);
}

/** Pencil cracker pulse: sharp pssht jet that ends in a small crack. */
function pencil(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  noiseHit(a, v, t, { type: 'highpass', f0: 2200, peak: 0.45, attack: 0.01, decay: 0.16 });
  noiseHit(a, v, t, { type: 'bandpass', f0: 6000, f1: 3000, q: 1.2, peak: 0.3, attack: 0.008, decay: 0.14 });
  for (let i = 0; i < 4; i++) S.click(v, t + 0.02 + i * 0.03, { gain: 0.25, rate: 1.2 + Math.random() * 0.8 });
  S.bang(v, t + 0.13, { kind: 'tick', gain: 0.6, rate: 1.1 + Math.random() * 0.3 });
  S.reverbSend(v, a.reverbIn, 0.2);
  v.finishAfter(0.7);
}

/** Pop-pop snapper: tiny, dry, high-pitched pop. */
function snapper(a, o, v) {
  const S = a.synth;
  const t = T(a, o);
  S.bang(v, t, { kind: 'tick', gain: 0.55, rate: 1.35 + Math.random() * 0.5 });
  noiseHit(a, v, t, { type: 'bandpass', f0: 4500, q: 1, peak: 0.18, attack: 0.0005, decay: 0.015 });
  S.reverbSend(v, a.reverbIn, 0.12);
  v.finishAfter(0.4);
}

/** name -> { play, max (concurrent voices), cd (ms between plays), priority } */
/**
 * name -> { play, max (concurrent voices), cd (ms between plays), priority,
 *           loop (keeps running until stopped), delayed (arrives after the speed-of-sound delay) }
 */
export const SOUNDS = {
  click:       { play: click, max: 4, cd: 30 },
  select:      { play: select, max: 2, cd: 60 },
  whoosh:      { play: whoosh, max: 2, cd: 120 },
  levelUp:     { play: levelUp, max: 1, priority: true },
  star:        { play: star, max: 3 },
  match:       { play: match, max: 2, cd: 200, priority: true },
  fuse:        { play: fuse, max: 4, loop: true },
  sparkler:    { play: sparkler, max: 3, loop: true },
  anar:        { play: anar, max: 3, loop: true },
  spinner:     { play: spinner, max: 3, loop: true },
  rocketFlight: { play: rocketFlight, max: 5 },
  mortar:      { play: mortar, max: 4, cd: 60, delayed: true },
  burst:       { play: burst, max: 6, cd: 40, priority: true, delayed: true },
  bomb:        { play: bomb, max: 3, priority: true, delayed: true },
  snap:        { play: snap, max: 14, cd: 25, delayed: true },
  pencil:      { play: pencil, max: 8, cd: 50, delayed: true },
  snapper:     { play: snapper, max: 10, cd: 30, delayed: true },
};
