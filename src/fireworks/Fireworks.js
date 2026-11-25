import { EventBus } from '../utils/EventBus.js';
import { PALETTES, explode, randomType } from './ExplosionTypes.js';
import { rand } from '../utils/math.js';

const MAX_ROCKETS = 48;
const MAX_FOUNTAINS = 24;
const ROCKET_GRAVITY = 0.25;
const ROCKET_DRAG = 0.02;

/** Flight time (seconds) of a rocket climbing from height sy to ty. */
export const flightTime = (sy, ty) => 1.0 + Math.max(0, ty - sy) / 55;

/** Launch velocity that makes the shader-simulated rocket pass exactly through the target. */
export function ballisticVelocity(sx, sy, sz, tx, ty, tz, T, out) {
  const k = ROCKET_DRAG;
  const g = -9.8 * ROCKET_GRAVITY;
  const e = (1 - Math.exp(-k * T)) / k;
  const gk = g / k;
  out.x = (tx - sx) / e;
  out.z = (tz - sz) / e;
  out.y = (ty - sy - gk * T) / e + gk;
  return out;
}

/**
 * Launch + burst orchestration on top of the pooled ParticleSystem.
 * Emits: 'launch' {x,y,z,user,tag,flight}, 'burst' {x,y,z,type,size,r,g,b,tag}, 'fountain' {x,z}.
 * `tag` marks launches made by crackers ('rocket', 'skyshot') so audio can pick matching sounds.
 * (Phase 2 audio and Phase 3 crackers subscribe to these events.)
 */
export class Fireworks extends EventBus {
  constructor(particles) {
    super();
    this.ps = particles;
    this.density = 1;
    this.trails = 1;
    this.rockets = [];
    for (let i = 0; i < MAX_ROCKETS; i++) {
      this.rockets.push({ active: false, t: 0, flight: 1, x: 0, y: 0, z: 0, type: 'peony', pal: 0, scale: 1, tag: null });
    }
    this.fountains = [];
    for (let i = 0; i < MAX_FOUNTAINS; i++) {
      this.fountains.push({ active: false, t: 0, dur: 3, x: 0, z: 0, pal: 0, scale: 1, acc: 0 });
    }
    this._burstEvent = { x: 0, y: 0, z: 0, type: '', size: 1, r: 1, g: 1, b: 1, tag: null };
    this._v = { x: 0, y: 0, z: 0 };
  }

  setQuality(density, trails) {
    this.density = density;
    this.trails = trails;
  }

  /**
   * Fires a rocket from (sx,sy,sz) that bursts exactly at (tx,ty,tz).
   * Returns false when the rocket pool is exhausted.
   */
  launch(sx, sy, sz, tx, ty, tz, type = null, palIndex = -1, scale = 1, user = false, tag = null) {
    const r = this.rockets.find((q) => !q.active);
    if (!r) return false;
    const T = flightTime(sy, ty);
    r.active = true;
    r.t = 0;
    r.flight = T;
    r.x = tx;
    r.y = ty;
    r.z = tz;
    r.type = type || randomType();
    r.pal = palIndex >= 0 ? palIndex : (Math.random() * PALETTES.length) | 0;
    r.scale = scale;
    r.tag = tag;

    // exact ballistic solve for the analytic (gravity + drag) motion used by the shader
    const k = ROCKET_DRAG;
    const vel = ballisticVelocity(sx, sy, sz, tx, ty, tz, T, this._v);
    const vx = vel.x;
    const vy = vel.y;
    const vz = vel.z;

    const ps = this.ps;
    const c = ps.cfg.reset();
    c.colors([1.0, 0.9, 0.6], [1.0, 0.4, 0.1]);
    c.size = 0.55;
    c.life = T;
    c.drag = k;
    c.gravity = ROCKET_GRAVITY;
    c.flash = 1;
    c.trailN = Math.max(4, Math.round(34 * this.trails));
    c.trailDt = T / c.trailN;
    c.trailLife = 0.5;
    c.trailSize = 0.55;
    c.trailGravity = 0.1;
    ps.emit(sx, sy, sz, vx, vy, vz);

    // mortar spark puff
    c.reset();
    c.colors([1, 0.8, 0.4], [1, 0.3, 0.05]);
    c.size = 0.22;
    c.life = 0.6;
    c.drag = 1.5;
    c.gravity = 0.6;
    const puff = Math.round(10 * this.density) + 2;
    for (let i = 0; i < puff; i++) {
      ps.emit(sx, sy, sz, rand(-3, 3), rand(2, 7), rand(-3, 3));
    }
    this.emit('launch', { x: sx, y: sy, z: sz, user, tag, flight: T });
    return true;
  }

