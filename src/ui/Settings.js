import { h, icon } from './dom.js';
import { canVibrate } from '../utils/device.js';
import { fullscreenSupported, toggleFullscreen } from '../utils/fullscreen.js';

const TIER_LABELS = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];

/** Settings dialog: graphics quality, particle density, performance + haptics, fullscreen, reset. */
export class Settings {
  constructor(game, root) {
    this.game = game;
    this.isOpen = false;
    this._resetTimer = 0;

    this.body = h('div', { class: 'sheet-body' });
    this.sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' },
      h('div', { class: 'sheet-head' },
        h('h2', {}, 'Settings'),
        h('button', { class: 'icon-btn', 'aria-label': 'Close settings', onClick: () => this.close() }, icon('close'))),
      this.body);
    this.el = h('div', { class: 'overlay hidden', onClick: (e) => { if (e.target === this.el) this.close(); } }, this.sheet);
    root.append(this.el);
    game.state.on('settings', () => { if (this.isOpen) this.render(); });
  }

  render() {
    const s = this.game.state.settings;
    const set = (k, v) => this.game.state.setSetting(k, v);

    const segmented = (key, label, note) =>
      h('div', { class: 'row' },
        h('div', { class: 'row-label' }, h('strong', {}, label), h('small', {}, note)),
        h('div', { class: 'seg', role: 'group', 'aria-label': label },
          TIER_LABELS.map(([v, t]) =>
            h('button', { class: `seg-btn${s[key] === v ? ' on' : ''}`, 'aria-pressed': String(s[key] === v), onClick: () => set(key, v) }, t))));

    const toggle = (key, label, note) =>
      h('div', { class: 'row' },
        h('div', { class: 'row-label' }, h('strong', {}, label), h('small', {}, note)),
        h('button', { class: `switch${s[key] ? ' on' : ''}`, role: 'switch', 'aria-checked': String(!!s[key]), 'aria-label': label, onClick: () => set(key, !s[key]) }, h('span', {})));

    this.body.replaceChildren(
      segmented('quality', 'Graphics quality', 'Bloom, shadows and resolution'),
      segmented('particles', 'Particle quality', 'How many sparks each firework uses'),
      toggle('autoAdapt', 'Automatic performance', 'Lower quality if the frame rate drops'),
      canVibrate() ? toggle('vibration', 'Vibration', 'Short haptic pulses on launches') : null,
      fullscreenSupported()
        ? h('div', { class: 'row' },
            h('div', { class: 'row-label' }, h('strong', {}, 'Fullscreen'), h('small', {}, 'Hide browser bars (F)')),
            h('button', { class: 'pill-btn', onClick: () => toggleFullscreen() }, 'Toggle'))
        : null,
      h('div', { class: 'row' },
        h('div', { class: 'row-label' }, h('strong', {}, 'Saved progress'), h('small', {}, 'Stars, XP and level are stored on this device')),
        this._resetButton()),
    );
  }

  _resetButton() {
    const btn = h('button', { class: 'pill-btn danger' }, 'Reset');
    btn.addEventListener('click', () => {
      if (btn.dataset.armed === '1') {
        clearTimeout(this._resetTimer);
        this.game.progress.reset();
        this.game.ui.hud.toast('Progress reset');
        return;
      }
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to confirm';
      this._resetTimer = setTimeout(() => {
        btn.dataset.armed = '0';
        btn.textContent = 'Reset';
      }, 3000);
    });
    return btn;
  }

  open() {
    this.render();
    this.isOpen = true;
    this.el.classList.remove('hidden');
    const first = this.sheet.querySelector('button.seg-btn.on, button');
    if (first) first.focus({ preventScroll: true });
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }
}
