import { clamp, lerp } from '../utils/math.js';

/**
 * A Voice owns every Web Audio node of one sound: envelope node -> level (distance) -> panner -> bus.
 * Everything it creates is tracked and torn down in dispose(), so loops and one-shots never leak.
 */
export class Voice {
  constructor(ctx, dest, { pan = 0, level = 1, cutoff = 20000 } = {}) {
    this.ctx = ctx;
    this.name = '';
    this.out = ctx.createGain();
    this.level = ctx.createGain();
    this.level.gain.value = level;
    // distant sounds lose their highs (air absorption)
    this.air = ctx.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.frequency.value = cutoff;
    this.air.Q.value = 0.5;
    this.panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.out.connect(this.level);
    this.level.connect(this.air);
    if (this.panner) {
      this.panner.pan.value = clamp(pan, -1, 1);
      this.air.connect(this.panner);
      this.panner.connect(dest);
    } else {
      this.air.connect(dest);
    }
    this.nodes = [this.out, this.level, this.air];
    if (this.panner) this.nodes.push(this.panner);
    this.sources = [];
    this.timers = [];
    this.intervals = [];
    this.disposed = false;
    this.onDispose = null;
    this.set = () => {}; // loops override this to accept live parameters
    this.setPos = () => {}; // assigned by the AudioManager (spatial updates)
  }

  add(node) {
    this.nodes.push(node);
    return node;
  }

  source(node) {
    this.sources.push(node);
    this.nodes.push(node);
    return node;
  }

  every(fn, ms) {
    this.intervals.push(setInterval(fn, ms));
  }

  after(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  setPan(p) {
    if (this.panner && !this.disposed) this.panner.pan.setTargetAtTime(clamp(p, -1, 1), this.ctx.currentTime, 0.03);
  }

  setAir(cutoff) {
    if (!this.disposed) this.air.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.05);
  }

  setLevel(v) {
    if (!this.disposed) this.level.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  /** Fades out, stops schedulers immediately and frees all nodes afterwards. */
  stop(fade = 0.08) {
    if (this.disposed || this.stopping) return;
    this.stopping = true;
    for (const id of this.intervals) clearInterval(id);
    this.intervals.length = 0;
    const t = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    this.after(() => this.dispose(), (fade + 0.06) * 1000);
  }

  /** Schedules automatic disposal for one-shot sounds. */
  finishAfter(seconds) {
    this.after(() => this.dispose(), (seconds + 0.2) * 1000);
    return this;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.intervals) clearInterval(id);
    for (const id of this.timers) clearTimeout(id);
    this.intervals.length = 0;
    this.timers.length = 0;
    for (const s of this.sources) {
      try { s.stop(); } catch (e) { /* already stopped */ }
    }
    for (const n of this.nodes) {
      try { n.disconnect(); } catch (e) { /* already disconnected */ }
    }
    this.sources.length = 0;
    this.nodes.length = 0;
    if (this.onDispose) this.onDispose(this);
  }
}

/** Gain envelope: silence -> peak (linear attack) -> silence (exponential decay). */
export function envAD(param, t, peak, attack, decay, floor = 0.0001) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(floor, t);
  param.linearRampToValueAtTime(Math.max(peak, floor), t + attack);
  param.exponentialRampToValueAtTime(floor, t + attack + decay);
}

/** Exponential frequency sweep. */
export function sweep(param, t, f0, f1, dur) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(Math.max(f0, 0.01), t);
  param.exponentialRampToValueAtTime(Math.max(f1, 0.01), t + dur);
}

const poisson = (lambda) => {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L && k < 12);
  return k - 1;
};

/**
 * Procedural sound building blocks: shared noise / click buffers, reverb impulse,
 * and helpers that add nodes to a Voice. No audio files are used anywhere.
 */
