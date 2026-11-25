import { Voice, envAD, sweep } from './SoundSynth.js';

const BPM = 104;
const STEP = 60 / BPM / 2; // one eighth note
const C4 = 261.63;
const PENTA = [0, 2, 4, 7, 9]; // Bhoopali-style pentatonic: Sa Re Ga Pa Dha

/** Scale degree (0 = C4, 5 = C5 ...) -> frequency. Negative degrees go below C4. */
const note = (deg) => {
  const oct = Math.floor(deg / 5);
  const idx = ((deg % 5) + 5) % 5;
  return C4 * Math.pow(2, (PENTA[idx] + 12 * oct) / 12);
};

// melodic phrases over 16 eighth-note steps: [step, degree, lengthInSteps]
const PHRASES = [
  [[0, 5, 2], [2, 4, 1], [3, 3, 1], [4, 2, 2], [6, 3, 1], [7, 4, 1], [8, 5, 2], [10, 7, 1], [11, 6, 1], [12, 5, 3], [15, 4, 1]],
  [[0, 3, 1], [1, 4, 1], [2, 5, 2], [4, 7, 2], [6, 6, 1], [7, 5, 1], [8, 4, 2], [10, 3, 1], [11, 2, 1], [12, 3, 4]],
  [[0, 7, 2], [2, 6, 1], [3, 5, 1], [4, 6, 2], [6, 5, 1], [7, 3, 1], [8, 4, 2], [10, 2, 2], [12, 3, 2], [14, 0, 2]],
  [[0, 5, 1], [1, 5, 1], [2, 7, 2], [4, 8, 2], [6, 7, 1], [7, 6, 1], [8, 5, 3], [11, 4, 1], [12, 3, 2], [14, 5, 2]],
];
// keherwa-like 8-step pattern: bass weight and treble weight per step
const BASS = [1, 0.5, 0, 0, 0, 0, 0.7, 0];
const TREBLE = [0, 0, 0.8, 0.6, 0.8, 0.7, 0, 0.8];
const TANPURA = [-8, -5, -5, -10]; // Pa Sa Sa low-Sa (degrees)

/**
 * Original procedural festive instrumental: tanpura drone, dholak groove, sitar-like plucks and
 * bell accents in a pentatonic scale. Scheduled ahead of time with a small look-ahead window.
 */
