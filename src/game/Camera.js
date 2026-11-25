import * as THREE from 'three';
import { clamp, damp } from '../utils/math.js';

const PRESETS = {
  menu:   { tx: 0, ty: 1.5, tz: 2, yaw: 0, pitch: 0.2,  dist: 20, aim: 10,  sway: 0.35 },
  ground: { tx: 0, ty: 0.4, tz: 4, yaw: 0, pitch: 0.28, dist: 12, aim: 2.5, sway: 0 },
  sky:    { tx: 0, ty: 1.0, tz: 8, yaw: 0, pitch: 0.1,  dist: 15, aim: 8,   sway: 0 },
  show:   { tx: 0, ty: 1.0, tz: 6, yaw: 0, pitch: 0.12, dist: 20, aim: 10,  sway: 0.28 },
};
const KEYS = ['tx', 'ty', 'tz', 'yaw', 'pitch', 'dist', 'aim', 'sway'];

/**
 * Smooth orbit camera. The camera orbits (yaw / pitch / distance) around a target and
 * looks `aim` metres above it, which lets presets frame the sky or the ground.
 * Everything is critically damped, so preset changes become cinematic transitions.
 */
export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1400);
    this.goal = { ...PRESETS.menu };
    this.cur = { ...PRESETS.menu };
    this.preset = 'menu';
    this.bounds = null;
    this.shake = 0;
    this._aimTimer = 0;
    this.baseFov = 55;
    this.update(0, 0);
  }

  setBounds(b) {
    this.bounds = b;
  }

  setPreset(name, instant = false) {
    const p = PRESETS[name];
    if (!p) return;
    this.preset = name;
    this._aimTimer = 0;
    Object.assign(this.goal, p);
    if (instant) Object.assign(this.cur, p);
  }

  resetView() {
    this.setPreset(this.preset);
  }

  /** Drag deltas in pixels. */
  rotate(dx, dy) {
    this.goal.yaw = clamp(this.goal.yaw - dx * 0.005, -1.25, 1.25);
    this.goal.pitch = clamp(this.goal.pitch + dy * 0.004, -0.05, 1.25);
  }

  zoom(delta) {
    this.goal.dist = clamp(this.goal.dist + delta, 8, 24);
  }

  /** Tilts the view up for `hold` seconds (to follow rockets), then returns to the preset. */
  lookUp(aim, hold) {
    this.goal.aim = aim;
    this._aimTimer = Math.max(this._aimTimer, hold);
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    // widen the vertical field of view on portrait screens so the scene is not cropped
    this.camera.fov = aspect < 1 ? Math.min(78, this.baseFov + (1 / aspect - 1) * 18) : this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  update(dt, time) {
    const cur = this.cur;
    const goal = this.goal;
    if (this._aimTimer > 0) {
      this._aimTimer -= dt;
      if (this._aimTimer <= 0) goal.aim = PRESETS[this.preset].aim;
    }
    for (const k of KEYS) cur[k] = damp(cur[k], goal[k], 3.2, dt);

    const yaw = cur.yaw + Math.sin(time * 0.13) * cur.sway;
    const pitch = cur.pitch + Math.sin(time * 0.09 + 1) * cur.sway * 0.12;
    const cp = Math.cos(pitch);
    let x = cur.tx + cur.dist * cp * Math.sin(yaw);
    let y = cur.ty + cur.dist * Math.sin(pitch);
    let z = cur.tz + cur.dist * cp * Math.cos(yaw);

    const b = this.bounds;
    if (b) {
      x = clamp(x, b.minX, b.maxX);
      y = clamp(y, b.minY, b.maxY);
      z = clamp(z, b.minZ, b.maxZ);
    }

    if (this.shake > 0.001) {
      this.shake *= Math.exp(-4 * dt);
      const s = this.shake * 0.35;
      x += Math.sin(time * 47.3) * Math.sin(time * 13.1) * s;
      y += Math.sin(time * 53.7 + 2) * Math.sin(time * 11.3) * s;
    }

    this.camera.position.set(x, y, z);
    this.camera.lookAt(cur.tx, cur.ty + cur.aim, cur.tz);
  }
}
