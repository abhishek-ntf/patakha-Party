/** Tiny pub/sub used by state, input and gameplay systems. */
export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(type, fn) {
    let set = this._handlers.get(type);
    if (!set) {
      set = new Set();
      this._handlers.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this._handlers.get(type);
    if (set) set.delete(fn);
  }

  emit(type, a, b) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const fn of set) fn(a, b);
  }

  clear() {
    this._handlers.clear();
  }
}
