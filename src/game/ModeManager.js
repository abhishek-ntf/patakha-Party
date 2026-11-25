/** Registers modes and routes update / tap / key events to the active one. */
export class ModeManager {
  constructor(game) {
    this.game = game;
    this.modes = new Map();
    this.current = null;
    this.currentId = null;
  }

  register(mode) {
    this.modes.set(mode.id, mode);
  }

  set(id) {
    const next = this.modes.get(id);
    if (!next) throw new Error(`Unknown mode: ${id}`);
    if (this.currentId === id) return;
    if (this.current) this.current.exit();
    this.currentId = id;
    this.current = next;
    this.game.state.setMode(id);
    next.enter();
  }

  update(dt) {
    if (this.current) this.current.update(dt);
  }

  tap(x, y, rect) {
    if (this.current) this.current.onTap(x, y, rect);
  }

  key(e) {
    if (this.current) this.current.onKey(e);
  }
}
