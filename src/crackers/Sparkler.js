import { Cracker } from './Cracker.js';

const LEAD = 0.6;
const BURN = 9;

/** Phuljhadi: hand-held sparkler. Continuous sizzling stars from a coating that burns down. */
export class Phuljhadi extends Cracker {
  tick(dt) {
    const ud = this.model.userData;
    const ctx = this.ctx;
    const ps = ctx.ps;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    const tipTop = ud.coatBaseY + ud.coatH + 0.02;
    if (this.t < LEAD) {
      // match flare catching the tip
      const c = ps.cfg.reset();
      c.colors([1, 0.95, 0.7], [1, 0.4, 0.1]);
      c.size = 0.08;
      c.life = 0.25;
      c.drag = 1.5;
      c.gravity = 0.5;
      const n = this.take(60 * this.density, dt);
      for (let i = 0; i < n; i++) {
        const d = this.randDir();
        ps.emit(this.x, tipTop, this.z, d[0] * 2, d[1] * 2 + 1, d[2] * 2);
      }
      ctx.world.glow(this.x, tipTop, this.z, 1, 0.8, 0.5, 20);
      return;
    }
    if (!this.sizzle) this.sizzle = this.say('sparkler');

    const p = (this.t - LEAD) / BURN;
    if (p >= 1) {
      this.finish();
      return;
    }
    const s = Math.max(0.04, 1 - p * 0.92);
    ud.coat.scale.y = s;
    const tipY = ud.coatBaseY + ud.coatH * s + 0.02;
    const ramp = Math.min(1, (this.t - LEAD) / 0.35);
    const i = ramp * (p > 0.85 ? (1 - p) / 0.15 : 1);

    const c = ps.cfg.reset();
    c.colors([1, 0.95, 0.7], [1, 0.45, 0.1]);
    c.drag = 1.4;
    c.gravity = 0.5;
    const n = this.take(260 * i * this.density, dt);
    for (let k = 0; k < n; k++) {
      const d = this.randDir();
      const big = Math.random() < 0.12;
      const sp = 2.5 + Math.random() * 4.5;
      c.size = big ? 0.17 : 0.09 + Math.random() * 0.05;
      c.life = big ? 0.22 : 0.3 + Math.random() * 0.4;
      c.flash = big ? 2 : 0.8;
      ps.emit(this.x, tipY, this.z, d[0] * sp, d[1] * sp + 1, d[2] * sp);
    }
    this._smoke = (this._smoke || 0) + dt;
    if (this._smoke > 0.14) {
      this._smoke = 0;
      ctx.smoke.puff(this.x, tipY, this.z, (Math.random() - 0.5) * 0.2, 0.5, (Math.random() - 0.5) * 0.2, 0.22, 2.4, 0.2 * i + 0.05, 0.3);
    }
    ctx.world.glow(this.x, tipY + 0.1, this.z, 1, 0.85, 0.55, 45 * i * (0.85 + Math.random() * 0.3));
    if (this.sizzle) this.sizzle.set({ intensity: i });
  }
}

const PULSES = [0, 0.55, 1.15, 1.8];
const PENCIL_LEAD = 0.3;
const PENCIL_FUSE = 0.9;

/** Pencil crackers: three slim pencils firing short, sharp, coloured jets, ending with a star pop. */
export class PencilCrackers extends Cracker {
  constructor(def, model, ctx, x, z) {
    super(def, model, ctx, x, z);
    this.fired = [];
    this.pencils = model.userData.pencils;
    // per-pencil pulse schedule (seconds after ignition of the jets)
    this.schedule = this.pencils.map((_, i) => PULSES.map((t) => t + i * 0.18 + Math.random() * 0.08));
    this.next = this.pencils.map(() => 0);
    this.end = 0;
  }

  tick(dt) {
    const ctx = this.ctx;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    if (this.t < PENCIL_LEAD) return;
    const ft = this.t - PENCIL_LEAD;
    if (ft < PENCIL_FUSE) {
      if (!this.fuseV) this.fuseV = this.say('fuse');
      this.fuseBurn(dt, ft / PENCIL_FUSE);
      return;
    }
    if (this.fuseV) {
      this.endVoice(this.fuseV);
      this.fuseV = null;
    }
    const jt = ft - PENCIL_FUSE;
    let remaining = 0;
    this.pencils.forEach((pc, i) => {
      const idx = this.next[i];
      if (idx >= this.schedule[i].length) return;
      remaining++;
      if (jt >= this.schedule[i][idx]) {
        this.next[i]++;
        this._pulse(pc, idx === this.schedule[i].length - 1);
      }
    });
    if (remaining === 0) {
      this.end += dt;
      if (this.end > 0.6) this.finish();
    }
    ctx.world.glow(this.x, 1, this.z, 1, 0.8, 0.6, this.lastGlow || 0);
    this.lastGlow = (this.lastGlow || 0) * 0.82;
  }

  _pulse(pc, last) {
    const ctx = this.ctx;
    const ps = ctx.ps;
    const x = this.x + pc.x;
    const z = this.z + pc.z;
    const y = pc.topY;
    this.say('pencil', { x, z });
    const col = pc.color;
    const c = ps.cfg.reset();
    c.colors(col, [col[0] * 0.5 + 0.6, col[1] * 0.5 + 0.6, col[2] * 0.5 + 0.6]);
    c.drag = 0.6;
    c.gravity = 1;
    c.flash = 1;
    c.trailN = Math.round(3 * this.trails);
    c.trailDt = 0.05;
    c.trailLife = 0.3;
    const n = Math.max(8, Math.round(45 * this.density));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 0.13;
      const phi = Math.random() * 6.2831853;
      const sp = 12 + Math.random() * 6;
      c.size = 0.1 + Math.random() * 0.06;
      c.life = 0.6 + Math.random() * 0.3;
      ps.emit(x, y, z, Math.sin(a) * Math.cos(phi) * sp, Math.cos(a) * sp, Math.sin(a) * Math.sin(phi) * sp);
    }
    this.flash(x, y, z, 1.6, 0.1, false);
    this.lastGlow = Math.max(this.lastGlow || 0, 120);
    ctx.smoke.puff(x, y, z, 0, 0.6, 0, 0.3, 2, 0.22, 0.5);
    if (last) {
      // finishing pop: a small ball of stars at the top of the jet
      this.say('snap', { x, z, size: 1.2 });
      const top = y + 5.5;
      const m = Math.max(10, Math.round(40 * this.density));
      c.reset();
      c.colors(col, [1, 1, 1]);
      c.drag = 1.8;
      c.gravity = 0.4;
      c.life = 1;
      c.size = 0.16;
      for (let k = 0; k < m; k++) {
        const d = this.randDir();
        ps.emit(x, top, z, d[0] * 6, d[1] * 6, d[2] * 6);
      }
      this.flash(x, top, z, 3, 0.2, false);
      ctx.world.flash(x, top, z, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 150);
    }
  }
}
