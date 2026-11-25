import { BaseMode } from './BaseMode.js';
import { rand } from '../utils/math.js';

/** Title screen: slow cinematic camera sway and an ambient fireworks display behind the menu. */
export class MenuMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'menu';
    this.cameraPreset = 'menu';
    this.timer = 0;
  }

  enter() {
    super.enter();
    this.timer = 0.6;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.game.fireworks.launchRandomSky();
      this.timer = rand(1.6, 3.2);
    }
  }

  onTap(x, y, rect) {
    this.game.launchAtScreen(x, y, rect, false);
  }
}
