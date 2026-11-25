import { Cracker } from './Cracker.js';
import { flightTime, ballisticVelocity } from '../fireworks/Fireworks.js';
import { PALETTES, randomType } from '../fireworks/ExplosionTypes.js';

const K = 0.02; // must match Fireworks' rocket drag
const G = -9.8 * 0.25; // and rocket gravity scale
const LEAD = 0.3;
const FUSE = 1.2;

/** Rocket: fuse, roaring launch with a whistle, smoke trail and a sky burst. The model flies up. */
export class Rocket extends Cracker {
  constructor(def, model, ctx, x, z) {
    super(def, model, ctx, x, z);
    this.phase = 'fuse';
    this.v = { x: 0, y: 0, z: 0 };
    this.tf = 0;
    this.T = 0;
    this.sy = model.userData.nozzleY;
    this.smokeT = 0;
    this.posT = 0;
  }

  tick(dt) {
    const ctx = this.ctx;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    if (this.phase === 'fuse') {
      if (this.t < LEAD) return;
      const ft = this.t - LEAD;
      if (!this.fuseV) this.fuseV = this.say('fuse');
      if (ft < FUSE) {
        this.fuseBurn(dt, ft / FUSE);
        return;
      }
      this.endVoice(this.fuseV, 0.05);
      this._launch();
      return;
    }
    if (this.phase === 'flight') {
      this._flight(dt);
      return;
    }
    // tail: let the burst sound finish before the instance is released
    this.tail -= dt;
    if (this.tail <= 0) this.finish();
  }

