import * as THREE from 'three';
import { TAU, rand } from './math.js';

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(canvas, { srgb = true, repeat = false, aniso = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  return tex;
}

/** Stone courtyard tiles with grout lines and weathering speckle. */
export function makeFloorTexture(aniso = 4) {
  const s = 512;
  const c = makeCanvas(s);
  const g = c.getContext('2d');
  g.fillStyle = '#2d2320';
  g.fillRect(0, 0, s, s);
  const n = 4;
  const t = s / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = (Math.random() - 0.5) * 34;
      g.fillStyle = `rgb(${Math.round(150 + v)},${Math.round(118 + v * 0.8)},${Math.round(98 + v * 0.7)})`;
      g.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
    }
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,235,210,0.07)' : 'rgba(20,10,5,0.09)';
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = finish(c, { repeat: true, aniso });
  tex.repeat.set(6, 6);
  return tex;
}

/** Colourful mandala rangoli drawn with petals and dots (transparent outside the disc). */
export function makeRangoliTexture(size = 1024) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const cx = size / 2;
  const R = size / 2 - 6;
  const pal = ['#ff2e63', '#ffb703', '#fff4d6', '#19b5a5', '#8a3cff', '#ff7b00'];

  const disc = (r, col, alpha = 1) => {
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.beginPath();
    g.arc(cx, cx, r, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  };
  const ring = (r0, r1, col) => {
    g.beginPath();
    g.arc(cx, cx, r1, 0, TAU);
    g.arc(cx, cx, r0, 0, TAU, true);
    g.fillStyle = col;
    g.fill();
  };
  const petals = (count, r0, len, wid, colour, rot = 0) => {
    for (let i = 0; i < count; i++) {
      g.save();
      g.translate(cx, cx);
      g.rotate(rot + (i / count) * TAU);
      g.fillStyle = colour(i);
      g.beginPath();
      g.ellipse(0, -(r0 + len / 2), wid / 2, len / 2, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  };
  const dots = (count, r, dotR, colour) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      g.fillStyle = colour(i);
      g.beginPath();
      g.arc(cx + Math.sin(a) * r, cx - Math.cos(a) * r, dotR, 0, TAU);
      g.fill();
    }
  };

  disc(R, '#1b0d2c', 0.62);
  ring(R * 0.955, R, '#ffcf5a');
  ring(R * 0.9, R * 0.93, '#fff4d6');
  dots(48, R * 0.865, R * 0.016, (i) => (i % 2 ? '#fff4d6' : '#ffb703'));
  petals(24, R * 0.6, R * 0.27, R * 0.12, (i) => pal[i % pal.length]);
  petals(24, R * 0.6, R * 0.1, R * 0.05, () => '#fff4d6', Math.PI / 24);
  ring(R * 0.57, R * 0.595, '#ffcf5a');
  petals(16, R * 0.38, R * 0.2, R * 0.14, (i) => pal[(i + 2) % pal.length], Math.PI / 16);
  dots(32, R * 0.5, R * 0.014, () => '#fff4d6');
  ring(R * 0.34, R * 0.365, '#fff4d6');
  petals(12, R * 0.19, R * 0.15, R * 0.13, (i) => pal[(i + 4) % pal.length]);
  disc(R * 0.17, '#ff2e63');
  disc(R * 0.11, '#ffcf5a');
  disc(R * 0.055, '#fff4d6');
  return finish(c);
}

/** Pale cratered moon surface. */
export function makeMoonTexture() {
  const s = 256;
  const c = makeCanvas(s);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s * 0.4, s * 0.38, 10, s / 2, s / 2, s * 0.75);
  grad.addColorStop(0, '#fffbe9');
  grad.addColorStop(1, '#cfc7b0');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 38; i++) {
    const r = rand(4, 22);
    g.fillStyle = `rgba(120,112,95,${rand(0.08, 0.26)})`;
    g.beginPath();
    g.arc(rand(0, s), rand(0, s), r, 0, TAU);
    g.fill();
  }
  return finish(c);
}

/** Soft wispy cloud sprite with alpha. */
export function makeCloudTexture() {
  const w = 256;
  const h = 128;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = rand(w * 0.2, w * 0.8);
    const y = rand(h * 0.35, h * 0.65);
    const r = rand(h * 0.18, h * 0.45);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.32)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  return finish(c);
}

/** Radial glow used by the moon halo sprite. */
export function makeGlowTexture() {
  const s = 128;
  const c = makeCanvas(s);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return finish(c);
}
