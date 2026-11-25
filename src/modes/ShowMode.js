import { BaseMode } from './BaseMode.js';
import { rand } from '../utils/math.js';

const FINALE_EVERY = 28; // seconds between grand volleys
const FINALE_SHELLS = 14;

/** Automatic show: continuous launches with a barrage every so often, under a swaying camera. */
export class ShowMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'show';
    this.cameraPreset = 'show';
    this.hint = 'Sit back and enjoy the show. Drag to look around.';
    this.reset();
  }

  reset() {
    this.t = 0;
    this.timer = 0.5;
    this.nextFinale = FINALE_EVERY;
    this.finaleLeft = 0;
    this.finaleTimer = 0;
  }

  enter() {
    super.enter();
    this.reset();
  }

  update(dt) {
    const fw = this.game.fireworks;
    this.t += dt;

    if (this.finaleLeft > 0) {
      this.finaleTimer -= dt;
      while (this.finaleTimer <= 0 && this.finaleLeft > 0) {
        fw.launchRandomSky();
        this.finaleLeft--;
        this.finaleTimer += rand(0.1, 0.28);
      }
      return;
    }

    if (this.t >= this.nextFinale) {
      this.finaleLeft = FINALE_SHELLS;
      this.finaleTimer = 0;
      this.nextFinale = this.t + FINALE_EVERY;
      return;
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      fw.launchRandomSky();
      this.timer = rand(0.45, 1.3);
    }
  }
}
