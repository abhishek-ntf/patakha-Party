/**
 * requestAnimationFrame loop with clamped delta time, pause-on-hidden and an FPS meter.
 * Callbacks receive (dt seconds, elapsed seconds).
 */
export class GameLoop {
  constructor() {
    this.callbacks = [];
    this.running = false;
    this.last = 0;
    this.time = 0;
    this.fps = 60;
    this.onFps = null;
    this._acc = 0;
    this._frames = 0;
    this._raf = 0;
    this._tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(this._tick);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) return;
      this.time += dt;
      for (let i = 0; i < this.callbacks.length; i++) this.callbacks[i](dt, this.time);
      this._acc += dt;
      this._frames++;
      if (this._acc >= 1) {
        this.fps = this._frames / this._acc;
        this._acc = 0;
        this._frames = 0;
        if (this.onFps) this.onFps(this.fps);
      }
    };
    this._onVisibility = () => {
      if (document.hidden) this.stop();
      else this.start();
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  add(fn) {
    this.callbacks.push(fn);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._acc = 0;
    this._frames = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.callbacks.length = 0;
  }
}
