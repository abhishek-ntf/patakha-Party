import * as THREE from 'three';

/*
 * Pooled smoke puffs. Same idea as ParticleSystem: a ring buffer of GPU-animated sprites,
 * but alpha-blended, growing with age and drifting with a light wind.
 */
const VERT = /* glsl */ `
attribute vec3 aVel;
attribute vec4 aA;      // birth, life, size, opacity
attribute float aWarm;  // 1 = lit by sparks (orange), fades to grey
uniform float uTime;
uniform float uScale;
uniform float uMaxSize;
varying float vAlpha;
varying float vWarm;
void main() {
  float age = uTime - aA.x;
  if (age < 0.0 || age > aA.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vWarm = 0.0;
    return;
  }
  float f = age / aA.y;
  vec3 p = position + aVel * ((1.0 - exp(-1.1 * age)) / 1.1) + vec3(0.28, 0.1, -0.12) * age * (0.4 + f);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float fadeIn = smoothstep(0.0, 0.1, f);
  vAlpha = aA.w * fadeIn * (1.0 - f) * (1.0 - f);
  vWarm = aWarm * (1.0 - smoothstep(0.0, 0.35, f));
  float size = aA.z * (1.0 + 3.4 * sqrt(f));
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 0.0, uMaxSize);
}`;

const FRAG = /* glsl */ `
uniform vec3 uLit;
varying float vAlpha;
varying float vWarm;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = smoothstep(1.0, 0.15, d) * vAlpha;
  vec3 col = mix(vec3(0.17, 0.16, 0.24), vec3(0.85, 0.42, 0.14), vWarm) + uLit;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SmokeSystem {
  constructor(shared, { capacity = 1400 } = {}) {
    this.capacity = capacity;
    this.active = capacity;
    this.head = 0;
    this.time = 0;
    this.dirtyMin = 1e9;
    this.dirtyMax = -1;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.A = new Float32Array(capacity * 4);
    this.warm = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.A[i * 4] = -1e6;
      this.A[i * 4 + 1] = 0.01;
    }
    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => {
      const a = new THREE.BufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attrs = [attr(this.pos, 3), attr(this.vel, 3), attr(this.A, 4), attr(this.warm, 1)];
    geo.setAttribute('position', this.attrs[0]);
    geo.setAttribute('aVel', this.attrs[1]);
    geo.setAttribute('aA', this.attrs[2]);
    geo.setAttribute('aWarm', this.attrs[3]);
    geo.setDrawRange(0, this.active);
    this.uniforms = {
      uTime: { value: 0 },
      uScale: shared.uScale,
      uMaxSize: shared.uMaxSize,
      uLit: { value: new THREE.Color(0, 0, 0) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 15;
  }

  setActiveCapacity(n) {
    this.active = Math.max(200, Math.min(n, this.capacity));
    if (this.head >= this.active) this.head = 0;
    this.points.geometry.setDrawRange(0, this.active);
  }

  /** One smoke puff. size in metres, opacity 0..1, warm 0..1 (lit by sparks). */
  puff(x, y, z, vx, vy, vz, size, life, opacity = 0.5, warm = 0) {
    const i = this.head;
    this.head = i + 1 >= this.active ? 0 : i + 1;
    let o = i * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    o = i * 4;
    this.A[o] = this.time; this.A[o + 1] = life; this.A[o + 2] = size; this.A[o + 3] = opacity;
    this.warm[i] = warm;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.A[i * 4] = -1e6;
      this.A[i * 4 + 1] = 0.01;
    }
    this.dirtyMin = 0;
    this.dirtyMax = this.capacity - 1;
  }

  /** `flash` is the world's burst light; smoke picks up a little of its colour. */
  update(dt, flash) {
    this.time += dt;
    if (this.time > 3000) {
      for (let i = 0; i < this.capacity; i++) this.A[i * 4] -= 3000;
      this.time -= 3000;
      this.dirtyMin = 0;
      this.dirtyMax = this.capacity - 1;
    }
    this.uniforms.uTime.value = this.time;
    if (flash) {
      const k = Math.min(1.2, flash.intensity / 900) * 0.45;
      this.uniforms.uLit.value.setRGB(flash.color.r * k, flash.color.g * k, flash.color.b * k);
    }
    if (this.dirtyMax >= this.dirtyMin) {
      const lo = this.dirtyMin;
      const n = this.dirtyMax - lo + 1;
      for (const a of this.attrs) {
        if (typeof a.clearUpdateRanges === 'function') {
          a.clearUpdateRanges();
          a.addUpdateRange(lo * a.itemSize, n * a.itemSize);
        } else {
          a.updateRange.offset = lo * a.itemSize;
          a.updateRange.count = n * a.itemSize;
        }
        a.needsUpdate = true;
      }
      this.dirtyMin = 1e9;
      this.dirtyMax = -1;
    }
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
