import { BaseMode } from './BaseMode.js';

/** Sky view: tap or click anywhere in the sky to fire a rocket that bursts there. */
export class SkyMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'sky';
    this.cameraPreset = 'sky';
    this.hint = 'Tap the sky to launch fireworks. Drag to look around. Space fires a random one.';
    this.cooldown = 0;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  onTap(x, y, rect) {
    if (this.cooldown > 0) return;
    this.cooldown = 0.12;
    this.game.launchAtScreen(x, y, rect, true);
  }

  onKey(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.game.fireworks.launchRandomSky(null, true)) {
        this.game.progress.recordLaunch();
        this.game.progress.addXP(3);
      }
    }
  }
}
