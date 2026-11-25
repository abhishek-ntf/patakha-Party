import { Cracker } from './Cracker.js';

const LEAD = 0.3;
const FUSE = 2.4;

/** Sutli bomb: sizzling fuse that burns down, then a flash, shock ring, debris, smoke and a deep bang. */
export class SutliBomb extends Cracker {
  tick(dt) {
    const ctx = this.ctx;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    if (this.exploded) {
      this.after += dt;
      if (this.after > 1.0) this.finish();
      return;
    }
    if (this.t < LEAD) return;
    const ft = this.t - LEAD;
    if (!this.fuseV) this.fuseV = this.say('fuse');
    if (ft < FUSE) {
      const p = ft / FUSE;
      this.fuseBurn(dt, p, 0.8 + p);
      if (this.fuseV) this.fuseV.set({ intensity: 0.8 + p * 0.8 });
      return;
    }
    this.endVoice(this.fuseV, 0.02);
    this._bang();
  }

  _bang() {
    const ctx = this.ctx;
    const ps = ctx.ps;
    const d = this.density;
    const x = this.x;
    const z = this.z;
    const y = this.model.userData.centerY;
    this.exploded = true;
    this.after = 0;
    this.model.visible = false;
    this.say('bomb', { y, size: 1 });

    this.flash(x, y, z, 10, 0.22);
    // fireball
    let c = ps.cfg.reset();
    c.colors([1, 0.95, 0.6], [1, 0.25, 0.05]);
    c.drag = 2;
    c.gravity = 0.5;
    c.flash = 1.5;
    let n = Math.max(20, Math.round(120 * d));
    for (let i = 0; i < n; i++) {
      const v = this.randDir();
      const sp = 6 + Math.random() * 8;
      c.size = 0.18 + Math.random() * 0.12;
      c.life = 0.6 + Math.random() * 0.5;
      ps.emit(x, y, z, v[0] * sp, v[1] * sp * 0.8 + 1, v[2] * sp);
    }
    // ground shock ring
    c = ps.cfg.reset();
    c.colors([1, 1, 0.9], [1, 0.5, 0.2]);
    c.drag = 3;
    c.gravity = 0;
    c.size = 0.25;
    c.life = 0.5;
    n = Math.max(16, Math.round(70 * d));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2831853;
      const sp = 16 + Math.random() * 4;
      ps.emit(x, 0.2, z, Math.cos(a) * sp, 0, Math.sin(a) * sp);
    }
    // paper debris
    c = ps.cfg.reset();
    c.colors([0.5, 0.4, 0.3], [0.2, 0.15, 0.1]);
    c.drag = 0.5;
    c.gravity = 1.2;
    c.size = 0.12;
    n = Math.max(8, Math.round(30 * d));
    for (let i = 0; i < n; i++) {
      const v = this.randDir();
      const sp = 4 + Math.random() * 6;
      c.life = 0.9 + Math.random() * 0.6;
      ps.emit(x, y, z, v[0] * sp, Math.abs(v[1]) * sp + 2, v[2] * sp);
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.2831853;
      const sp = 1.5 + Math.random() * 2.5;
      ctx.smoke.puff(x, 0.3 + Math.random() * 0.5, z, Math.cos(a) * sp, 0.8 + Math.random(), Math.sin(a) * sp, 1.4, 4.5, 0.55, 0.8);
    }
    ctx.world.flash(x, 0.8, z, 1, 0.85, 0.6, 900);
    ctx.rig.addShake(0.45);
    ctx.haptic(40);
  }
}
