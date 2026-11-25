import { disposeObject } from '../utils/dispose.js';

/** Base class for selectable environments (Courtyard now; River Ghat, monuments... later). */
export class Environment {
  constructor(world) {
    this.world = world;
    this.id = 'environment';
    this.label = 'Environment';
    this.group = null;
    this.atmosphere = {};
    // camera clamp box and playable ground radius
    this.bounds = { minX: -19, maxX: 19, minY: 1.4, maxY: 45, minZ: -17, maxZ: 21.5 };
    this.playRadius = 20;
  }

  build() {}

  update(/* dt, time */) {}

  dispose() {
    if (!this.group) return;
    this.world.scene.remove(this.group);
    disposeObject(this.group);
    this.group = null;
  }
}
