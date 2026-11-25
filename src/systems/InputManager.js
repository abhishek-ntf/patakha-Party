import { EventBus } from '../utils/EventBus.js';

/**
 * Unified mouse / touch / pen input on top of Pointer Events.
 * Emits: 'tap' {x,y,button,pointerType}, 'drag' {dx,dy,x,y,pointerType},
 *        'pinch' {delta}, 'wheel' {delta}, 'hover' {x,y}, 'key' KeyboardEvent.
 * Coordinates are client pixels. A tap is a short press that barely moves.
 */
export class InputManager extends EventBus {
  constructor(element) {
    super();
    this.el = element;
    this.pointers = new Map();
    this.pinchDist = 0;
    this.multi = false;
    this.tapMaxMove = 10;
    this.tapMaxTime = 400;
    this.enabled = true;

    this._h = {
      down: (e) => this._down(e),
      move: (e) => this._move(e),
      up: (e) => this._up(e, true),
      cancel: (e) => this._up(e, false),
      wheel: (e) => {
        e.preventDefault();
        if (this.enabled) this.emit('wheel', { delta: e.deltaY });
      },
      touchmove: (e) => e.preventDefault(),
      ctx: (e) => e.preventDefault(),
      gesture: (e) => e.preventDefault(),
      key: (e) => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        this.emit('key', e);
      },
    };
    const el = this.el;
    el.addEventListener('pointerdown', this._h.down);
    el.addEventListener('pointermove', this._h.move);
    el.addEventListener('pointerup', this._h.up);
    el.addEventListener('pointercancel', this._h.cancel);
    el.addEventListener('wheel', this._h.wheel, { passive: false });
    el.addEventListener('touchmove', this._h.touchmove, { passive: false });
    el.addEventListener('contextmenu', this._h.ctx);
    document.addEventListener('gesturestart', this._h.gesture);
    document.addEventListener('gesturechange', this._h.gesture);
    window.addEventListener('keydown', this._h.key);
  }

  _down(e) {
    if (!this.enabled) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture is optional */
    }
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
      t: performance.now(), moved: false, button: e.button, type: e.pointerType,
    });
    if (this.pointers.size === 2) {
      this.multi = true;
      this.pinchDist = this._pinchDistance();
    }
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.emit('hover', { x: e.clientX, y: e.clientY });
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > this.tapMaxMove) p.moved = true;
    if (!this.enabled) return;
    if (this.pointers.size === 1) {
      if (p.moved) this.emit('drag', { dx, dy, x: p.x, y: p.y, pointerType: p.type });
    } else if (this.pointers.size === 2) {
      const d = this._pinchDistance();
      this.emit('pinch', { delta: d - this.pinchDist });
      this.pinchDist = d;
      for (const q of this.pointers.values()) q.moved = true;
    }
  }

  _up(e, allowTap) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    if (this.pointers.size < 2) this.pinchDist = 0;
    const quick = performance.now() - p.t < this.tapMaxTime;
    if (allowTap && this.enabled && !p.moved && !this.multi && quick) {
      this.emit('tap', { x: p.x, y: p.y, button: p.button, pointerType: p.type });
    }
    if (this.pointers.size === 0) this.multi = false;
  }

  _pinchDistance() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  dispose() {
    const el = this.el;
    el.removeEventListener('pointerdown', this._h.down);
    el.removeEventListener('pointermove', this._h.move);
    el.removeEventListener('pointerup', this._h.up);
    el.removeEventListener('pointercancel', this._h.cancel);
    el.removeEventListener('wheel', this._h.wheel);
    el.removeEventListener('touchmove', this._h.touchmove);
    el.removeEventListener('contextmenu', this._h.ctx);
    document.removeEventListener('gesturestart', this._h.gesture);
    document.removeEventListener('gesturechange', this._h.gesture);
    window.removeEventListener('keydown', this._h.key);
    this.clear();
  }
}
