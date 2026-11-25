import { TAU } from '../utils/math.js';

/**
 * Base class for a burning cracker instance.
 * `ctx` = { ps, smoke, fireworks, audio, world, rig, haptic, radius }.
 * Behaviours emit particles into the shared pools (no per-frame allocation), drive their own
 * sounds through ctx.audio, and call finish() when done. The manager removes the model after.
 */
export class Cracker {
  constructor(def, model, ctx, x, z) {
    this.def = def;
    this.model = model;
    this.ctx = ctx;
    this.x = x;
    this.z = z;
    this.t = 0;
    this.done = false;
    this.started = false;
    this.voices = [];
    this._acc = 0;
    this._dir = [0, 0, 0];
    model.position.set(x, 0, z);
  }

  get density() {
    return this.ctx.fireworks.density;
  }

  get trails() {
    return this.ctx.fireworks.trails;
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.tick(dt);
  }

  tick() {}

  // ------------------------------------------------------------------ audio
  say(name, o = {}) {
    const a = this.ctx.audio;
    if (!a) return null;
    const v = a.play(name, { x: this.x, y: 0.6, z: this.z, ...o });
    if (v) this.voices.push(v);
    return v;
  }

  endVoice(v, fade = 0.15) {
    if (!v) return;
    v.stop(fade);
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  // -------------------------------------------------------------- particles
  /** Whole number of emissions for `rate` per second this frame (keeps fractions). */
  take(rate, dt) {
    this._acc += rate * dt;
    const n = Math.floor(this._acc);
    this._acc -= n;
    return n;
  }

  /** Random unit vector into this._dir. */
  randDir() {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * TAU;
    const s = Math.sqrt(1 - u * u);
    this._dir[0] = s * Math.cos(a);
    this._dir[1] = u;
    this._dir[2] = s * Math.sin(a);
    return this._dir;
  }

  /** Big short-lived glow sprite used as a muzzle / pop flash. */
  flash(x, y, z, size, life = 0.12, warm = true) {
    const c = this.ctx.ps.cfg.reset();
    if (warm) c.colors([1, 0.95, 0.75], [1, 0.5, 0.2]);
    else c.colors([1, 1, 1], [0.7, 0.8, 1]);
    c.size = size;
    c.life = life;
    c.drag = 1;
    c.gravity = 0;
    this.ctx.ps.emit(x, y, z, 0, 0, 0);
  }

  /** A burning fuse: moving spark head along the model's fuse path. p = 0..1 burnt. */
  fuseBurn(dt, p, scale = 1) {
    const ud = this.model.userData;
    const a = ud.fuseTop;
    const b = ud.fuseBase;
    const lx = a.x + (b.x - a.x) * p;
    const ly = a.y + (b.y - a.y) * p;
    const wx = this.x + lx;
    const wz = this.z;
    const ps = this.ctx.ps;
    const c = ps.cfg.reset();
    c.colors([1, 0.9, 0.55], [1, 0.4, 0.08]);
    c.drag = 1.5;
    c.gravity = 0.8;
    c.flash = 1.5;
    const n = this.take(70 * this.density * scale, dt);
    for (let i = 0; i < n; i++) {
      const d = this.randDir();
      const sp = 1.5 + Math.random() * 2.5;
      c.size = 0.06 + Math.random() * 0.04;
      c.life = 0.2 + Math.random() * 0.25;
      ps.emit(wx, ly, wz, d[0] * sp, d[1] * sp + 1, d[2] * sp);
    }
    this.ctx.world.glow(wx, ly + 0.1, wz, 1, 0.7, 0.3, 16 + Math.random() * 6);
  }

  // --------------------------------------------------------------- lifecycle
  finish() {
    this.done = true;
    for (const v of this.voices) v.stop(0.2);
    this.voices.length = 0;
  }

  /** Immediate stop (leaving the mode). */
  abort() {
    this.done = true;
    for (const v of this.voices) v.stop(0.08);
    this.voices.length = 0;
  }
}

export const smooth = (t) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};