export class SoundSynth {
  constructor(ctx) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.noiseBuf = {
      white: this._noise('white'),
      pink: this._noise('pink'),
      brown: this._noise('brown'),
    };
    this.clicks = this._makeClicks();
    this.bangs = this._makeBangs();
    this.impulse = this._makeImpulse(2.4);
  }

  // ----------------------------------------------------------------- buffers
  _noise(kind) {
    const n = Math.floor(this.sr * 2);
    const buf = this.ctx.createBuffer(1, n, this.sr);
    const d = buf.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < n; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  /** Short decaying noise ticks of differing length and brightness (crackle / pop grains). */
  _makeClicks() {
    const out = [];
    for (let v = 0; v < 16; v++) {
      const ms = 5 + (v % 8) * 3.2;
      const len = Math.max(32, Math.floor((this.sr * ms) / 1000));
      const buf = this.ctx.createBuffer(1, len, this.sr);
      const d = buf.getChannelData(0);
      const tau = len / (3 + (v % 3));
      const hp = 0.15 + (v / 16) * 0.8; // higher = brighter (more high-pass)
      let prev = 0;
      let peak = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        const hpf = w - prev * hp;
        prev = w;
        d[i] = hpf * Math.exp(-i / tau);
        peak = Math.max(peak, Math.abs(d[i]));
      }
      for (let i = 0; i < len; i++) d[i] /= peak || 1;
      out.push(buf);
    }
    return out;
  }

  /**
   * Pre-rendered "bangs": an N-wave shock (fast rise, undershoot) + broadband crack that dies in a
   * few ms + a lowpassed body + a low rumble, soft-clipped like a real over-pressure event.
   * Several random variants per kind so no two pops are identical.
   */
  _makeBangs() {
    const kinds = {
      tick:  { len: 0.14, n: 6, crackTau: 0.0016, bodyTau: 0.012, bodyGain: 0.25, rumbleTau: 0, rumbleGain: 0, sat: 2.2 },
      crack: { len: 0.4, n: 6, crackTau: 0.003, bodyTau: 0.04, bodyGain: 0.5, rumbleTau: 0.12, rumbleGain: 0.25, sat: 2.6 },
      bomb:  { len: 1.2, n: 5, crackTau: 0.004, bodyTau: 0.09, bodyGain: 0.75, rumbleTau: 0.45, rumbleGain: 0.55, sat: 3.0 },
      shell: { len: 1.9, n: 4, crackTau: 0.005, bodyTau: 0.14, bodyGain: 0.85, rumbleTau: 0.85, rumbleGain: 0.75, sat: 3.0 },
    };
    const out = {};
    const sr = this.sr;
    const aBody = 1 - Math.exp((-2 * Math.PI * 700) / sr);
    const aRumble = 1 - Math.exp((-2 * Math.PI * 110) / sr);
    for (const [name, k] of Object.entries(kinds)) {
      out[name] = [];
      for (let v = 0; v < k.n; v++) {
        const len = Math.floor(sr * k.len);
        const buf = this.ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        const wobble = 0.8 + Math.random() * 0.4;
        let lpB = 0;
        let lpR = 0;
        let peak = 0;
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const w = Math.random() * 2 - 1;
          const crack = w * Math.exp(-t / (k.crackTau * wobble));
          // N-wave: sharp positive rise, then a negative undershoot, then silence
          const nw = t < 0.0008 ? t / 0.0008 : t < 0.0022 ? 1 - 2 * ((t - 0.0008) / 0.0014) : t < 0.004 ? -1 + (t - 0.0022) / 0.0018 : 0;
          lpB += aBody * (w - lpB);
          const body = lpB * 3 * Math.exp(-t / (k.bodyTau * wobble));
          let rumble = 0;
          if (k.rumbleTau) {
            lpR += aRumble * (Math.random() * 2 - 1 - lpR);
            rumble = lpR * 8 * Math.exp(-t / (k.rumbleTau * wobble));
          }
          const x = crack * 0.8 + nw * 0.9 + body * k.bodyGain + rumble * k.rumbleGain;
          d[i] = Math.tanh(x * k.sat);
          peak = Math.max(peak, Math.abs(d[i]));
        }
        for (let i = 0; i < len; i++) d[i] /= peak || 1;
        out[name].push(buf);
      }
    }
    return out;
  }

  /** Reverb of an enclosed courtyard: distinct wall reflections, then a darkening diffuse tail. */
  _makeImpulse(seconds) {
    const len = Math.floor(this.sr * seconds);
    const buf = this.ctx.createBuffer(2, len, this.sr);
    const taps = [0.043, 0.071, 0.108, 0.152, 0.207, 0.283, 0.371];
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const coef = 0.9 - 0.75 * t; // tail gets darker as it decays
        lp += coef * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, 2.4) * Math.exp(-t * 3) * 0.6;
      }
      taps.forEach((tp, idx) => {
        const at = Math.floor((tp * (1 + (c ? 0.04 : -0.03))) * this.sr);
        const amp = 0.9 * Math.pow(0.8, idx) * (Math.random() < 0.5 ? -1 : 1);
        for (let j = 0; j < 40 && at + j < len; j++) d[at + j] += amp * (Math.random() * 2 - 1) * Math.exp(-j / 9);
      });
    }
    return buf;
  }

  // ------------------------------------------------------------------ nodes
  noise(v, kind = 'white', { when = this.ctx.currentTime, loop = true } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf[kind];
    src.loop = loop;
    src.start(when, Math.random() * 1.5);
    return v.source(src);
  }

  osc(v, type, freq, when = this.ctx.currentTime) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(when);
    return v.source(o);
  }

  filter(v, type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return v.add(f);
  }

  gain(v, value = 1) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return v.add(g);
  }

  /** Chains nodes (a -> b -> c ...) and returns the last one. */
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  /** Fire-and-forget grain. Its two nodes clean themselves up when playback ends. */
  click(v, when, { gain = 0.3, rate = 1, variant = -1 } = {}) {
    if (v.disposed) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.clicks[variant >= 0 ? variant : (Math.random() * this.clicks.length) | 0];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(v.out);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start(when);
  }

  /** Plays a pre-rendered bang (kind: tick | crack | bomb | shell). Self-cleaning like click(). */
  bang(v, when, { kind = 'crack', gain = 1, rate = 1, variant = -1 } = {}) {
    if (v.disposed) return;
    const list = this.bangs[kind] || this.bangs.crack;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = list[variant >= 0 ? variant % list.length : (Math.random() * list.length) | 0];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(v.out);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start(when);
  }

  /**
   * Random crackling (Poisson process). Returns a controller whose `rate` (events/s) and
   * `gain` can be changed live; the scheduler is owned by the voice and dies with it.
   */
  crackle(v, { rate = 20, gain = 0.3, pitchLo = 0.8, pitchHi = 1.6 } = {}) {
    const ctl = { rate, gain, pitchLo, pitchHi };
    v.every(() => {
      if (ctl.rate <= 0) return;
      const now = this.ctx.currentTime;
      const n = poisson(ctl.rate * 0.045);
      for (let i = 0; i < n; i++) {
        this.click(v, now + 0.01 + Math.random() * 0.05, {
          gain: ctl.gain * (0.35 + Math.random() * 0.9),
          rate: lerp(ctl.pitchLo, ctl.pitchHi, Math.random()),
        });
      }
    }, 45);
    return ctl;
  }

  /** Inharmonic bell / chime strike. */
  bell(v, when, freq, gain = 0.15, dur = 1.4) {
    const parts = [[1, 1, 1], [2.76, 0.38, 0.6], [5.4, 0.14, 0.3]];
    for (const [mul, amp, dm] of parts) {
      const o = this.osc(v, 'sine', freq * mul, when);
      const g = this.gain(v, 0);
      envAD(g.gain, when, gain * amp, 0.004, dur * dm);
      o.connect(g);
      g.connect(v.out);
      o.stop(when + dur * dm + 0.1);
    }
  }

  /** Sends part of a voice into the shared reverb. */
  reverbSend(v, reverbIn, amount) {
    const g = this.gain(v, amount);
    v.level.connect(g);
    g.connect(reverbIn);
  }
}
