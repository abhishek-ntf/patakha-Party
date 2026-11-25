import * as THREE from 'three';
import { clamp } from '../utils/math.js';

/** Converts screen coordinates into world positions (ground hits and sky targets). */
export class Pointing {
  constructor(camera) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
  }

  _cast(x, y, rect) {
    this.ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray;
  }

  /** Intersects the ground plane (y = 0). Returns false when the ray points at the sky. */
  groundPoint(x, y, rect, out) {
    const ray = this._cast(x, y, rect);
    if (ray.direction.y > -1e-4) return false;
    const t = -ray.origin.y / ray.direction.y;
    out.set(ray.origin.x + ray.direction.x * t, 0, ray.origin.z + ray.direction.z * t);
    return true;
  }

  /** A burst target far along the ray, kept at a pleasing firework altitude. */
  skyPoint(x, y, rect, out, distance = 90) {
    const ray = this._cast(x, y, rect);
    out.copy(ray.origin).addScaledVector(ray.direction, distance);
    out.y = clamp(out.y, 20, 60);
    out.x = clamp(out.x, -70, 70);
    out.z = clamp(out.z, -100, -25);
    return out;
  }
}