  /** Random show launch somewhere in the sky arc in front of the courtyard. */
  launchRandomSky(type = null, user = false) {
    const tx = rand(-48, 48);
    const ty = rand(26, 58);
    const tz = rand(-88, -42);
    return this.launch(tx * 0.3, 0.3, rand(-12, -2), tx, ty, tz, type, -1, rand(0.85, 1.25), user);
  }

  /** Lights a spark fountain on the ground (Phase 1 test emitter; crackers replace it in Phase 3). */
  fountain(x, z, palIndex = -1, duration = 3.2, scale = 1) {
    const f = this.fountains.find((q) => !q.active);
    if (!f) return false;
    f.active = true;
    f.t = 0;
    f.dur = duration;
    f.x = x;
    f.z = z;
    f.pal = palIndex >= 0 ? palIndex : (Math.random() * PALETTES.length) | 0;
    f.scale = scale;
    f.acc = 0;
    this.emit('fountain', { x, z });
    return true;
  }

  update(dt) {
    for (const r of this.rockets) {
      if (!r.active) continue;
      r.t += dt;
      if (r.t >= r.flight) {
        r.active = false;
        this._burst(r);
      }
    }
    const ps = this.ps;
    for (const f of this.fountains) {
      if (!f.active) continue;
      f.t += dt;
      const tail = f.dur - f.t;
      const power = tail < 0.6 ? Math.max(0, tail / 0.6) : 1;
      f.acc += 150 * this.density * power * f.scale * dt;
      const pal = PALETTES[f.pal];
      const c = ps.cfg.reset();
      c.colors(pal.a, pal.b);
      c.size = 0.14;
      c.drag = 0.4;
      c.gravity = 1;
      c.trailN = Math.round(2 * this.trails);
      c.trailDt = 0.05;
      c.trailLife = 0.25;
      while (f.acc >= 1) {
        f.acc -= 1;
        const a = Math.random() * 0.34;
        const phi = Math.random() * 6.2831853;
        const sp = rand(8, 13) * f.scale;
        c.life = rand(0.8, 1.4);
        c.strobe = Math.random() < 0.2 ? 14 : 0;
        ps.emit(f.x, 0.15, f.z, Math.sin(a) * Math.cos(phi) * sp, Math.cos(a) * sp, Math.sin(a) * Math.sin(phi) * sp);
      }
      if (f.t >= f.dur) f.active = false;
    }
  }

  _burst(r) {
    const pal = PALETTES[r.pal];
    explode(r.type, this, r.x, r.y, r.z, pal, r.scale);
    const e = this._burstEvent;
    e.x = r.x;
    e.y = r.y;
    e.z = r.z;
    e.type = r.type;
    e.size = r.scale;
    e.r = pal.a[0];
    e.g = pal.a[1];
    e.b = pal.a[2];
    e.tag = r.tag;
    this.emit('burst', e);
  }

  /** Cancels everything in flight (used when leaving a mode). */
  clear() {
    for (const r of this.rockets) r.active = false;
    for (const f of this.fountains) f.active = false;
    this.ps.clear();
  }
}
