export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const smooth01 = (t) => t * t * (3 - 2 * t);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