  _launch() {
    const ctx = this.ctx;
    const tx = Math.max(-55, Math.min(55, this.x + (Math.random() * 16 - 8)));
    const ty = 30 + Math.random() * 14;
    const tz = this.z - (14 + Math.random() * 16);
    const T = flightTime(this.sy, ty);
    ballisticVelocity(this.x, this.sy, this.z, tx, ty, tz, T, this.v);
    this.p0x = this.x;
    this.p0z = this.z;
    this.T = T;
    this.phase = 'flight';
    const pal = (Math.random() * PALETTES.length) | 0;
    ctx.fireworks.launch(this.x, this.sy, this.z, tx, ty, tz, randomType(), pal, 1, true, 'rocket');
    this.flightV = this.say('rocketFlight', { y: this.sy, duration: T });
    ctx.rig.lookUp(16, T + 2.6);
    ctx.haptic(20);
    this.flash(this.x, this.sy, this.z, 4, 0.2);
    for (let i = 0; i < 4; i++) {
      ctx.smoke.puff(this.x, 0.4, this.z, (Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5, 0.5, 2.6, 0.4, 0.6);
    }
  }

  _flight(dt) {
    const ctx = this.ctx;
    const ps = ctx.ps;
    this.tf += dt;
    const tf = this.tf;
    if (tf >= this.T) {
      this.model.visible = false;
      this.phase = 'tail';
      this.tail = 0.5;
      if (this.flightV) this.endVoice(this.flightV, 0.1);
      return;
    }
    const e = (1 - Math.exp(-K * tf)) / K;
    const gk = G / K;
    const v = this.v;
    const px = this.p0x + v.x * e;
    const py = this.sy + (v.y - gk) * e + gk * tf;
    const pz = this.p0z + v.z * e;
    const damp = Math.exp(-K * tf);
    const dx = v.x * damp;
    const dy = (v.y - gk) * damp + gk;
    const dz = v.z * damp;
    this.model.position.set(px, py - this.sy, pz);
    this.model.rotation.z = -Math.atan2(dx, dy);
    this.model.rotation.x = Math.atan2(dz, dy);

    // exhaust sparks thrown backwards along the flight path
    const len = Math.hypot(dx, dy, dz) || 1;
    const c = ps.cfg.reset();
    c.colors([1, 0.8, 0.4], [1, 0.3, 0.05]);
    c.size = 0.1;
    c.drag = 1;
    c.gravity = 0.6;
    const n = this.take(90 * this.density, dt);
    for (let i = 0; i < n; i++) {
      const sp = 4 + Math.random() * 5;
      c.life = 0.3 + Math.random() * 0.3;
      ps.emit(px, py, pz,
        (-dx / len) * sp + (Math.random() - 0.5) * 2,
        (-dy / len) * sp + (Math.random() - 0.5) * 2,
        (-dz / len) * sp + (Math.random() - 0.5) * 2);
    }
    this.smokeT += dt;
    if (this.smokeT > 0.05) {
      this.smokeT = 0;
      ctx.smoke.puff(px, py, pz, (Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4, 0.32, 2.6, 0.34, 0.5);
    }
    ctx.world.glow(px, py, pz, 1, 0.7, 0.35, 90);
    this.posT += dt;
    if (this.flightV && this.posT > 0.08) {
      this.posT = 0;
      this.flightV.setPos(px, py, pz);
    }
  }
}

/** Sky Shot: fuse, a mortar thump with muzzle flash and recoil, then a big shell bursts high up. */
export class SkyShot extends Cracker {
  constructor(def, model, ctx, x, z) {
    super(def, model, ctx, x, z);
    this.phase = 'fuse';
    this.recoil = 0;
    this.after = 0;
  }

  tick(dt) {
    const ctx = this.ctx;
    const ud = this.model.userData;
    if (!this.started) {
      this.started = true;
      this.say('match');
    }
    if (this.recoil > 0) {
      this.recoil -= dt;
      ud.tube.scale.y = 1 - 0.07 * Math.max(0, this.recoil / 0.15);
    }
    if (this.phase === 'fuse') {
      if (this.t < 0.3) return;
      const ft = this.t - 0.3;
      if (!this.fuseV) this.fuseV = this.say('fuse');
      if (ft < 1.4) {
        this.fuseBurn(dt, ft / 1.4);
        return;
      }
      this.endVoice(this.fuseV, 0.05);
      this._fire();
      return;
    }
    // after firing keep the muzzle glow briefly, then release
    this.after += dt;
    ctx.world.glow(this.x, ud.muzzleY + 0.5, this.z, 1, 0.8, 0.5, 120 * Math.max(0, 1 - this.after / 0.5));
    if (this.after > 0.8) this.finish();
  }

  _fire() {
    const ctx = this.ctx;
    const ps = ctx.ps;
    const y = this.model.userData.muzzleY;
    this.phase = 'fired';
    const tx = Math.max(-55, Math.min(55, this.x + (Math.random() * 20 - 10)));
    const ty = 34 + Math.random() * 14;
    const tz = this.z - (18 + Math.random() * 14);
    const T = flightTime(y, ty);
    const types = ['peony', 'ring', 'willow', 'peony'];
    ctx.fireworks.launch(this.x, y, this.z, tx, ty, tz, types[(Math.random() * types.length) | 0], (Math.random() * PALETTES.length) | 0, 1.35, true, 'skyshot');
    this.say('mortar', { y, duration: T });
    ctx.rig.lookUp(16, T + 2.6);
    ctx.rig.addShake(0.25);
    ctx.haptic(30);
    this.recoil = 0.15;
    this.flash(this.x, y, this.z, 7, 0.18);
    ctx.world.flash(this.x, y + 0.3, this.z, 1, 0.85, 0.55, 380);
    const c = ps.cfg.reset();
    c.colors([1, 0.9, 0.5], [1, 0.4, 0.1]);
    c.drag = 1;
    c.gravity = 1;
    c.life = 0.7;
    const n = Math.max(10, Math.round(50 * this.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 0.35;
      const phi = Math.random() * 6.2831853;
      const sp = 8 + Math.random() * 8;
      c.size = 0.12;
      c.life = 0.5 + Math.random() * 0.4;
      ps.emit(this.x, y, this.z, Math.sin(a) * Math.cos(phi) * sp, Math.cos(a) * sp, Math.sin(a) * Math.sin(phi) * sp);
    }
    for (let i = 0; i < 6; i++) {
      ctx.smoke.puff(this.x, y, this.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.7, 3.5, 0.45, 0.6);
    }
  }
}
