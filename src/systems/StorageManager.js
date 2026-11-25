const KEY = 'patakha-party-2';
const VERSION = 1;

export const createDefaults = () => ({
  version: VERSION,
  settings: {
    quality: null, particles: null, autoAdapt: true, vibration: true,
    masterVolume: 0.8, sfxVolume: 0.9, musicVolume: 0.55, muted: false, music: true,
  },
  progress: { stars: 50, xp: 0, level: 1, totalXp: 0, totalLaunches: 0 },
  meta: { created: Date.now(), lastPlayed: Date.now(), sessions: 0 },
});

/** Copies values from `src` into `base`, keeping only known keys with matching types. */
function merge(base, src) {
  if (!src || typeof src !== 'object') return base;
  for (const key of Object.keys(base)) {
    if (!(key in src)) continue;
    const b = base[key];
    const s = src[key];
    if (b !== null && typeof b === 'object') merge(b, s);
    else if (b === null) base[key] = s;
    else if (typeof s === typeof b && (typeof s !== 'number' || Number.isFinite(s))) base[key] = s;
  }
  return base;
}

/**
 * Versioned persistence wrapper. Routes through Playgama Bridge storage when provided,
 * otherwise falls back to localStorage. Writes are debounced and flushed when hidden/closed.
 */
export class StorageManager {
  constructor(options = {}) {
    this.data = createDefaults();
    this.persistent = true;
    this._dirty = false;
    this._timer = 0;
    this._saveFn = typeof options.saveFn === 'function' ? options.saveFn : null;
    this._hasInitial = !!options.hasInitialData;
    this._initialData = options.initialData || null;
    this._load();
    this._onPageHide = () => this.flush();
    this._onVisibility = () => {
      if (document.hidden) this.flush();
    };
    window.addEventListener('pagehide', this._onPageHide);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  _load() {
    if (this._hasInitial) {
      if (this._initialData) this.data = merge(createDefaults(), this._initialData);
    } else {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) this.data = merge(createDefaults(), JSON.parse(raw));
      } catch (e) {
        this.persistent = false;
        console.warn('Progress storage is unavailable; running without saving.', e);
      }
    }
    this.data.meta.sessions += 1;
    this.data.meta.lastPlayed = Date.now();
    this.save();
  }

  save() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = 0;
      this.flush();
    }, 600);
  }

  flush() {
    if (!this._dirty) return;
    this._dirty = false;
    if (this._saveFn) {
      try {
        const p = this._saveFn(KEY, this.data);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
        this.persistent = false;
      }
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      this.persistent = false;
    }
  }

  reset() {
    this.data = createDefaults();
    this.data.meta.sessions = 1;
    this._dirty = true;
    this.flush();
  }
}

export { KEY as STORAGE_KEY };
