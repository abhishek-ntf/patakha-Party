import { h, icon } from './dom.js';

const SLIDERS = [
  ['master', 'Master volume'],
  ['sfx', 'Sound effects'],
  ['music', 'Background music'],
];

/** Popover with master / effects / music sliders, mute and music on-off. */
export class AudioPanel {
  constructor(game, root) {
    this.game = game;
    this.audio = game.audio;
    this.isOpen = false;
    this.inputs = {};
    this.values = {};

    this.muteBtn = h('button', { class: 'mute-btn', 'data-quiet': '1', onClick: () => this.audio.toggleMuted() });
    this.musicSwitch = h('button', { class: 'switch', role: 'switch', 'aria-label': 'Background music', onClick: () => this.audio.setMusicEnabled(!game.state.settings.music) }, h('span', {}));

    const rows = SLIDERS.map(([kind, label]) => {
      const input = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': label });
      const val = h('span', { class: 'vol-val' });
      input.addEventListener('input', () => {
        this.audio.setVolume(kind, input.value / 100);
        val.textContent = `${input.value}%`;
        this._paint(input);
      });
      if (kind === 'sfx') input.addEventListener('change', () => this.audio.play('click'));
      this.inputs[kind] = input;
      this.values[kind] = val;
      return h('label', { class: 'vol-row' }, h('span', { class: 'vol-head' }, label, val), input);
    });

    this.el = h('div', { class: 'audio-panel hidden', role: 'dialog', 'aria-label': 'Sound settings' },
      h('div', { class: 'ap-head' }, h('h2', {}, 'Sound'),
        h('button', { class: 'icon-btn', 'aria-label': 'Close sound settings', onClick: () => this.close() }, icon('close'))),
      this.muteBtn,
      rows,
      h('div', { class: 'row music-row' },
        h('div', { class: 'row-label' }, h('strong', {}, 'Festive music'), h('small', {}, 'Instrumental, starts after your first tap')),
        this.musicSwitch));
    root.append(this.el);

    this._onDocDown = (e) => {
      if (this.isOpen && !this.el.contains(e.target) && !e.target.closest('.split-btn')) this.close();
    };
    document.addEventListener('pointerdown', this._onDocDown);
    this._off = game.state.on('settings', () => this.sync());
    this.sync();
  }

  _paint(input) {
    input.style.setProperty('--fill', `${input.value}%`);
  }

  sync() {
    const s = this.game.state.settings;
    for (const [kind] of SLIDERS) {
      const v = Math.round(this.audio.getVolume(kind) * 100);
      this.inputs[kind].value = String(v);
      this.values[kind].textContent = `${v}%`;
      this._paint(this.inputs[kind]);
    }
    const muted = !!s.muted;
    this.muteBtn.replaceChildren(icon(muted ? 'speakerOff' : 'speaker'), h('span', {}, muted ? 'Unmute all sound' : 'Mute all sound'));
    this.muteBtn.classList.toggle('muted', muted);
    this.musicSwitch.classList.toggle('on', !!s.music);
    this.musicSwitch.setAttribute('aria-checked', String(!!s.music));
  }

  open() {
    this.sync();
    this.isOpen = true;
    this.el.classList.remove('hidden');
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  dispose() {
    document.removeEventListener('pointerdown', this._onDocDown);
    if (this._off) this._off();
    this.el.remove();
  }
}
