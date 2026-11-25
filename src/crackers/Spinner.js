import { Cracker, smooth } from './Cracker.js';
import { PALETTES } from '../fireworks/ExplosionTypes.js';

const TAU = Math.PI * 2;

/**
 * Shared ground-spinner behaviour. The disc spins on the floor, jets spray sparks tangentially
 * from its nozzles (opposite to the rotation) and it wanders / hops around.
 */
class Spinner extends Cracker {
  constructor(def, model, ctx, x, z, cfg) {
    super(def, model, ctx, x, z);
    this.cfg = cfg;
    this.homeX = x;
    this.homeZ = z;
    this.vx = 0;
    this.vz = 0;
    this.theta = 0;
    this.speed = 0;
    this.motion = 0;
  }

  /** Palette pair for the current moment. Subclasses may cycle colours. */
  palette() {
    return this.cfg.palettes[0];
  }

  /** Optional scripted movement. Default: random-walk wander. */
  move(dt, k, s) {
    const lim = this.cfg.wander;
    this.vx += (Math.random() - 0.5) * 7 * dt * s;
    this.vz += (Math.random() - 0.5) * 7 * dt * s;
    this.vx *= 0.985;
    this.vz *= 0.985;
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    const dx = nx - this.homeX;
    const dz = nz - this.homeZ;
    const d = Math.hypot(dx, dz);
    if (d > lim) {
      nx = this.homeX + (dx / d) * lim;
      nz = this.homeZ + (dz / d) * lim;
      this.vx *= -0.5;
      this.vz *= -0.5;
    }
    this.x = nx;
    this.z = nz;
  }

  tick(dt) {
    const cfg = this.cfg;
    const ud = this.model.userData;
    const ctx = this.ctx;
    const ps = ctx.ps;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    if (this.t < cfg.lead) return;
    const k = this.t - cfg.lead;
    let s;
    if (k < cfg.ramp) s = smooth(k / cfg.ramp);
    else if (k < cfg.ramp + cfg.hold) s = 1;
    else if (k < cfg.ramp + cfg.hold + cfg.decay) s = 1 - smooth((k - cfg.ramp - cfg.hold) / cfg.decay);
    else {
      this.finish();
      return;
    }
    this.speed = s;
    if (!this.whirr) this.whirr = this.say('spinner', { variant: cfg.variant });

    this.move(dt, k, s);
    const hop = cfg.hop ? Math.abs(Math.sin(k * 17)) * cfg.hop * s : 0;
    this.theta += cfg.omega * s * dt;
    ud.spin.rotation.y = this.theta;
    this.model.position.set(this.x, hop, this.z);
    this.model.rotation.z = Math.sin(this.t * 37) * 0.04 * s;
    this.model.rotation.x = Math.sin(this.t * 29) * 0.04 * s;
    if (this.whirr) {
      this.whirr.set({ speed: s });
      this.whirr.setPos(this.x, 0.4, this.z);
    }

    const pal = this.palette(k);
    const c = ps.cfg.reset();
    c.colors(pal.a, pal.b);
    c.drag = 0.7;
    c.gravity = 1.3;
    c.flash = 0.8;
    c.trailN = Math.round(2 * this.trails);
    c.trailDt = 0.05;
    c.trailLife = 0.28;
    const nz = ud.nozzles;
    const total = this.take(cfg.rate * s * this.density, dt);
    const ny = ud.height + 0.05 + hop;
    for (let q = 0; q < total; q++) {
      const n = q % nz;
      const ang = (n / nz) * TAU - this.theta; // world angle of this nozzle
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const sp = cfg.spark[0] + Math.random() * cfg.spark[1];
      const upward = cfg.fan > 0 && Math.random() < cfg.fan;
      c.size = 0.1 + Math.random() * 0.04;
      c.life = 0.5 + Math.random() * 0.4;
      const vy = upward ? 5 + Math.random() * 4 : 1.2 + Math.random() * 2;
      const tan = upward ? 0.35 : 1;
      ps.emit(
        this.x + ca * ud.R, ny, this.z + sa * ud.R,
        (-sa * tan + ca * 0.3) * sp, vy, (ca * tan + sa * 0.3) * sp,
      );
    }
    this._smoke = (this._smoke || 0) + dt;
    if (this._smoke > 0.13 && s > 0.1) {
      this._smoke = 0;
      ctx.smoke.puff(this.x, 0.2, this.z, (Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5, 0.35, 2.4, 0.22 * s, 0.4);
    }
    ctx.world.glow(this.x, 0.5, this.z, pal.a[0], pal.a[1], pal.a[2], cfg.glow * s);
  }
}

/** Chakri: small ground spinner with a fiery gold spiral. */
export class Chakri extends Spinner {
  constructor(def, model, ctx, x, z) {
    super(def, model, ctx, x, z, {
      variant: 'chakri', lead: 0.5, ramp: 1.2, hold: 6.2, decay: 1.6,
      omega: 24, rate: 180, spark: [5, 4], fan: 0, wander: 2.2, hop: 0, glow: 70,
      palettes: [PALETTES[0]],
    });
  }
}

const ZAMEEN_PALS = [PALETTES[3], PALETTES[1], PALETTES[0], PALETTES[2]];

/** Zameen Chakkar: big colourful wheel that buzzes, hops and zooms around in a rosette. */
export class ZameenChakkar extends Spinner {
  constructor(def, model, ctx, x, z) {
    super(def, model, ctx, x, z, {
      variant: 'zameen', lead: 0.5, ramp: 1.0, hold: 7.0, decay: 1.4,
      omega: 30, rate: 240, spark: [6, 4], fan: 0.35, wander: 2.4, hop: 0.05, glow: 90,
      palettes: ZAMEEN_PALS,
    });
  }

  palette(k) {
    return ZAMEEN_PALS[Math.floor(k / 1.0) % ZAMEEN_PALS.length];
  }

  move(dt, k, s) {
    const f = Math.min(1, k / 1.5);
    const r = this.ctx.radius || 20;
    const nx = this.homeX + 2.2 * Math.sin(0.7 * k) * Math.cos(0.23 * k) * f;
    const nz = this.homeZ + 1.8 * Math.sin(0.9 * k + 1) * Math.sin(0.19 * k + 0.5) * f;
    this.x = Math.max(-r, Math.min(r, nx));
    this.z = Math.max(-r, Math.min(r, nz));
  }
}
