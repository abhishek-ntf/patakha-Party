import { h, icon } from './dom.js';
import { fullscreenSupported, toggleFullscreen } from '../utils/fullscreen.js';

const MODES = [
  { id: 'ground', cls: 'm-ground', ico: 'fountain', title: 'Play ground', text: 'Light spark fountains on the courtyard floor' },
  { id: 'sky', cls: 'm-sky', ico: 'rocket', title: 'Sky fireworks', text: 'Tap the night sky to launch shells' },
  { id: 'show', cls: 'm-show', ico: 'burst', title: 'Automatic show', text: 'Watch a choreographed display with a finale' },
];

/** Title screen over the live 3D courtyard. */
export class MainMenu {
  constructor(game, root) {
    this.game = game;
    const buttons = MODES.map((m) =>
      h('button', { class: `mode-btn ${m.cls}`, onClick: () => game.startMode(m.id) },
        icon(m.ico, 'mode-ico'),
        h('span', { class: 'mode-copy' }, h('span', { class: 'mode-title' }, m.title), h('span', { class: 'mode-text' }, m.text))));

    const logo = h('h1', { class: 'logo', 'aria-label': 'Patakha Party 2.0' },
      h('span', { class: 'logo-word' }, 'Patakha'),
      h('span', { class: 'logo-word logo-word-2' }, 'Party'),
      h('span', { class: 'logo-badge' }, '2.0'));

    const secondary = h('div', { class: 'menu-secondary' },
      h('button', { class: 'link-btn', onClick: () => game.ui.settings.open() }, icon('gear'), 'Settings'));
    if (fullscreenSupported()) {
      secondary.append(h('button', { class: 'link-btn', onClick: () => toggleFullscreen() }, icon('expand'), 'Fullscreen'));
    }

    this.el = h('div', { class: 'menu' },
      h('div', { class: 'menu-card' },
        logo,
        h('p', { class: 'tagline' }, 'Diwali fireworks simulator'),
        h('div', { class: 'mode-list' }, buttons),
        secondary));
    root.append(this.el);
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }
}
