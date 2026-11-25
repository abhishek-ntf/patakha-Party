import { HUD } from './HUD.js';
import { MainMenu } from './MainMenu.js';
import { Settings } from './Settings.js';
import { AudioPanel } from './AudioPanel.js';
import { CrackerTray } from './CrackerTray.js';

/** Owns every DOM overlay. The root is pointer-events:none so the canvas still gets gestures. */
export class UI {
  constructor(game, root) {
    this.root = root;
    // audioPanel must exist before the HUD wires its sound button
    this.audioPanel = new AudioPanel(game, root);
    this.hud = new HUD(game, root);
    this.menu = new MainMenu(game, root);
    this.settings = new Settings(game, root);
    this.tray = new CrackerTray(game, root);
  }

  onMode(mode, hint) {
    this.hud.setMode(mode, hint);
    if (mode === 'menu') this.menu.show();
    else this.menu.hide();
    if (mode !== 'ground') this.tray.hide();
  }

  dispose() {
    this.audioPanel.dispose();
    this.tray.dispose();
  }
}
