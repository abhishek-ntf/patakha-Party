// Headless smoke test for the audio engine using a strict mock of the Web Audio API.
// It runs every sound recipe + the music scheduler, rejects invalid AudioParam calls
// (NaN, non-positive exponential ramps...) and checks that every node is released.
import assert from 'node:assert/strict';

let nowMs = 0;
globalThis.performance = { now: () => nowMs };
const timers = [];
let timerId = 1;
globalThis.setTimeout = (fn, ms = 0) => { const id = timerId++; timers.push({ id, at: nowMs + ms, fn, every: 0 }); return id; };
globalThis.setInterval = (fn, ms = 0) => { const id = timerId++; timers.push({ id, at: nowMs + ms, fn, every: ms }); return id; };
globalThis.clearTimeout = globalThis.clearInterval = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
function advanceTimers(ms) {
  const end = nowMs + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    nowMs = t.at;
    if (t.every) t.at += t.every; else timers.shift();
    t.fn();
  }
  nowMs = end;
}

const finite = (v, what) => assert.ok(Number.isFinite(v), `${what} must be finite, got ${v}`);
let created = 0;
let released = 0;

class Param {
  constructor(v = 0) { this.value = v; this.isParam = true; }
  setValueAtTime(v, t) { finite(v, 'setValueAtTime value'); finite(t, 'time'); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { finite(v, 'linearRamp value'); finite(t, 'time'); return this; }
  exponentialRampToValueAtTime(v, t) { finite(v, 'expRamp value'); assert.ok(v > 0, `exponentialRamp needs value > 0 (got ${v})`); finite(t, 'time'); return this; }
  setTargetAtTime(v, t, tc) { finite(v, 'target'); finite(t, 'time'); assert.ok(tc > 0, 'timeConstant > 0'); return this; }
  cancelScheduledValues(t) { finite(t, 'time'); return this; }
}
class Node {
  constructor(ctx, params = {}) { this.ctx = ctx; this.out = new Set(); this.dead = false; created++; for (const [k, v] of Object.entries(params)) this[k] = new Param(v); }
  connect(d) { assert.ok(d, 'connect target missing'); this.out.add(d); return d; }
  disconnect() { if (!this.dead) { this.dead = true; released++; } }
}
class Source extends Node {
  start(when = 0) { finite(when, 'start time'); this.startAt = when; this.started = true; this.ctx.sources.push(this); }
  stop(when) { if (!this.started) throw new Error('InvalidStateError: stop before start'); }
}
class Buf { constructor(ch, len, sr) { this.numberOfChannels = ch; this.length = len; this.sampleRate = sr; this.duration = len / sr; this.d = Array.from({ length: ch }, () => new Float32Array(len)); } getChannelData(i) { return this.d[i]; } }
class Ctx {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'suspended'; this.destination = new Node(this); this.sources = []; }
  resume() { this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createGain() { return new Node(this, { gain: 1 }); }
  createStereoPanner() { return new Node(this, { pan: 0 }); }
  createBiquadFilter() { return new Node(this, { frequency: 350, Q: 1, gain: 0, detune: 0 }); }
  createDynamicsCompressor() { return new Node(this, { threshold: 0, knee: 0, ratio: 0, attack: 0, release: 0 }); }
  createConvolver() { return new Node(this); }
  createOscillator() { const o = new Source(this, { frequency: 440, detune: 0 }); return o; }
  createBufferSource() { return new Source(this, { playbackRate: 1 }); }
  createBuffer(ch, len, sr) { return new Buf(ch, len, sr); }
}
const ctxs = [];
globalThis.window = globalThis;
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
globalThis.AudioContext = class extends Ctx { constructor() { super(); ctxs.push(this); } };

const { AudioManager } = await import('../src/audio/AudioManager.js');
const { SOUNDS } = await import('../src/audio/SoundEffects.js');

const settings = { masterVolume: 0.8, sfxVolume: 0.9, musicVolume: 0.55, muted: false, music: true };
const handlers = [];
const state = { settings, on(t, fn) { handlers.push(fn); return () => {}; }, setSetting(k, v) { settings[k] = v; handlers.forEach((h) => h(k, v)); } };
const audio = new AudioManager(state);
audio.setCamera({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5, 15, 1] } });
audio.installUnlock({ addEventListener() {}, removeEventListener() {} });

assert.equal(audio.play('click'), null, 'no sound before the first interaction');
audio.unlock();
await Promise.resolve();
await Promise.resolve();
assert.ok(audio.ready, 'audio ready after unlock');
const ctx = ctxs[0];

