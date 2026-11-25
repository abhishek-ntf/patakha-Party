import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uScale;
uniform float uMaxSize;
uniform float uFlicker;
uniform float uSpeed;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float fl = 1.0 + uFlicker * (0.55 * sin(uTime * uSpeed + aPhase * 6.2831)
                              + 0.45 * sin(uTime * uSpeed * 2.3 + aPhase * 17.0));
  vColor = aColor * fl;
  gl_PointSize = clamp(aSize * fl * uScale / max(-mv.z, 0.1), 1.0, uMaxSize);
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float glow = pow(1.0 - d, 2.2);
  float core = exp(-d * d * 14.0);
  float a = glow * 0.65 + core * 0.9;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Shared additive glow-sprite material (diyas, bulbs, lanterns, distant city lights). */
export function createGlowMaterial(shared, { flicker = 0.12, speed = 6 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uScale: shared.uScale,
      uMaxSize: shared.uMaxSize,
      uFlicker: { value: flicker },
      uSpeed: { value: speed },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Builds a Points object out of glow sprites.
 * items: [{x,y,z,r,g,b,size}] (colour values may exceed 1 for HDR bloom).
 */
export function makeGlowPoints(shared, items, opts) {
  const n = items.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    pos[i * 3] = it.x;
    pos[i * 3 + 1] = it.y;
    pos[i * 3 + 2] = it.z;
    col[i * 3] = it.r;
    col[i * 3 + 1] = it.g;
    col[i * 3 + 2] = it.b;
    size[i] = it.size;
    phase[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const points = new THREE.Points(geo, createGlowMaterial(shared, opts));
  points.frustumCulled = false;
  points.renderOrder = 5;
  return points;
}
