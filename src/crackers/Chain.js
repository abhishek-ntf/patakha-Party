import { Cracker } from './Cracker.js';

const LADI_LEAD = 0.3;
const LADI_FUSE = 0.9;

/** Ladis: a spiral garland whose crackers pop one after another, rapid fire, from the outside in. */
export class Ladis extends Cracker {
  constructor(def, model, ctx, x, z) {
    super(def, model, ctx, x, z);
    this.i = 0;
    this.nextPop = 0;
    this.end = 0;
  }

  tick(dt) {
    const ud = this.model.userData;
    const ctx = this.ctx;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    if (this.t < LADI_LEAD) return;
    const ft = this.t - LADI_LEAD;
    if (ft < LADI_FUSE) {
      if (!this.fuseV) this.fuseV = this.say('fuse');
      // fuse spark creeping toward the first cracker
      const p = ft / LADI_FUSE;
      const p0 = ud.points[0];
      const fx = this.x + ud.fuseTip.x + (p0.x - ud.fuseTip.x) * p;
      const fz = this.z + ud.fuseTip.z + (p0.z - ud.fuseTip.z) * p;
      const c = ctx.ps.cfg.reset();
      c.colors([1, 0.9, 0.55], [1, 0.4, 0.08]);
      c.size = 0.07;
      c.life = 0.3;
      c.drag = 1.5;
      c.gravity = 0.8;
      const n = this.take(60 * this.density, dt);
      for (let k = 0; k < n; k++) {
        const d = this.randDir();
        ctx.ps.emit(fx, 0.15, fz, d[0] * 2, Math.abs(d[1]) * 2 + 1, d[2] * 2);
      }
      ctx.world.glow(fx, 0.3, fz, 1, 0.7, 0.3, 18);
      return;
    }
    if (this.fuseV) {
      this.endVoice(this.fuseV, 0.05);
      this.fuseV = null;
    }
    const pt = ft - LADI_FUSE;
    while (this.i < ud.count && pt >= this.nextPop) {
      this._pop(this.i);
      this.i++;
      // pops speed up slightly, with natural jitter
      this.nextPop += (0.12 - (this.i / ud.count) * 0.04) * (0.6 + Math.random() * 0.8);
    }
    if (this.i >= ud.count) {
      this.end += dt;
      if (this.end > 0.7) this.finish();
    }
  }

  _pop(i) {
    const ud = this.model.userData;
    const ctx = this.ctx;
    const ps = ctx.ps;
    const p = ud.points[i];
    const x = this.x + p.x;
    const z = this.z + p.z;
    const big = i % 9 === 8;
    this.say('snap', { x, y: 0.2, z, size: big ? 1.5 : 0.9 + Math.random() * 0.4 });
    ud.hidePiece(i);
    this.flash(x, 0.2, z, big ? 2.4 : 1.4, 0.1);

    const c = ps.cfg.reset();
    c.colors([1, 0.9, 0.5], [1, 0.3, 0.1]);
    c.drag = 1.8;
    c.gravity = 1;
    c.flash = 1.2;
    const n = Math.max(3, Math.round((big ? 14 : 8) * this.density));
    for (let k = 0; k < n; k++) {
      const d = this.randDir();
      const sp = 3 + Math.random() * 5;
      c.size = 0.09;
      c.life = 0.25 + Math.random() * 0.25;
      ps.emit(x, 0.2, z, d[0] * sp, Math.abs(d[1]) * sp + 1, d[2] * sp);
    }
    // torn red paper
    c.reset();
    c.colors([0.9, 0.12, 0.15], [0.3, 0.04, 0.05]);
    c.size = 0.1;
    c.drag = 0.6;
    c.gravity = 1.5;
    for (let k = 0; k < 3; k++) {
      const d = this.randDir();
      c.life = 0.5 + Math.random() * 0.4;
      ps.emit(x, 0.2, z, d[0] * 3, Math.abs(d[1]) * 4 + 1, d[2] * 3);
    }
    if (i % 2 === 0) ctx.smoke.puff(x, 0.15, z, (Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4, 0.28, 1.6, 0.25, 0.5);
    ctx.world.glow(x, 0.4, z, 1, 0.7, 0.3, big ? 130 : 90);
  }
}

/** Pop Pop Snappers: throw a handful of twist packets; each pops when it lands. */
export class PopPopSnappers extends Cracker {
  constructor(def, model, ctx, x, z) {
    super(def, model, ctx, x, z);
    const radius = 2.8;
    this.items = model.userData.packets.map((p, i) => {
      const a = Math.random() * 6.2831853;
      const r = 0.8 + Math.random() * radius;
      return {
        obj: p.obj,
        sx: p.lx,
        sz: p.lz,
        tx: Math.cos(a) * r,
        tz: Math.sin(a) * r - 0.5,
        delay: i * 0.08,
        dur: 0.4 + Math.random() * 0.35,
        arc: 1.2 + Math.random() * 1.2,
        popped: false,
      };
    });
    this.remaining = this.items.length;
    this.end = 0;
  }

  tick(dt) {
    const ctx = this.ctx;
    if (!this.started) this.started = true;
    for (const it of this.items) {
      if (it.popped) continue;
      const k = (this.t - it.delay) / it.dur;
      if (k < 0) continue;
      if (k >= 1) {
        this._pop(it);
        continue;
      }
      it.obj.position.set(it.sx + (it.tx - it.sx) * k, 0.2 + it.arc * 4 * k * (1 - k), it.sz + (it.tz - it.sz) * k);
      it.obj.rotation.x = k * 9;
      it.obj.rotation.z = k * 6;
    }
    if (this.remaining <= 0) {
      this.end += dt;
      if (this.end > 0.4) this.finish();
    }
    if (this.t > 5) this.finish(); // safety net
  }

  _pop(it) {
    const ctx = this.ctx;
    const ps = ctx.ps;
    it.popped = true;
    this.remaining--;
    it.obj.visible = false;
    const x = this.x + it.tx;
    const z = this.z + it.tz;
    this.say('snapper', { x, y: 0.1, z });
    this.flash(x, 0.12, z, 1.0, 0.08, false);
    const c = ps.cfg.reset();
    c.colors([1, 0.95, 0.7], [1, 0.5, 0.2]);
    c.drag = 2;
    c.gravity = 1.2;
    c.flash = 1;
    const n = Math.max(3, Math.round(10 * this.density));
    for (let k = 0; k < n; k++) {
      const d = this.randDir();
      const sp = 2 + Math.random() * 3;
      c.size = 0.07;
      c.life = 0.2 + Math.random() * 0.2;
      ps.emit(x, 0.1, z, d[0] * sp, Math.abs(d[1]) * sp + 0.5, d[2] * sp);
    }
    ctx.smoke.puff(x, 0.1, z, (Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3, 0.2, 1.2, 0.18, 0.2);
    ctx.world.glow(x, 0.3, z, 1, 0.85, 0.6, 50);
  }
}
