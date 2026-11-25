import { TAU, rand } from '../utils/math.js';

/**
 * Explosion library. Each type is a function (fw, x, y, z, pal, scale) that fills the
 * shared particle pool. Phase 3 adds the remaining types by registering more entries here.
 */

// HDR colour pairs [start, end] - values above 1 feed the bloom pass.
export const PALETTES = [
  { name: 'gold',    a: [1.0, 0.78, 0.25], b: [1.0, 0.22, 0.04] },
  { name: 'magenta', a: [1.0, 0.22, 0.8],  b: [0.45, 0.1, 1.0] },
  { name: 'cyan',    a: [0.3, 0.9, 1.0],   b: [0.1, 0.3, 1.0] },
  { name: 'emerald', a: [0.45, 1.0, 0.4],  b: [0.05, 0.65, 0.55] },
  { name: 'crimson', a: [1.0, 0.25, 0.2],  b: [0.6, 0.04, 0.2] },
  { name: 'silver',  a: [1.0, 1.0, 1.0],   b: [0.55, 0.7, 1.0] },
  { name: 'saffron', a: [1.0, 0.55, 0.1],  b: [1.0, 0.15, 0.1] },
];

export const TYPE_WEIGHTS = [
  ['peony', 0.5],
  ['willow', 0.25],
  ['ring', 0.25],
];

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const _d = [0, 0, 0];

function sphereDir(i, n, out) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = GOLDEN_ANGLE * i;
  out[0] = Math.cos(th) * r;
  out[1] = y;
  out[2] = Math.sin(th) * r;
}

function coreFlash(ps, x, y, z, pal, size) {
  const c = ps.cfg.reset();
  c.colors([1, 0.95, 0.85], pal.a);
  c.size = size;
  c.life = 0.28;
  c.drag = 1;
  c.gravity = 0;
  ps.emit(x, y, z, 0, 0, 0);
}

export const ExplosionTypes = {
  /** Classic spherical burst of bright stars. */
  peony(fw, x, y, z, pal, s) {
    const ps = fw.ps;
    const n = Math.round(240 * fw.density * s);
    const c = ps.cfg.reset();
    c.colors(pal.a, pal.b);
    c.size = 0.6;
    c.drag = 1.8;
    c.gravity = 0.35;
    c.flash = 1.2;
    c.trailN = Math.round(3 * fw.trails);
    c.trailDt = 0.05;
    c.trailLife = 0.35;
    c.trailSize = 0.55;
    for (let i = 0; i < n; i++) {
      sphereDir(i, n, _d);
      const sp = (24 + Math.random() * 5) * s;
      c.life = 1.9 + Math.random() * 0.8;
      ps.emit(x, y, z, _d[0] * sp, _d[1] * sp, _d[2] * sp);
    }
    coreFlash(ps, x, y, z, pal, 16 * s);
  },

  /** Heavy gold stars that droop into long glowing trails. */
  willow(fw, x, y, z, pal, s) {
    const ps = fw.ps;
    const n = Math.round(140 * fw.density * s);
    const c = ps.cfg.reset();
    c.colors([1.0, 0.8, 0.35], [1.0, 0.3, 0.05]);
    c.size = 0.5;
    c.drag = 1.2;
    c.gravity = 0.6;
    c.flash = 0.8;
    c.trailN = Math.round(16 * fw.trails);
    c.trailDt = 0.1;
    c.trailLife = 1.1;
    c.trailSize = 0.5;
    c.trailGravity = 0.35;
    for (let i = 0; i < n; i++) {
      sphereDir(i, n, _d);
      const sp = (17 + Math.random() * 5) * s;
      c.life = 3.4 + Math.random() * 0.8;
      ps.emit(x, y, z, _d[0] * sp, _d[1] * sp, _d[2] * sp);
    }
    coreFlash(ps, x, y, z, pal, 14 * s);
  },

  /** A flat ring of stars on a randomly tilted plane, with a small centre pop. */
  ring(fw, x, y, z, pal, s) {
    const ps = fw.ps;
    const n = Math.round(90 * fw.density * s);
    // random orthonormal basis (u, v) of the ring plane
    const nx = rand(-1, 1);
    const ny = rand(-0.4, 1);
    const nz = rand(-1, 1);
    const nl = Math.hypot(nx, ny, nz) || 1;
    let ux = -nz / nl;
    let uz = nx / nl;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    const vx = (ny / nl) * uz;
    const vy = (nz / nl) * ux - (nx / nl) * uz;
    const vz = -(ny / nl) * ux;
    const c = ps.cfg.reset();
    c.colors(pal.a, pal.b);
    c.size = 0.6;
    c.drag = 1.8;
    c.gravity = 0.3;
    c.flash = 1.2;
    c.trailN = Math.round(3 * fw.trails);
    c.trailDt = 0.05;
    c.trailLife = 0.35;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sp = 26 * s;
      c.life = 2.0 + Math.random() * 0.4;
      ps.emit(x, y, z, (ux * ca + vx * sa) * sp, vy * sa * sp, (uz * ca + vz * sa) * sp);
    }
    const m = Math.round(36 * fw.density * s);
    c.reset();
    c.colors([1, 1, 1], pal.b);
    c.size = 0.4;
    c.drag = 2.2;
    c.gravity = 0.4;
    c.life = 1.4;
    for (let i = 0; i < m; i++) {
      sphereDir(i, m, _d);
      const sp = 8 * s * (0.4 + Math.random() * 0.6);
      ps.emit(x, y, z, _d[0] * sp, _d[1] * sp, _d[2] * sp);
    }
    coreFlash(ps, x, y, z, pal, 12 * s);
  },
};

export function explode(type, fw, x, y, z, pal, scale = 1) {
  (ExplosionTypes[type] || ExplosionTypes.peony)(fw, x, y, z, pal, scale);
}

export function randomType() {
  let r = Math.random();
  for (const [name, w] of TYPE_WEIGHTS) {
    if ((r -= w) <= 0) return name;
  }
  return 'peony';
}
