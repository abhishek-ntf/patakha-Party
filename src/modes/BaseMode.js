/** Contract every game mode follows. Phase 4 builds the full modes on top of this. */
export class BaseMode {
  constructor(game) {
    this.game = game;
    this.id = 'base';
    this.hint = '';
    this.cameraPreset = 'menu';
  }

  enter() {
    this.game.camera.setPreset(this.cameraPreset);
  }

  exit() {}

  update(/* dt */) {}

  onTap(/* x, y, rect */) {}

  onKey(/* event */) {}
}
