import * as THREE from 'three';
import { StorageManager } from '../systems/StorageManager.js';
import { ProgressManager } from '../systems/ProgressManager.js';
import { InputManager } from '../systems/InputManager.js';
import { Pointing } from '../systems/Pointing.js';
import { GameState } from './GameState.js';
import { GameLoop } from './GameLoop.js';
import { CameraRig } from './Camera.js';
import { World } from './World.js';
import { ModeManager } from './ModeManager.js';
import { SceneManager } from '../environments/SceneManager.js';
import { ParticleSystem } from '../fireworks/ParticleSystem.js';
import { Fireworks } from '../fireworks/Fireworks.js';
import { SmokeSystem } from '../fireworks/SmokeSystem.js';
import { AudioManager } from '../audio/AudioManager.js';
import { CrackerManager } from '../crackers/CrackerManager.js';
import { MenuMode } from '../modes/MenuMode.js';
import { GroundMode } from '../modes/GroundMode.js';
import { SkyMode } from '../modes/SkyMode.js';
import { ShowMode } from '../modes/ShowMode.js';
import { UI } from '../ui/UI.js';
import { clamp } from '../utils/math.js';
import { vibrate } from '../utils/device.js';
import { isFullscreen, toggleFullscreen } from '../utils/fullscreen.js';

export const PARTICLE_TIERS = {
  low:    { capacity: 6000,  density: 0.35, trails: 0.25, smoke: 450 },
  medium: { capacity: 12000, density: 0.65, trails: 0.6,  smoke: 900 },
  high:   { capacity: 24000, density: 1,    trails: 1,    smoke: 1400 },
};
const TIER_ORDER = ['low', 'medium', 'high'];
const _target = new THREE.Vector3();

/** Composition root: builds every system and runs the frame loop. */
export class Game {
  constructor(root) {
    this.root = root;
    this.container = root.querySelector('#app');
    this.uiRoot = root.querySelector('#ui');

    this.storage = new StorageManager();
    this.state = new GameState(this.storage);
    this.progress = new ProgressManager(this.storage, this.state);

    this.rig = new CameraRig();
    this.camera = this.rig; // modes use game.camera.setPreset()/rotate()/zoom()
    this.world = new World(this.container, this.rig.camera, this.state.settings.quality);
    this.scenes = new SceneManager(this.world);
    this.scenes.load('courtyard');
    this.rig.setBounds(this.scenes.current.bounds);

    this.particles = new ParticleSystem(this.world.shared, { capacity: PARTICLE_TIERS.high.capacity });
    this.world.scene.add(this.particles.points);
    this.smoke = new SmokeSystem(this.world.shared, { capacity: PARTICLE_TIERS.high.smoke });
    this.world.scene.add(this.smoke.points);
    this.fireworks = new Fireworks(this.particles);

    this.audio = new AudioManager(this.state);
    this.audio.setCamera(this.rig.camera);
    this.audio.installUnlock(window);
    this.crackers = new CrackerManager(this);

    this.pointing = new Pointing(this.rig.camera);
    this.input = new InputManager(this.world.canvas);
    this.loop = new GameLoop();

    this.modes = new ModeManager(this);
    [new MenuMode(this), new GroundMode(this), new SkyMode(this), new ShowMode(this)].forEach((m) => this.modes.register(m));
    this.ui = new UI(this, this.uiRoot);

    this._lowFpsSeconds = 0;
    this._lastAdapt = 0;
    this._bindEvents();
    this.applySettings();
    this._resize();
  }

  start() {
    this.modes.set('menu');
    this.ui.onMode('menu', '');
    this.rig.setPreset('menu', true);
    this.loop.add((dt, t) => this.update(dt, t));
    this.loop.onFps = (fps) => this._watchFps(fps);
    this.loop.start();
  }

