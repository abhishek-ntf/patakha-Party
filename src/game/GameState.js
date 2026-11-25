import { EventBus } from '../utils/EventBus.js';
import { detectDefaultTier } from '../utils/device.js';

const TIERS = ['low', 'medium', 'high'];

/** Central mode + settings state. Emits 'mode' (mode, prev) and 'settings' (key, value). */
export class GameState extends EventBus {
  constructor(storage) {
    super();
    this.storage = storage;
    this.mode = 'menu';
    this.resolveSettings();
  }

  get settings() {
    return this.storage.data.settings;
  }

  /** Fills unset quality tiers from device detection. */
  resolveSettings() {
    const s = this.settings;
    const tier = detectDefaultTier();
    if (!TIERS.includes(s.quality)) s.quality = tier;
    if (!TIERS.includes(s.particles)) s.particles = tier;
    this.storage.save();
  }

  setSetting(key, value) {
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    this.storage.save();
    this.emit('settings', key, value);
  }

  setMode(mode) {
    const prev = this.mode;
    if (prev === mode) return;
    this.mode = mode;
    this.emit('mode', mode, prev);
  }
}
