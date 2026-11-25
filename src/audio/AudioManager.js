import { SoundSynth, Voice } from './SoundSynth.js';
import { SOUNDS } from './SoundEffects.js';
import { MusicManager } from './MusicManager.js';
import { clamp } from '../utils/math.js';

const MAX_VOICES = 56;
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'mousedown', 'keydown'];
const curve = (v) => v * v; // perceptual volume curve

/**
 * Web Audio engine. Owns the AudioContext, the mixer (sfx / music / reverb buses, master
 * limiter), volume + mute state, voice limiting and spatial panning.
 * The context is only created after the first user interaction (browser autoplay policy).
 */
export class AudioManager {
  constructor(state) {
    this.state = state;
    this.ctx = null;
    this.synth = null;
    this.music = null;
    this.ready = false;
    this.camera = null;
    this.voices = new Set();
    this.counts = new Map();
    this.lastPlay = new Map();
    this.samples = {}; // optional real recordings from public/sounds (see manifest.json)
    this._listeners = [];
    this._offSettings = null;
    this._onVisibility = () => this._visibility();
  }

  get settings() {
    return this.state.settings;
  }

  get muted() {
    return !!this.settings.muted;
  }

  /** Registers the first-interaction listeners (removed again on dispose). */
  installUnlock(target = window) {
    for (const ev of UNLOCK_EVENTS) {
      const h = () => this.unlock();
      target.addEventListener(ev, h, { passive: true });
      this._listeners.push([target, ev, h]);
    }
    document.addEventListener('visibilitychange', this._onVisibility);
    this._offSettings = this.state.on('settings', (key) => {
      if (key === 'reset') this._applyAll();
    });
  }

  setCamera(camera) {
    this.camera = camera;
  }