  // ----------------------------------------------------------------- events
  _bindEvents() {
    const { input, state } = this;

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.container);
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));

    input.on('drag', (e) => {
      if (!this.ui.settings.isOpen) this.rig.rotate(e.dx, e.dy);
    });
    input.on('pinch', (e) => {
      if (!this.ui.settings.isOpen) this.rig.zoom(-e.delta * 0.04);
    });
    input.on('wheel', (e) => {
      if (!this.ui.settings.isOpen) this.rig.zoom(e.delta * 0.012);
    });
    input.on('tap', (e) => {
      if (this.ui.settings.isOpen) return;
      const rect = this.world.canvas.getBoundingClientRect();
      this.modes.tap(e.x - rect.left, e.y - rect.top, rect);
    });
    input.on('key', (e) => this._onKey(e));

    state.on('settings', () => this.applySettings());
    state.on('mode', (mode, prev) => {
      this.ui.onMode(mode, this.modes.current.hint);
      if (prev) this.audio.play('whoosh');
    });
    state.on('level:up', () => this.audio.play('levelUp'));

    // UI click feedback (buttons mark themselves data-quiet when they play their own sound)
    this._onUiClick = (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && !b.dataset.quiet) this.audio.play('click');
    };
    this.uiRoot.addEventListener('click', this._onUiClick);

    this.crackers.on('ignite', (def) => {
      this.progress.recordLaunch();
      this.progress.addXP(def.repeatable ? 2 : 4);
      this.haptic(14);
    });
    this.fireworks.on('launch', (e) => this.audio.onLaunch(e));
    this.fireworks.on('fountain', (e) => this.audio.onFountain(e));

    this.fireworks.on('burst', (e) => {
      this.audio.onBurst(e);
      this.world.flash(e.x, e.y, e.z, e.r, e.g, e.b, 650 * e.size);
      this.rig.addShake(0.05 * e.size);
    });
  }

  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const settings = this.ui.settings;
    if (e.code === 'Escape') {
      if (settings.isOpen) settings.close();
      else if (this.state.mode !== 'menu') this.goHome();
      return;
    }
    if (settings.isOpen) return;
    switch (e.code) {
      case 'KeyF': toggleFullscreen(); break;
      case 'KeyM': this.audio.toggleMuted(); break;
      case 'KeyH': if (this.state.mode !== 'menu') this.goHome(); break;
      case 'KeyS': settings.open(); break;
      case 'KeyR': this.rig.resetView(); break;
      case 'Digit1': this.startMode('ground'); break;
      case 'Digit2': this.startMode('sky'); break;
      case 'Digit3': this.startMode('show'); break;
      default: this.modes.key(e);
    }
  }

  // ------------------------------------------------------------ navigation
  startMode(id) {
    this.fireworks.clear();
    this.smoke.clear();
    this.modes.set(id);
  }

  goHome() {
    this.fireworks.clear();
    this.smoke.clear();
    this.audio.stopAll();
    this.modes.set('menu');
  }

  // ---------------------------------------------------------------- actions
  /** Launches a rocket toward the sky point under a screen position. */
  launchAtScreen(x, y, rect, award) {
    this.pointing.skyPoint(x, y, rect, _target);
    const sx = clamp(_target.x * 0.35, -16, 16);
    const sz = clamp(_target.z * 0.12, -14, 4);
    const ok = this.fireworks.launch(sx, 0.3, sz, _target.x, _target.y, _target.z, null, -1, 1, true);
    if (ok && award) {
      this.progress.recordLaunch();
      this.progress.addXP(3);
      this.haptic(12);
    }
    return ok;
  }

  haptic(ms) {
    if (this.state.settings.vibration) vibrate(ms);
  }

  // --------------------------------------------------------------- settings
  applySettings() {
    const s = this.state.settings;
    if (this.world.quality !== s.quality) this.world.setQuality(s.quality);
    const tier = PARTICLE_TIERS[s.particles] || PARTICLE_TIERS.medium;
    this.particles.setActiveCapacity(tier.capacity);
    this.smoke.setActiveCapacity(tier.smoke);
    this.fireworks.setQuality(tier.density, tier.trails);
  }

  /** Steps quality down automatically when the frame rate stays low. */
  _watchFps(fps) {
    if (!this.state.settings.autoAdapt || document.hidden) return;
    this._lowFpsSeconds = fps < 36 ? this._lowFpsSeconds + 1 : 0;
    const now = performance.now();
    if (this._lowFpsSeconds < 4 || this.loop.time < 6 || now - this._lastAdapt < 12000) return;
    this._lowFpsSeconds = 0;
    this._lastAdapt = now;
    const s = this.state.settings;
    const gi = TIER_ORDER.indexOf(s.quality);
    const pi = TIER_ORDER.indexOf(s.particles);
    if (gi > 0) {
      this.state.setSetting('quality', TIER_ORDER[gi - 1]);
      this.ui.hud.toast(`Performance mode: graphics set to ${TIER_ORDER[gi - 1]}`);
    } else if (pi > 0) {
      this.state.setSetting('particles', TIER_ORDER[pi - 1]);
      this.ui.hud.toast(`Performance mode: particles set to ${TIER_ORDER[pi - 1]}`);
    }
  }

  // ------------------------------------------------------------------ frame
  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.rig.resize(w / h);
    this.world.resize(w, h);
  }

  update(dt, time) {
    this.rig.update(dt, time);
    this.world.update(dt, time);
    this.scenes.update(dt, time);
    this.modes.update(dt);
    this.fireworks.update(dt);
    this.particles.update(dt);
    this.smoke.update(dt, this.world.flashLight);
    this.world.render(dt);
  }

  dispose() {
    this.loop.dispose();
    this.input.dispose();
    this.uiRoot.removeEventListener('click', this._onUiClick);
    this.crackers.dispose();
    this.audio.dispose();
    this.ui.dispose();
    this.smoke.dispose();
    this._ro.disconnect();
    this.particles.dispose();
    this.scenes.dispose();
    this.world.dispose();
    this.storage.flush();
    if (isFullscreen()) toggleFullscreen();
  }
}