// --- realism checks on the pre-rendered bang buffers
for (const [kind, list] of Object.entries(audio.synth.bangs)) {
  assert.ok(list.length >= 4, `${kind}: several variants`);
  for (const b of list) {
    const d = b.getChannelData(0);
    const sr = b.sampleRate;
    let early = 0; let late = 0; let peakAt = 0; let peak = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) { peak = a; peakAt = i; }
      if (i < sr * 0.006) early = Math.max(early, a);
      if (i > sr * 0.08 && i < sr * 0.12) late += a * a;
    }
    assert.ok(peak <= 1.0001 && peak > 0.9, `${kind}: normalised`);
    assert.ok(peakAt < sr * 0.006, `${kind}: peak inside the first 6 ms (sharp shock front)`);
    assert.ok(early > 0.85, `${kind}: strong transient`);
    assert.ok(Number.isFinite(late), `${kind}: finite tail`);
  }
}
assert.ok(audio.synth.impulse.numberOfChannels === 2, 'stereo courtyard reverb');

function run(seconds) {
  const step = 0.05;
  for (let t = 0; t < seconds; t += step) {
    ctx.currentTime += step;
    advanceTimers(step * 1000);
    for (const s of ctx.sources) {
      if (s.onended && !s.endedFired && s.buffer && !s.loop && ctx.currentTime >= s.startAt + s.buffer.duration / (s.playbackRate.value || 1)) { s.endedFired = true; s.onended(); }
    }
  }
}

const opts = {
  rocketFlight: { duration: 1.7 }, mortar: { duration: 1.4 }, burst: { kind: 'shell', size: 1.3 },
  spinner: { variant: 'zameen' }, anar: { intensity: 0.5 },
};
const loops = new Set(['fuse', 'sparkler', 'anar', 'spinner']);
const results = [];
for (const name of Object.keys(SOUNDS)) {
  ctx.currentTime += 1;
  advanceTimers(1000);
  const v = audio.play(name, { x: 3, y: 1, z: -8, ...(opts[name] || {}) });
  assert.ok(v, `sound "${name}" should play`);
  if (loops.has(name)) {
    run(0.3);
    v.set({ intensity: 1, speed: 1 });
    v.set({ intensity: 0.2, speed: 0.1 });
    v.setPos(-4, 0, -3);
    run(0.5);
    v.stop(0.1);
  }
  results.push(name);
  run(2.5);
}
for (const kind of ['rocket', 'shell', 'peony', 'willow', 'ring']) { ctx.currentTime += 1; advanceTimers(1000); assert.ok(audio.play('burst', { kind, x: 0, y: 30, z: -50, size: 1 }), `burst ${kind}`); run(4); }
for (const variant of ['chakri', 'zameen']) { const v = audio.play('spinner', { variant }); assert.ok(v); v.set({ speed: 0.7 }); run(0.5); v.stop(); run(0.5); }

// optional real recordings replace the synthesised sound
audio.samples = { bomb: [{ duration: 1.2 }], 'burst:ring': [{ duration: 2 }] };
{
  const v = audio.play('bomb', { x: 2, z: -6 });
  assert.ok(v && v.sampled, 'sample route used for bomb');
  advanceTimers(200);
  const b = audio.play('burst', { x: 0, y: 30, z: -60, kind: 'ring', size: 1 });
  assert.ok(b && b.sampled, 'sample route used for burst:ring');
  advanceTimers(200);
  const f = audio.play('burst', { x: 0, y: 30, z: -60, kind: 'peony', size: 1 });
  assert.ok(f && !f.sampled, 'synth fallback when no recording exists for that kind');
  run(4);
}
audio.samples = {};

// stress: many pops at once must be rate / voice limited, never throw
let peak = 0;
for (let i = 0; i < 60; i++) { audio.play('snap', { x: i - 30, z: -5 }); peak = Math.max(peak, audio.counts.get('snap')); run(0.05); }
assert.ok(peak <= 14, `snap concurrency stays within its limit (peak ${peak})`);
for (let i = 0; i < 5; i++) audio.play('snap'); // same-instant spam is rate limited
assert.ok(audio.counts.get('snap') <= 14);
run(3);

// volume, mute and music controls
audio.setVolume('master', 0.3); audio.setVolume('sfx', 0.2); audio.setVolume('music', 0.9);
audio.setMuted(true); assert.equal(audio.muted, true); audio.toggleMuted(); assert.equal(audio.muted, false);
audio.onLaunch({ x: 0, y: 1, z: -2, flight: 1.5 });
audio.onBurst({ x: 0, y: 30, z: -50, type: 'willow', size: 1 });
audio.onBurst({ x: 0, y: 30, z: -50, tag: 'skyshot', type: 'ring', size: 1.3 });
audio.onFountain({ x: 1, z: 2 });
run(40); // music scheduler
audio.setMusicEnabled(false); run(2);
audio.setMusicEnabled(true); run(5);
audio.setMusicEnabled(false); run(2);

audio.stopAll(); run(6);
assert.equal(audio.voices.size, 0, 'all voices released');
for (const [n, c] of audio.counts) assert.equal(c, 0, `voice counter for ${n} returned to 0`);
audio.dispose();
const pending = timers.filter((t) => t.every).length;
console.log(`OK: ${results.length} sounds + 5 burst kinds + music; nodes created ${created}, released ${released}; leftover intervals ${pending}`);
assert.equal(pending, 0, 'no schedulers left running after dispose');
