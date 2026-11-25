import './styles/main.css';
import { Game } from './game/Game.js';
import { webglSupported } from './utils/device.js';

const boot = document.getElementById('boot');

function showError(message) {
  boot.classList.remove('done');
  boot.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'boot-error';
  const h = document.createElement('h2');
  h.textContent = "The game couldn't start";
  const p = document.createElement('p');
  p.textContent = message;
  box.append(h, p);
  boot.append(box);
}

try {
  if (!webglSupported()) {
    throw new Error('WebGL is not available in this browser. Try the latest Chrome, Edge, Firefox or Safari.');
  }
  const game = new Game(document.getElementById('root'));
  window.__patakha = game; // handy for debugging in the console
  game.start();
  requestAnimationFrame(() => requestAnimationFrame(() => boot.classList.add('done')));
} catch (err) {
  console.error(err);
  showError(err && err.message ? err.message : 'Unknown error. Check the browser console.');
}
