import { EventBus } from '../utils/EventBus.js';

const INIT_TIMEOUT_MS = 8000;

/**
 * Thin wrapper around the global Playgama Bridge SDK (`window.bridge`).
 * Falls back gracefully when the SDK script is unavailable (e.g. offline dev or unit tests).
 */
export class PlaygamaBridge extends EventBus {
  constructor(sdk = null) {
    super();
    this._providedSdk = sdk;
    this.bridge = null;
    this.initialized = false;
    this.readySent = false;
    this.gameplayActive = false;
    this.isPaused = false;
    this.isAudioEnabled = true;
    this.language = 'en';
    this.adActive = false;
    this._pendingReward = null;
    this._unsubs = [];
  }

  get platformId() {
    return this.bridge?.platform?.id || 'mock';
  }

  get isInterstitialSupported() {
    return !!(this.initialized && this.bridge?.advertisement?.isInterstitialSupported);
  }

  get isRewardedSupported() {
    return !!(this.initialized && this.bridge?.advertisement?.isRewardedSupported);
  }

  async init() {
    if (this.initialized) return true;
    const b = this._providedSdk || (typeof window !== 'undefined' ? window.bridge : null);
    if (!b || typeof b.initialize !== 'function') return false;

    let timer = 0;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Playgama Bridge initialization timed out')), INIT_TIMEOUT_MS);
      });
      await Promise.race([b.initialize(), timeout]);
    } catch (err) {
      console.warn('Playgama Bridge unavailable; continuing in standalone mode.', err);
      return false;
    } finally {
      clearTimeout(timer);
    }

    this.bridge = b;
    this.initialized = true;
    this.language = b.platform?.language || 'en';
    this.isAudioEnabled = b.platform?.isAudioEnabled !== false;
    this._bindEvents();
    return true;
  }

  _bindEvents() {
    const b = this.bridge;
    const E = b.EVENT_NAME || {};

    const sub = (emitter, event, fn) => {
      if (!emitter || typeof emitter.on !== 'function') return;
      emitter.on(event, fn);
      if (typeof emitter.off === 'function') this._unsubs.push(() => emitter.off(event, fn));
    };

    sub(b.platform, E.PAUSE_STATE_CHANGED || 'pause_state_changed', (paused) => {
      this.isPaused = !!paused;
      this.emit('pause', this.isPaused);
    });

    sub(b.platform, E.AUDIO_STATE_CHANGED || 'audio_state_changed', (enabled) => {
      this.isAudioEnabled = !!enabled;
      this.emit('audio', this.isAudioEnabled);
    });

    sub(b.advertisement, E.INTERSTITIAL_STATE_CHANGED || 'interstitial_state_changed', (state) => {
      this._handleAdState('interstitial', state);
    });

    sub(b.advertisement, E.REWARDED_STATE_CHANGED || 'rewarded_state_changed', (state) => {
      this._handleAdState('rewarded', state);
    });
  }

  _handleAdState(kind, state) {
    if (state === 'opened') {
      this._setAdActive(true);
    } else if (state === 'closed' || state === 'failed') {
      this._setAdActive(false);
    }

    if (kind === 'rewarded') {
      if (state === 'rewarded') {
        const cb = this._pendingReward;
        this._pendingReward = null;
        if (cb) cb();
      } else if (state === 'closed' || state === 'failed') {
        this._pendingReward = null;
      }
    }
    this.emit(`${kind}:state`, state);
  }

  _setAdActive(active) {
    if (this.adActive === active) return;
    this.adActive = active;
    this.emit('ad', active);
  }

  sendMessage(message) {
    if (!this.initialized || !this.bridge?.platform?.sendMessage) return;
    try {
      const res = this.bridge.platform.sendMessage(message);
      if (res && typeof res.catch === 'function') res.catch(() => {});
    } catch (err) {
      console.warn(`Playgama sendMessage("${message}") failed`, err);
    }
  }

  gameReady() {
    if (this.readySent) return;
    this.readySent = true;
    this.sendMessage('game_ready');
  }

  gameplayStarted() {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    this.sendMessage('gameplay_started');
  }

  gameplayStopped() {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    this.sendMessage('gameplay_stopped');
  }

  async getStorage(key) {
    if (this.initialized && this.bridge?.storage?.get) {
      try {
        const res = await this.bridge.storage.get([key]);
        const raw = Array.isArray(res) ? res[0] : (res && typeof res === 'object' ? res[key] : res);
        if (raw == null || raw === '') return null;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (err) {
        console.warn('Playgama storage.get failed', err);
        return null;
      }
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  async setStorage(key, value) {
    const serialized = JSON.stringify(value);
    if (this.initialized && this.bridge?.storage?.set) {
      try {
        await this.bridge.storage.set([key], [serialized]);
        return true;
      } catch (err) {
        console.warn('Playgama storage.set failed', err);
        return false;
      }
    }
    try {
      localStorage.setItem(key, serialized);
      return true;
    } catch (err) {
      return false;
    }
  }

  showInterstitial(placement) {
    if (!this.isInterstitialSupported || !this.bridge?.advertisement?.showInterstitial) return false;
    try {
      const res = placement
        ? this.bridge.advertisement.showInterstitial(placement)
        : this.bridge.advertisement.showInterstitial();
      if (res && typeof res.catch === 'function') res.catch(() => {});
      return true;
    } catch (err) {
      console.warn('showInterstitial failed', err);
      return false;
    }
  }

  showRewarded(onReward, placement) {
    if (!this.isRewardedSupported || !this.bridge?.advertisement?.showRewarded) return false;
    this._pendingReward = typeof onReward === 'function' ? onReward : null;
    try {
      const res = placement
        ? this.bridge.advertisement.showRewarded(placement)
        : this.bridge.advertisement.showRewarded();
      if (res && typeof res.catch === 'function') {
        res.catch(() => { this._pendingReward = null; });
      }
      return true;
    } catch (err) {
      this._pendingReward = null;
      console.warn('showRewarded failed', err);
      return false;
    }
  }

  dispose() {
    for (const off of this._unsubs) off();
    this._unsubs.length = 0;
    this._pendingReward = null;
    this.clear();
  }
}
