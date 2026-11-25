import * as THREE from 'three';
import { BaseMode } from './BaseMode.js';
import { rand } from '../utils/math.js';

const _p = new THREE.Vector3();

/**
 * Ground view with the cracker tray. Pick a cracker, tap the floor to move it, then light it
 * with the button (or by tapping it). With nothing selected a tap lights a plain spark fountain,
 * exactly as in Phase 1.
 */
export class GroundMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'ground';
    this.cameraPreset = 'ground';
    this.hint = ''; // the tray carries the instructions
  }

  enter() {
    super.enter();
    this.game.crackers.resume();
    this.game.ui.tray.show();
  }

  exit() {
    this.game.crackers.suspend();
    this.game.ui.tray.hide();
  }

  update(dt) {
    this.game.crackers.update(dt);
    this.game.ui.tray.update(dt);
  }

  onTap(x, y, rect) {
    const g = this.game;
    const cr = g.crackers;
    if (cr.selected) {
      if (cr.hitTest(x, y, rect)) {
        cr.ignite();
        return;
      }
      if (!g.pointing.groundPoint(x, y, rect, _p)) return;
      const r = g.scenes.current.playRadius;
      if (Math.abs(_p.x) > r || Math.abs(_p.z) > r) {
        g.ui.hud.toast('Tap inside the courtyard');
        return;
      }
      // a tap right next to the cracker lights it, anywhere else moves it
      if (Math.hypot(_p.x - cr.pos.x, _p.z - cr.pos.z) < 0.9 && cr.canIgnite()) cr.ignite();
      else cr.moveTo(_p.x, _p.z);
      return;
    }
    if (!g.pointing.groundPoint(x, y, rect, _p)) return;
    const r = g.scenes.current.playRadius;
    if (Math.abs(_p.x) > r || Math.abs(_p.z) > r) {
      g.ui.hud.toast('Tap inside the courtyard');
      return;
    }
    this._fountain(_p.x, _p.z);
  }

  onKey(e) {
    const cr = this.game.crackers;
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      this.game.audio.play('select');
      cr.selectRelative(1);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      this.game.audio.play('select');
      cr.selectRelative(-1);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      if (cr.selected) cr.ignite();
      else this._fountain(rand(-8, 8), rand(-4, 10));
    }
  }

  _fountain(x, z) {
    const g = this.game;
    if (g.fireworks.fountain(x, z)) {
      g.progress.recordLaunch();
      g.progress.addXP(2);
      g.haptic(14);
    }
  }
}
