import { Courtyard } from './Courtyard.js';

/** Loads / swaps environments and keeps the world atmosphere in sync. */
export class SceneManager {
  constructor(world) {
    this.world = world;
    this.registry = { courtyard: Courtyard };
    this.current = null;
    this.currentId = null;
  }

  load(id) {
    const Env = this.registry[id];
    if (!Env) throw new Error(`Unknown environment: ${id}`);
    if (this.current) this.current.dispose();
    this.current = new Env(this.world);
    this.currentId = id;
    this.current.build();
    this.world.setAtmosphere(this.current.atmosphere);
    return this.current;
  }

  update(dt, time) {
    if (this.current) this.current.update(dt, time);
  }

  dispose() {
    if (this.current) this.current.dispose();
    this.current = null;
  }
}