  /** Creates / resumes the context inside a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch (e) {
        console.warn('Audio is unavailable', e);
        return;
      }
      this._build();
    }
    if (this.ctx.state !== 'running') {
      const p = this.ctx.resume();
      if (p && p.then) p.then(() => this._onRunning()).catch(() => {});
    } else {
      this._onRunning();
    }
  }

  _build() {
    const ctx = this.ctx;
    this.synth = new SoundSynth(ctx);

    // master chain: buses -> master gain -> compressor/limiter -> output
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 14;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.synth.impulse;
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverbIn.connect(this.reverb);
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.sfxBus);

    this.musicDuck = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicIn = ctx.createGain(); // music sources connect here
    this.musicIn.connect(this.musicDuck);
    this.musicDuck.connect(this.musicBus);
    this.musicBus.connect(this.master);

    this.music = new MusicManager(this);
    this._applyAll();
    this._loadSamples();
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this._onRunning();
      else this.ready = false;
    };
  }

  _onRunning() {
    if (this.ready) return;
    this.ready = true;
    // keep listeners installed: iOS can interrupt the context and needs another gesture to resume
    this._applyAll();
    if (this.settings.music) this.music.start();
  }

  _visibility() {
    if (!this.ctx) return;
    if (document.hidden) {
      this.ctx.suspend().catch(() => {});
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // ----------------------------------------------------------------- volume
  getVolume(kind) {
    const s = this.settings;
    return kind === 'master' ? s.masterVolume : kind === 'sfx' ? s.sfxVolume : s.musicVolume;
  }

  setVolume(kind, value) {
    const key = kind === 'master' ? 'masterVolume' : kind === 'sfx' ? 'sfxVolume' : 'musicVolume';
    this.state.setSetting(key, clamp(value, 0, 1));
    this._applyAll();
  }

  setMuted(muted) {
    this.state.setSetting('muted', !!muted);
    this._applyAll();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMusicEnabled(on) {
    this.state.setSetting('music', !!on);
    if (!this.music) return;
    if (on && this.ready) this.music.start();
    else this.music.pause();
  }

  _applyAll() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    const set = (node, v) => node.gain.setTargetAtTime(v, t, 0.03);
    set(this.master, this.muted ? 0 : curve(s.masterVolume) * 0.9);
    set(this.sfxBus, curve(s.sfxVolume));
    set(this.musicBus, curve(s.musicVolume) * 0.5);
  }

  /** Briefly lowers the music so big bangs stay clear. */
  duck(depth = 0.5, seconds = 0.8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.02);
    g.setTargetAtTime(1, t + seconds, 0.4);
  }

  // ---------------------------------------------------------------- playback
  _spatial(o) {
    if (o.x == null || !this.camera) return { pan: 0, level: 1, cutoff: 20000, delay: 0 };
    const e = this.camera.matrixWorld.elements;
    const dx = o.x - e[12];
    const dy = (o.y || 0) - e[13];
    const dz = o.z - e[14];
    const dist = Math.hypot(dx, dy, dz) || 1;
    const pan = clamp(((dx * e[0] + dy * e[1] + dz * e[2]) / dist) * 1.3, -1, 1);
    const level = clamp(1 / (1 + dist / 45), 0.3, 1);
    // air swallows the highs with distance; sound travels at ~343 m/s
    const cutoff = clamp(16000 / (1 + dist / 22), 2200, 16000);
    const delay = Math.min(dist / 343, 0.45);
    return { pan, level, cutoff, delay };
  }

  /**
   * Plays a named sound. Returns the Voice (call .stop(), .set({...}), .setPos(x,y,z)) or null
   * when audio is not unlocked yet or the sound was rate / voice limited.
   */
  play(name, o = {}) {
    if (!this.ctx || !this.ready) return null;
    const def = SOUNDS[name];
    if (!def) {
      console.warn(`Unknown sound: ${name}`);
      return null;
    }
    const now = performance.now();
    if (def.cd && now - (this.lastPlay.get(name) || 0) < def.cd) return null;
    const count = this.counts.get(name) || 0;
    if (def.max && count >= def.max) return null;
    if (this.voices.size >= MAX_VOICES && !def.priority) return null;
    this.lastPlay.set(name, now);

    const sp = this._spatial(o);
    const v = new Voice(this.ctx, this.sfxBus, { pan: sp.pan, level: sp.level * (o.gain == null ? 1 : o.gain), cutoff: sp.cutoff });
    if (def.delayed && o.x != null) o = { ...o, delay: (o.delay || 0) + sp.delay };
    v.name = name;
    this.counts.set(name, count + 1);
    this.voices.add(v);
    v.onDispose = () => {
      this.voices.delete(v);
      this.counts.set(name, Math.max(0, (this.counts.get(name) || 1) - 1));
    };
    v.setPos = (x, y, z) => {
      const s = this._spatial({ x, y, z });
      v.setPan(s.pan);
      v.setAir(s.cutoff);
      v.setLevel(s.level * (o.gain == null ? 1 : o.gain));
    };
    try {
      const buffers = this.samples[`${name}:${o.kind}`] || this.samples[name];
      if (buffers && buffers.length) this._playSample(def, o, v, buffers);
      else def.play(this._env(), o, v);
    } catch (err) {
      console.error(`Sound "${name}" failed`, err);
      v.dispose();
      return null;
    }
    return v;
  }

  /** Plays a real recording (from public/sounds) instead of the synthesised version. */
  _playSample(def, o, v, buffers) {
    const ctx = this.ctx;
    const buf = buffers[(Math.random() * buffers.length) | 0];
    v.sampled = true;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = (o.rate || 1) * (0.94 + Math.random() * 0.12);
    src.playbackRate.value = rate;
    src.loop = !!def.loop;
    src.connect(v.out);
    v.source(src);
    const t = ctx.currentTime + (o.delay || 0);
    src.start(t);
    if (def.loop) {
      v.set = (p) => {
        const i = p.intensity != null ? p.intensity : p.speed;
        if (i == null) return;
        v.out.gain.setTargetAtTime(Math.max(0.05, i), ctx.currentTime, 0.08);
        if (p.speed != null) src.playbackRate.setTargetAtTime(0.75 + 0.6 * p.speed, ctx.currentTime, 0.1);
      };
      if (o.intensity != null) v.set({ intensity: o.intensity });
    } else {
      this.synth.reverbSend(v, this.reverbIn, 0.25);
      if (def.priority) this.duck(0.5, 0.9);
      v.finishAfter(buf.duration / rate + (o.delay || 0));
    }
  }

  /** Optional: loads public/sounds/manifest.json and decodes the listed recordings. */
  async _loadSamples() {
    if (typeof fetch !== 'function') return;
    try {
      const base = new URL('sounds/', document.baseURI);
      const res = await fetch(new URL('manifest.json', base));
      if (!res.ok) return;
      const manifest = await res.json();
      for (const [key, files] of Object.entries(manifest)) {
        if (!Array.isArray(files)) continue;
        const out = [];
        for (const f of files) {
          try {
            const r = await fetch(new URL(f, base));
            if (!r.ok) continue;
            out.push(await this._decode(await r.arrayBuffer()));
          } catch (e) {
            console.warn(`Could not load sound ${f}`, e);
          }
        }
        if (out.length) this.samples[key] = out;
      }
      const n = Object.keys(this.samples).length;
      if (n) console.info(`Using real recordings for ${n} sound(s)`);
    } catch (e) {
      /* no recordings available: the synthesised sounds are used */
    }
  }

  _decode(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const p = this.ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  /** Plays a looping sound for a fixed time, then fades it out. */
  playFor(name, seconds, o = {}) {
    const v = this.play(name, o);
    if (v) v.after(() => v.stop(0.25), seconds * 1000);
    return v;
  }

  _env() {
    if (!this._envObj) {
      this._envObj = {
        ctx: this.ctx,
        synth: this.synth,
        reverbIn: this.reverbIn,
        duck: (d, s) => this.duck(d, s),
      };
    }
    return this._envObj;
  }

  // ---------------------------------------------------- firework event hooks
  onLaunch(e) {
    if (e.tag) return; // tagged launches (crackers) play their own sounds
    this.play('mortar', { x: e.x, y: e.y, z: e.z, gain: 0.55, duration: e.flight || 1.5 });
  }

  onBurst(e) {
    const kind = e.tag === 'rocket' ? 'rocket' : e.tag === 'skyshot' ? 'shell' : e.type;
    this.play('burst', { x: e.x, y: e.y, z: e.z, kind, size: e.size });
  }

  onFountain(e) {
    this.playFor('anar', 3.2, { x: e.x, y: 0, z: e.z, intensity: 0.8 });
  }

  /** UI feedback sounds. */
  ui(name) {
    this.play(name);
  }

  stopAll() {
    for (const v of [...this.voices]) v.stop(0.1);
  }

  dispose() {
    for (const [target, ev, h] of this._listeners) target.removeEventListener(ev, h);
    this._listeners.length = 0;
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._offSettings) this._offSettings();
    for (const v of [...this.voices]) v.dispose();
    if (this.music) this.music.dispose();
    if (this.ctx) {
      this.ctx.onstatechange = null;
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.ready = false;
  }
}
