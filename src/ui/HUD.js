import { h, icon } from './dom.js';
import { fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from '../utils/fullscreen.js';

/** In-game overlay: home, level + XP bar, star balance, settings, fullscreen, hints and toasts. */
export class HUD {
  constructor(game, root) {
    this.game = game;
    const p = game.progress;

    this.homeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Back to home', title: 'Home (H)', onClick: () => game.goHome() }, icon('home'));
    this.levelNum = h('span', { class: 'level-num' }, p.level);
    this.xpFill = h('div', { class: 'xp-fill' });
    this.xpText = h('span', { class: 'xp-text' });
    this.levelChip = h('div', { class: 'chip level-chip', title: 'Level and XP' },
      h('div', { class: 'level-badge' }, this.levelNum),
      h('div', { class: 'xp' }, h('div', { class: 'xp-track' }, this.xpFill), this.xpText));
    this.starNum = h('span', { class: 'star-num' }, p.stars);
    this.starChip = h('div', { class: 'chip star-chip', title: 'Stars' }, icon('star'), this.starNum);
    this.fsBtn = h('button', { class: 'icon-btn', 'aria-label': 'Toggle fullscreen', title: 'Fullscreen (F)', onClick: () => toggleFullscreen() }, icon('expand'));
    this.soundBtn = h('button', { class: 'split-main', 'aria-label': 'Mute or unmute sound', title: 'Sound on / off (M)', 'data-quiet': '1', onClick: () => game.audio.toggleMuted() });
    this.soundMenu = h('button', { class: 'split-more', 'aria-label': 'Sound settings', title: 'Sound settings', onClick: () => game.ui.audioPanel.toggle() }, icon('chevron'));
    this.soundSplit = h('div', { class: 'split-btn' }, this.soundBtn, this.soundMenu);
    this.setBtn = h('button', { class: 'icon-btn', 'aria-label': 'Settings', title: 'Settings (S)', onClick: () => game.ui.settings.open() }, icon('gear'));
    if (!fullscreenSupported()) this.fsBtn.hidden = true;

    this.hint = h('div', { class: 'hint' });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });

    this.el = h('div', { class: 'hud' },
      h('div', { class: 'hud-top' },
        h('div', { class: 'hud-left' }, this.homeBtn),
        h('div', { class: 'hud-center' }, this.levelChip),
        h('div', { class: 'hud-right' }, this.starChip, this.soundSplit, this.fsBtn, this.setBtn)),
      this.hint, this.toasts);
    root.append(this.el);

    this._shownStars = p.stars;
    this._starAnim = 0;
    this.refresh();
    game.state.on('progress', () => this.refresh());
    game.state.on('level:up', ({ level, reward }) => this.toast(`Level ${level}! +${reward} stars`, 'good'));
    onFullscreenChange(() => this.fsBtn.classList.toggle('on', isFullscreen()));
    this._syncSound();
    game.state.on('settings', () => this._syncSound());
    this._hintTimer = 0;
  }

  _syncSound() {
    const muted = !!this.game.state.settings.muted;
    this.soundBtn.replaceChildren(icon(muted ? 'speakerOff' : 'speaker'));
    this.soundSplit.classList.toggle('muted', muted);
  }

  refresh() {
    const p = this.game.progress;
    this.levelNum.textContent = p.level;
    this.xpFill.style.width = `${(p.xpFraction * 100).toFixed(1)}%`;
    this.xpText.textContent = `${p.xp} / ${p.xpForLevel()} XP`;
    this._animateStars(p.stars);
  }

  _animateStars(target) {
    cancelAnimationFrame(this._starAnim);
    const from = this._shownStars;
    if (from === target) {
      this.starNum.textContent = target;
      return;
    }
    const start = performance.now();
    const dur = 450;
    this.starChip.classList.remove('bump');
    void this.starChip.offsetWidth; // restart the CSS animation
    this.starChip.classList.add('bump');
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      this._shownStars = Math.round(from + (target - from) * t);
      this.starNum.textContent = this._shownStars;
      if (t < 1) this._starAnim = requestAnimationFrame(step);
    };
    this._starAnim = requestAnimationFrame(step);
  }

  /** Adapts the overlay to the active mode. */
  setMode(mode, hintText) {
    const inGame = mode !== 'menu';
    this.homeBtn.style.visibility = inGame ? 'visible' : 'hidden';
    this.el.classList.toggle('in-game', inGame);
    clearTimeout(this._hintTimer);
    this.hint.textContent = hintText || '';
    this.hint.classList.toggle('show', inGame && !!hintText);
    if (inGame && hintText) this._hintTimer = setTimeout(() => this.hint.classList.remove('show'), 9000);
  }

  toast(message, kind = '') {
    const t = h('div', { class: `toast ${kind}`.trim() }, message);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 2600);
  }
}
