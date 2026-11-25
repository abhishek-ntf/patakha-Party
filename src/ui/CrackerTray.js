import { h, icon } from './dom.js';
import { CRACKERS } from '../crackers/CrackerCatalog.js';
import { CrackerPreview } from '../crackers/CrackerPreview.js';

/**
 * Bottom tray of the ground view: ten cracker cards with live 3D previews, an info panel for the
 * selected cracker (name, description) and the Light button.
 */
export class CrackerTray {
  constructor(game, root) {
    this.game = game;
    this.cards = new Map();
    this.angle = 0.6;
    this.visible = false;
    this._frame = 0;

    this.preview = null;
    try {
      this.preview = new CrackerPreview(192);
    } catch (err) {
      console.warn('3D previews unavailable, showing plain cards', err);
    }

    this.name = h('h3', { class: 'tray-name' });
    this.sub = h('span', { class: 'tray-sub' });
    this.desc = h('p', { class: 'tray-desc' });
    this.light = h('button', { class: 'light-btn', 'data-quiet': '1', onClick: () => this._light() }, icon('flame'), h('span', {}, 'Light it'));
    this.info = h('div', { class: 'tray-info' },
      h('div', { class: 'tray-text' }, h('div', { class: 'tray-title' }, this.name, this.sub), this.desc),
      this.light);

    this.scroll = h('div', { class: 'tray-scroll', role: 'listbox', 'aria-label': 'Crackers' });
    for (const def of CRACKERS) {
      const canvas = this.preview ? h('canvas', { class: 'card-canvas', width: 160, height: 160 }) : null;
      const card = h('button', {
        class: 'card', role: 'option', 'aria-selected': 'false', 'data-id': def.id, 'data-quiet': '1',
        style: `--accent:${def.accent}`, 'aria-label': `${def.name}, ${def.sub}`,
        onClick: () => this._select(def.id),
      }, canvas, h('span', { class: 'card-name' }, def.name));
      this.cards.set(def.id, { card, canvas });
      this.scroll.append(card);
    }

    this.el = h('div', { class: 'tray hidden' }, this.info, this.scroll);
    root.append(this.el);
    this._off = game.crackers.on('change', () => this.refresh());
    this.refresh();
  }

  _select(id) {
    this.game.audio.play('select');
    this.game.crackers.select(id);
    const c = this.cards.get(id);
    if (c) c.card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  _light() {
    this.game.crackers.ignite();
  }

  refresh() {
    const m = this.game.crackers;
    const def = m.selected;
    for (const [id, { card }] of this.cards) {
      const on = id === m.selectedId;
      card.classList.toggle('sel', on);
      card.setAttribute('aria-selected', String(on));
    }
    this.el.classList.toggle('has-selection', !!def);
    if (!def) {
      this.name.textContent = 'Choose a cracker';
      this.sub.textContent = '';
      this.desc.textContent = 'Pick one below, tap the floor to move it, then light it. You can also tap the cracker itself.';
      this.light.hidden = true;
      return;
    }
    this.name.textContent = def.name;
    this.sub.textContent = def.sub;
    this.desc.textContent = def.desc;
    this.light.hidden = false;
    const ok = m.canIgnite();
    this.light.disabled = !ok;
    this.light.classList.toggle('burning', !ok && m.isBurning());
    this.light.lastChild.textContent = ok ? 'Light it' : m.isBurning() ? 'Burning…' : 'Light it';
  }

  show() {
    this.visible = true;
    this.el.classList.remove('hidden');
    this.refresh();
    this._drawAll();
  }

  hide() {
    this.visible = false;
    this.el.classList.add('hidden');
  }

  _drawAll() {
    if (!this.preview) return;
    for (const [id, { canvas }] of this.cards) this.preview.drawTo(id, 0.7, canvas);
  }

  /** Turntable animation for the selected preview (about 30 fps). */
  update(dt) {
    if (!this.visible || !this.preview) return;
    this.angle += dt * 1.1;
    this._frame += dt;
    if (this._frame < 0.033) return;
    this._frame = 0;
    const id = this.game.crackers.selectedId;
    if (!id) return;
    const c = this.cards.get(id);
    if (c) this.preview.drawTo(id, this.angle, c.canvas);
  }

  dispose() {
    if (this._off) this._off();
    if (this.preview) this.preview.dispose();
    this.el.remove();
  }
}
