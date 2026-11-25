import * as THREE from 'three';
import { smooth01 } from '../utils/math.js';

/*
 * GPU-simulated, ring-buffer particle pool.
 *
 * Every particle is a slot in a set of typed arrays. A spawn only writes that slot
 * (birth time, velocity, colours...). Motion (gravity + drag, analytic), colour fade,
 * strobe and size are all evaluated in the vertex shader, so the CPU cost per frame is
 * ~0 regardless of how many particles are alive. Trails are pre-scheduled "dots" that
 * are written at spawn time with future birth times (no per-frame work either).
 */

const VERT = /* glsl */ `
attribute vec3 aVel;
attribute vec3 aCol0;
attribute vec3 aCol1;
attribute vec4 aA;   // birth, life, size, drag
attribute vec4 aB;   // gravityScale, strobeHz, seed, flash
uniform float uTime;
uniform float uScale;
uniform float uMaxSize;
uniform float uBoost;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float age = uTime - aA.x;
  float life = aA.y;
  if (age < 0.0 || age > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vAlpha = 0.0;
    return;
  }
  float f = age / life;
  float k = max(aA.w, 0.02);
  vec3 g = vec3(0.0, -9.8 * aB.x, 0.0);
  float e = (1.0 - exp(-k * age)) / k;
  vec3 p = position + (aVel - g / k) * e + (g / k) * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float fade = pow(1.0 - f, 1.4);
  float strobe = 1.0;
  if (aB.y > 0.0) strobe = step(0.5, fract(age * aB.y + aB.z));
  float flash = 1.0 + aB.w * exp(-age * 9.0);
  vAlpha = fade * strobe;
  vColor = mix(aCol0, aCol1, f * f * (3.0 - 2.0 * f)) * flash * uBoost;
  float sz = aA.z * (0.55 + 0.45 * (1.0 - f));
  gl_PointSize = clamp(sz * uScale / max(-mv.z, 0.1), 0.0, uMaxSize);
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float glow = pow(1.0 - d, 2.0);
  float core = exp(-d * d * 10.0);
  float a = (glow * 0.7 + core * 1.2) * vAlpha;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const REBASE_AT = 3000;

function setRange(attr, start, count) {
  if (typeof attr.clearUpdateRanges === 'function') {
    attr.clearUpdateRanges();
    attr.addUpdateRange(start, count);
  } else {
    attr.updateRange.offset = start;
    attr.updateRange.count = count;
  }
}

/** Reusable emit configuration. Mutate it, then call ParticleSystem.emit() - no allocation. */
export class EmitConfig {
  constructor() {
    this.reset();
  }

  reset() {
    this.r0 = 1;
    this.g0 = 1;
    this.b0 = 1;
    this.r1 = 1;
    this.g1 = 1;
    this.b1 = 1;
    this.size = 0.5;
    this.life = 1;
    this.drag = 0.05;
    this.gravity = 1;
    this.strobe = 0;
    this.flash = 0;
    this.trailN = 0;
    this.trailDt = 0.05;
    this.trailLife = 0.4;
    this.trailSize = 0.6;
    this.trailGravity = 0.2;
    return this;
  }

  colors(a, b) {
    this.r0 = a[0];
    this.g0 = a[1];
    this.b0 = a[2];
    this.r1 = b[0];
    this.g1 = b[1];
    this.b1 = b[2];
    return this;
  }
}

export class ParticleSystem {
  /**
   * @param shared  { uScale, uMaxSize } uniform objects owned by the World
   * @param options { capacity }
   */
  constructor(shared, { capacity = 24000 } = {}) {
    this.capacity = capacity;
    this.active = capacity;
    this.head = 0;
    this.time = 0;
    this.cfg = new EmitConfig();
    this.dirtyMin = 1e9;
    this.dirtyMax = -1;

    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col0 = new Float32Array(capacity * 3);
    this.col1 = new Float32Array(capacity * 3);
    this.A = new Float32Array(capacity * 4);
    this.B = new Float32Array(capacity * 4);
    for (let i = 0; i < capacity; i++) {
      this.A[i * 4] = -1e6; // birth long ago
      this.A[i * 4 + 1] = 0.01; // life
    }

    const geo = new THREE.BufferGeometry();
    const attr = (array, size) => {
      const a = new THREE.BufferAttribute(array, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = attr(this.pos, 3);
    this.aVel = attr(this.vel, 3);
    this.aCol0 = attr(this.col0, 3);
    this.aCol1 = attr(this.col1, 3);
    this.aA = attr(this.A, 4);
    this.aB = attr(this.B, 4);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aCol0', this.aCol0);
    geo.setAttribute('aCol1', this.aCol1);
    geo.setAttribute('aA', this.aA);
    geo.setAttribute('aB', this.aB);
    geo.setDrawRange(0, this.active);
    this.attrs = [this.aPos, this.aVel, this.aCol0, this.aCol1, this.aA, this.aB];

    this.uniforms = {
      uTime: { value: 0 },
      uScale: shared.uScale,
      uMaxSize: shared.uMaxSize,
      uBoost: { value: 1.8 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  /** Limits how many pool slots are used/drawn (particle quality). */
  setActiveCapacity(n) {
    this.active = Math.max(256, Math.min(n, this.capacity));
    if (this.head >= this.active) this.head = 0;
    this.points.geometry.setDrawRange(0, this.active);
  }

  /** Emits one particle (plus pre-scheduled trail dots) using the current cfg. */
  emit(px, py, pz, vx, vy, vz) {
    const c = this.cfg;
    this._write(px, py, pz, vx, vy, vz, c.r0, c.g0, c.b0, c.r1, c.g1, c.b1,
      this.time, c.life, c.size, c.drag, c.gravity, c.strobe, Math.random(), c.flash);

    const n = c.trailN;
    if (n <= 0) return;
    const k = Math.max(c.drag, 0.02);
    const gy = -9.8 * c.gravity;
    const gk = gy / k;
    for (let i = 1; i <= n; i++) {
      const t = i * c.trailDt;
      if (t >= c.life) break;
      const e = (1 - Math.exp(-k * t)) / k;
      const f = t / c.life;
      const fade = Math.pow(1 - f, 1.4);
      const s = smooth01(f);
      this._write(
        px + vx * e,
        py + (vy - gk) * e + gk * t,
        pz + vz * e,
        0, 0, 0,
        (c.r0 + (c.r1 - c.r0) * s) * fade,
        (c.g0 + (c.g1 - c.g0) * s) * fade,
        (c.b0 + (c.b1 - c.b0) * s) * fade,
        c.r1 * fade * 0.5, c.g1 * fade * 0.5, c.b1 * fade * 0.5,
        this.time + t,
        c.trailLife,
        c.size * c.trailSize * (0.65 + 0.35 * (1 - f)),
        2.5,
        c.trailGravity,
        0,
        Math.random(),
        0,
      );
    }
  }

  _write(px, py, pz, vx, vy, vz, r0, g0, b0, r1, g1, b1, birth, life, size, drag, grav, strobe, seed, flash) {
    const i = this.head;
    this.head = i + 1 >= this.active ? 0 : i + 1;
    let o = i * 3;
    this.pos[o] = px; this.pos[o + 1] = py; this.pos[o + 2] = pz;
    this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    this.col0[o] = r0; this.col0[o + 1] = g0; this.col0[o + 2] = b0;
    this.col1[o] = r1; this.col1[o + 1] = g1; this.col1[o + 2] = b1;
    o = i * 4;
    this.A[o] = birth; this.A[o + 1] = life; this.A[o + 2] = size; this.A[o + 3] = drag;
    this.B[o] = grav; this.B[o + 1] = strobe; this.B[o + 2] = seed; this.B[o + 3] = flash;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** Kills every particle immediately. */
  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.A[i * 4] = -1e6;
      this.A[i * 4 + 1] = 0.01;
    }
    this.dirtyMin = 0;
    this.dirtyMax = this.capacity - 1;
  }

  update(dt) {
    this.time += dt;
    if (this.time > REBASE_AT) this._rebase();
    this.uniforms.uTime.value = this.time;
    this._flush();
  }

  _rebase() {
    for (let i = 0; i < this.capacity; i++) this.A[i * 4] -= REBASE_AT;
    this.time -= REBASE_AT;
    this.dirtyMin = 0;
    this.dirtyMax = this.capacity - 1;
  }

  _flush() {
    if (this.dirtyMax < this.dirtyMin) return;
    const lo = this.dirtyMin;
    const n = this.dirtyMax - lo + 1;
    for (const a of this.attrs) {
      setRange(a, lo * a.itemSize, n * a.itemSize);
      a.needsUpdate = true;
    }
    this.dirtyMin = 1e9;
    this.dirtyMax = -1;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