export class MusicManager {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.synth = audio.synth;
    this.bus = audio.musicIn;
    this.fade = this.ctx.createGain();
    this.fade.gain.value = 0;
    this.fade.connect(this.bus);
    this.playing = false;
    this.timer = 0;
    this.step = 0;
    this.nextTime = 0;
    this.phrase = PHRASES[0];
    this.drone = [];
    this.live = new Set();
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    const t = this.ctx.currentTime;
    this.nextTime = t + 0.15;
    this.step = 0;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(this.fade.gain.value, t);
    this.fade.gain.linearRampToValueAtTime(1, t + 2.5);
    this._startDrone(t);
    this.timer = setInterval(() => this._tick(), 70);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = 0;
    const t = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(this.fade.gain.value, t);
    this.fade.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => {
      if (!this.playing) this._stopDrone();
    }, 700);
  }

  _startDrone(t) {
    if (this.drone.length) return;
    // two detuned triangle voices on Sa and Pa, breathing slowly
    const g = this.ctx.createGain();
    g.gain.value = 0.045;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    g.connect(this.fade);
    lp.connect(g);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start(t);
    const oscs = [[note(-10), 'triangle'], [note(-10) * 1.004, 'triangle'], [note(-7), 'triangle'], [note(-5) * 0.997, 'sine']].map(([f, type]) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      return o;
    });
    this.drone = [...oscs, lfo, lfoGain, lp, g];
  }

  _stopDrone() {
    for (const n of this.drone) {
      try { if (n.stop) n.stop(); } catch (e) { /* ignore */ }
      try { n.disconnect(); } catch (e) { /* ignore */ }
    }
    this.drone = [];
  }

  _tick() {
    const ahead = this.ctx.currentTime + 0.25;
    // if the tab was throttled and we fell far behind, jump forward instead of bursting notes
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < ahead) {
      this._schedule(this.step, this.nextTime);
      this.step++;
      this.nextTime += STEP;
    }
  }

  _schedule(step, t) {
    const bar = Math.floor(step / 8);
    const s8 = step % 8;
    const s16 = step % 16;
    // tanpura pluck pattern (one per two steps)
    if (s8 % 2 === 0) this._tanpura(note(TANPURA[(s8 / 2) | 0]), t);
    // rhythm joins after the first two bars
    if (bar >= 2) {
      if (BASS[s8]) this._bass(t, BASS[s8]);
      if (TREBLE[s8]) this._tabla(t, TREBLE[s8]);
    }
    // melody enters after one bar
    if (bar >= 1) {
      if (s16 === 0) this.phrase = PHRASES[(Math.random() * PHRASES.length) | 0];
      for (const [st, deg, len] of this.phrase) {
        if (st === s16) this._pluck(note(deg), t, len * STEP);
      }
      if (s8 === 0) this._bellAccent(note(s16 === 0 ? 10 : 8), t);
    }
  }

  _voice(dur) {
    const v = new Voice(this.ctx, this.fade);
    v.finishAfter(dur);
    return v;
  }

  _tanpura(freq, t) {
    const v = this._voice(2.6);
    const S = this.synth;
    const o = S.osc(v, 'sawtooth', freq, t);
    const lp = S.filter(v, 'lowpass', 1800, 2);
    sweep(lp.frequency, t, 1800, 260, 1.6);
    const g = S.gain(v, 0);
    envAD(g.gain, t, 0.055, 0.01, 2.0);
    S.chain(o, lp, g);
    g.connect(v.out);
    o.stop(t + 2.2);
  }

  _pluck(freq, t, dur) {
    const v = this._voice(dur + 1.4);
    const S = this.synth;
    const lp = S.filter(v, 'lowpass', 4200, 3);
    sweep(lp.frequency, t, 4200, 650, 0.55);
    const g = S.gain(v, 0);
    envAD(g.gain, t, 0.085, 0.006, Math.max(0.5, dur * 1.2));
    for (const [detune, type, level] of [[0, 'sawtooth', 1], [5, 'sawtooth', 0.7], [0, 'sine', 0.5]]) {
      const o = S.osc(v, type, freq * (type === 'sine' ? 2 : 1), t);
      o.detune.value = detune;
      const og = S.gain(v, level);
      S.chain(o, og);
      og.connect(lp);
      o.stop(t + dur + 1.3);
    }
    S.chain(lp, g);
    g.connect(v.out);
    S.reverbSend(v, this.audio.reverbIn, 0.35);
  }

  _bellAccent(freq, t) {
    const v = this._voice(2);
    this.synth.bell(v, t, freq, 0.05, 1.6);
    this.synth.reverbSend(v, this.audio.reverbIn, 0.5);
  }

  _bass(t, vel) {
    const v = this._voice(0.5);
    const S = this.synth;
    const o = S.osc(v, 'sine', 140, t);
    sweep(o.frequency, t, 140, 62, 0.2);
    const g = S.gain(v, 0);
    envAD(g.gain, t, 0.5 * vel, 0.004, 0.28);
    S.chain(o, g);
    g.connect(v.out);
    o.stop(t + 0.35);
  }

  _tabla(t, vel) {
    const v = this._voice(0.3);
    const S = this.synth;
    const o = S.osc(v, 'sine', 430, t);
    sweep(o.frequency, t, 430, 300, 0.07);
    const og = S.gain(v, 0);
    envAD(og.gain, t, 0.16 * vel, 0.002, 0.09);
    S.chain(o, og);
    og.connect(v.out);
    o.stop(t + 0.15);
    S.click(v, t, { gain: 0.14 * vel, rate: 1.1, variant: 4 });
  }

  dispose() {
    this.pause();
    this._stopDrone();
    try { this.fade.disconnect(); } catch (e) { /* ignore */ }
  }
}
