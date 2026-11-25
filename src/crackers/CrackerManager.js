import * as THREE from 'three';
import { EventBus } from '../utils/EventBus.js';
import { CRACKERS, CRACKER_BY_ID } from './CrackerCatalog.js';
import { disposeModelCache } from './CrackerModels.js';

const MAX_PER_TYPE = 4;

/**
 * Selection, placement and ignition of crackers on the courtyard floor.
 * Emits 'change' whenever selection / burning state changes and 'ignite' {def}.
 */
export class CrackerManager extends EventBus {
  constructor(game) {
    super();
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'crackers';
    this.group.visible = false;
    game.world.scene.add(this.group);
    this.selectedId = null;
    this.placed = null;
    this.active = [];
    this.pos = { x: 0, z: 4 };
    this.suspended = true;

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.8, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.4), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.marker.visible = false;
    this.group.add(this.marker);

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.time = 0;
    this.ctx = {
      ps: game.particles,
      smoke: game.smoke,
      fireworks: game.fireworks,
      audio: game.audio,
      world: game.world,
      rig: game.rig,
      haptic: (ms) => game.haptic(ms),
      radius: game.scenes.current.playRadius,
    };
  }

  get selected() {
    return this.selectedId ? CRACKER_BY_ID[this.selectedId] : null;
  }

  select(id) {
    if (id === this.selectedId && this.placed) return;
    this.selectedId = id;
    this._dropPlaced();
    if (id && !this.suspended) this._spawnPlaced();
    this.emit('change');
  }

  selectRelative(step) {
    const i = CRACKERS.findIndex((c) => c.id === this.selectedId);
    const n = CRACKERS.length;
    const next = i < 0 ? (step > 0 ? 0 : n - 1) : (i + step + n) % n;
    this.select(CRACKERS[next].id);
  }

  _spawnPlaced() {
    const def = this.selected;
    if (!def) return;
    this.placed = def.build();
    this.placed.position.set(this.pos.x, 0, this.pos.z);
    this.group.add(this.placed);
    this.marker.visible = true;
    this.marker.material.color.set(def.accent).multiplyScalar(1.7);
    this.marker.position.set(this.pos.x, 0.03, this.pos.z);
  }

  _dropPlaced() {
    if (this.placed) {
      this._removeModel(this.placed);
      this.placed = null;
    }
    this.marker.visible = false;
  }

  _removeModel(model) {
    this.group.remove(model);
    model.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.isLine && o.geometry) o.geometry.dispose();
    });
  }

  moveTo(x, z) {
    const r = this.ctx.radius * 0.9;
    this.pos.x = Math.max(-r, Math.min(r, x));
    this.pos.z = Math.max(-r, Math.min(r, z));
    if (this.placed) this.placed.position.set(this.pos.x, 0, this.pos.z);
    this.marker.position.set(this.pos.x, 0.03, this.pos.z);
  }

  /** True when the selected cracker may be lit right now. */
  canIgnite() {
    const def = this.selected;
    if (!def || !this.placed || this.suspended) return false;
    const running = this.active.filter((a) => a.def.id === def.id).length;
    return def.repeatable ? running < MAX_PER_TYPE : running === 0;
  }

  isBurning(id = this.selectedId) {
    return this.active.some((a) => a.def.id === id);
  }

  ignite() {
    if (!this.canIgnite()) return false;
    const def = this.selected;
    let model;
    if (def.repeatable) {
      model = def.build();
      this.group.add(model);
    } else {
      model = this.placed; // the placed model itself burns
      this.placed = null;
      this.marker.visible = false;
    }
    const inst = new def.Behavior(def, model, this.ctx, this.pos.x, this.pos.z);
    this.active.push(inst);
    this.emit('ignite', def);
    this.emit('change');
    return true;
  }

  /** Is the screen position on the placed cracker? */
  hitTest(x, y, rect) {
    if (!this.placed || this.suspended) return false;
    this.ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.game.rig.camera);
    return this.raycaster.intersectObject(this.placed, true).length > 0;
  }

  update(dt) {
    if (this.suspended) return;
    this.time += dt;
    if (this.marker.visible) {
      const s = 1 + Math.sin(this.time * 4) * 0.05;
      this.marker.scale.set(s, s, 1);
      this.marker.material.opacity = 0.65 + Math.sin(this.time * 4) * 0.2;
    }
    let changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.update(dt);
      if (!a.done) continue;
      this._removeModel(a.model);
      this.active.splice(i, 1);
      if (!a.def.repeatable && this.selectedId === a.def.id && !this.placed) this._spawnPlaced();
      changed = true;
    }
    if (changed) this.emit('change');
  }

  /** Leaving the ground view: stop everything and take the models off the floor. */
  suspend() {
    this.suspended = true;
    for (const a of this.active) {
      a.abort();
      this._removeModel(a.model);
    }
    this.active.length = 0;
    this._dropPlaced();
    this.group.visible = false;
    this.emit('change');
  }

  resume() {
    this.suspended = false;
    this.group.visible = true;
    if (this.selectedId && !this.placed) this._spawnPlaced();
    this.emit('change');
  }

  dispose() {
    this.suspend();
    this.game.world.scene.remove(this.group);
    this.marker.geometry.dispose();
    this.marker.material.dispose();
    disposeModelCache();
    this.clear();
  }
}
