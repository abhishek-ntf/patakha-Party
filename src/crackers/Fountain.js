import { Cracker, smooth } from './Cracker.js';
import { PALETTES } from '../fireworks/ExplosionTypes.js';

const LEAD = 0.25;
const FUSE = 1.1;
const RAMP = 1.0;
const HOLD = 4.2;
const DECAY = 1.4;
const SEQUENCE = [0, 3, 1, 5, 0, 6, 2]; // palette indices cycled while burning

/** Anar (flower pot): fuse, rising fizz, then a tall fountain of colour-changing sparks. */
export class Anar extends Cracker {
  tick(dt) {
    const ud = this.model.userData;
    const ctx = this.ctx;
    const ps = ctx.ps;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    if (this.t < LEAD) return;
    const ft = this.t - LEAD;
    if (ft < FUSE) {
      if (!this.fuseV) this.fuseV = this.say('fuse');
      this.fuseBurn(dt, ft / FUSE);
      return;
    }
    if (this.fuseV) {
      this.endVoice(this.fuseV);
      this.fuseV = null;
    }
    if (!this.hiss) this.hiss = this.say('anar', { intensity: 0 });

    const k = ft - FUSE;
    let i;
    if (k < RAMP) i = smooth(k / RAMP);
    else if (k < RAMP + HOLD) i = 1;
    else if (k < RAMP + HOLD + DECAY) i = 1 - smooth((k - RAMP - HOLD) / DECAY);
    else {
      this.finish();
      return;
    }
    if (this.hiss) this.hiss.set({ intensity: i });

    const pal = PALETTES[SEQUENCE[Math.floor(k / 1.3) % SEQUENCE.length]];
    const y = ud.nozzleY;
    const c = ps.cfg.reset();
    c.colors(pal.a, pal.b);
    c.drag = 0.35;
    c.gravity = 1;
    c.flash = 0.6;
    c.trailN = Math.round(2 * this.trails);
    c.trailDt = 0.05;
    c.trailLife = 0.25;
    c.trailSize = 0.5;
    const n = this.take(320 * i * this.density, dt);
    for (let q = 0; q < n; q++) {
      const a = Math.random() * 0.26 + (Math.random() < 0.1 ? 0.25 : 0);
      const phi = Math.random() * 6.2831853;
      const sp = (9 + Math.random() * 4) * (0.55 + 0.45 * i);
      c.size = 0.12 + Math.random() * 0.08;
      c.life = 0.9 + Math.random() * 0.7;
      c.strobe = Math.random() < 0.2 ? 16 : 0;
      ps.emit(this.x, y, this.z, Math.sin(a) * Math.cos(phi) * sp, Math.cos(a) * sp, Math.sin(a) * Math.sin(phi) * sp);
    }
    // glow at the nozzle
    const b = 0.5 * i;
    c.reset();
    c.r0 = b; c.g0 = 0.7 * b; c.b0 = 0.3 * b;
    c.r1 = b; c.g1 = 0.3 * b; c.b1 = 0.1 * b;
    c.size = 2.4 + Math.random() * 0.5;
    c.life = 0.12;
    c.drag = 1;
    c.gravity = 0;
    ps.emit(this.x, y + 0.2, this.z, 0, 0, 0);

    this._smoke = (this._smoke || 0) + dt;
    if (this._smoke > 0.2 && i > 0.05) {
      this._smoke = 0;
      ctx.smoke.puff(this.x, y + 0.2, this.z, (Math.random() - 0.5) * 0.6, 1.6, (Math.random() - 0.5) * 0.6, 0.45, 3.2, 0.28 * i, 0.6);
    }
    ctx.world.glow(this.x, 1.2, this.z, pal.a[0], pal.a[1], pal.a[2], 150 * i * (0.85 + Math.random() * 0.3));
  }
}
