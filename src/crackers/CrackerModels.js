import * as THREE from 'three';
import { TAU } from '../utils/math.js';

/*
 * Procedural 3D models for the ten crackers. Builders are cheap: geometry and materials are
 * cached and shared, so building a model again (repeat firing, previews) allocates only
 * Mesh/Group objects. Each model exposes a `userData` contract that its behaviour reads
 * (tip heights, fuse path, spinner group, packets ...).
 */

const geoCache = new Map();
const matCache = new Map();

const geo = (key, make) => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};
const mat = (key, make) => {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
};

const paper = (hex) =>
  mat(`paper${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, emissive: hex, emissiveIntensity: 0.14, envMapIntensity: 0.3 }));
const metal = (hex, rough = 0.35) =>
  mat(`metal${hex}${rough}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.9, envMapIntensity: 0.8 }));
const matte = (hex) =>
  mat(`matte${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, envMapIntensity: 0.2 }));

function add(parent, g, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const cyl = (rt, rb, h, seg = 16) => geo(`cyl${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const ring = (r, tube, seg = 24) => geo(`tor${r}|${tube}|${seg}`, () => new THREE.TorusGeometry(r, tube, 8, seg));

/** Flat ring lying on the ground plane. */
function flatRing(parent, r, tube, material, y) {
  const m = add(parent, ring(r, tube, 36), material, 0, y, 0);
  m.rotation.x = Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------- Phuljhadi
export function buildPhuljhadi() {
  const g = new THREE.Group();
  add(g, cyl(0.12, 0.14, 0.03, 18), metal(0x555560, 0.5), 0, 0.015, 0);
  add(g, cyl(0.018, 0.018, 1.1, 8), metal(0xb8bcc8, 0.3), 0, 0.58, 0);
  const coatGeo = geo('phul-coat', () => new THREE.CylinderGeometry(0.055, 0.055, 0.7, 10).translate(0, 0.35, 0));
  const coat = add(g, coatGeo, mat('phul-coat-m', () => new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.9, emissive: 0x2a1408, emissiveIntensity: 0.4 })), 0, 0.42, 0);
  g.userData = { coat, coatBaseY: 0.42, coatH: 0.7 };
  return g;
}

// --------------------------------------------------------------------- Anar
export function buildAnar() {
  const g = new THREE.Group();
  const profile = geo('anar-lathe', () => {
    const pts = [[0, 0], [0.2, 0], [0.27, 0.12], [0.31, 0.32], [0.27, 0.55], [0.17, 0.68], [0.12, 0.72], [0.12, 0.78], [0, 0.78]];
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  });
  add(g, profile, paper(0xc8202f));
  const band = metal(0xffc84a, 0.35);
  add(g, ring(0.295, 0.018, 30), band, 0, 0.2, 0).rotation.x = Math.PI / 2;
  add(g, ring(0.285, 0.018, 30), band, 0, 0.46, 0).rotation.x = Math.PI / 2;
  const fuse = add(g, cyl(0.01, 0.01, 0.28, 6), matte(0xd8c9a0), 0.12, 0.92, 0);
  fuse.rotation.z = -0.45;
  g.userData = { nozzleY: 0.8, fuseTop: { x: 0.18, y: 1.05 }, fuseBase: { x: 0.08, y: 0.8 } };
  return g;
}

// ------------------------------------------------- ground spinners (2 sizes)
function buildSpinner({ R, h, body, rings, nozzles, studR }) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  add(spin, cyl(R, R, h, 40), paper(body), 0, h / 2, 0);
  rings.forEach(([r, tube, hex, metallic]) => flatRing(spin, r, tube, metallic ? metal(hex) : paper(hex), h + tube * 0.4));
  add(spin, cyl(studR, studR, h + 0.05, 12), metal(0xc8ccd8), 0, (h + 0.05) / 2, 0);
  for (let i = 0; i < nozzles; i++) {
    const a = (i / nozzles) * TAU;
    const n = add(spin, cyl(0.035, 0.045, 0.09, 8), matte(0x2a2020), Math.cos(a) * (R - 0.03), h + 0.03, Math.sin(a) * (R - 0.03));
    n.rotation.z = Math.PI / 2;
    n.rotation.y = -a;
  }
  g.userData = { spin, R: R - 0.02, nozzles, height: h };
  return g;
}

export const buildChakri = () =>
  buildSpinner({ R: 0.36, h: 0.05, body: 0x8c1d2c, rings: [[0.3, 0.03, 0xffc84a, true], [0.2, 0.03, 0x2fb36a], [0.12, 0.03, 0xe8403f]], nozzles: 2, studR: 0.05 });

export const buildZameenChakkar = () =>
  buildSpinner({ R: 0.6, h: 0.08, body: 0xc2237a, rings: [[0.52, 0.045, 0x19b5d5], [0.4, 0.045, 0xffc84a, true], [0.28, 0.045, 0x2fe08a], [0.16, 0.04, 0xfff0c0]], nozzles: 3, studR: 0.08 });

// ------------------------------------------------------------------- Rocket
export function buildRocket() {
  const g = new THREE.Group();
  add(g, cyl(0.012, 0.012, 0.6, 6), matte(0xb08a55), 0, 0.3, 0);
  add(g, cyl(0.07, 0.07, 0.5, 18), paper(0xd62a35), 0, 0.8, 0);
  const band = metal(0xffc84a, 0.35);
  add(g, ring(0.073, 0.012, 20), band, 0, 0.62, 0).rotation.x = Math.PI / 2;
  add(g, ring(0.073, 0.012, 20), band, 0, 0.98, 0).rotation.x = Math.PI / 2;
  add(g, geo('rocket-nose', () => new THREE.ConeGeometry(0.07, 0.22, 18)), metal(0xa9c4ff, 0.4), 0, 1.16, 0);
  const fuse = add(g, cyl(0.008, 0.008, 0.2, 6), matte(0xd8c9a0), 0.07, 0.48, 0);
  fuse.rotation.z = 0.5;
  g.userData = { nozzleY: 0.55, topY: 1.27, fuseTop: { x: 0.12, y: 0.4 }, fuseBase: { x: 0.04, y: 0.56 } };
  return g;
}

// --------------------------------------------------------------- Sutli bomb
export function buildSutli() {
  const g = new THREE.Group();
  const ball = add(g, geo('sutli-ball', () => new THREE.SphereGeometry(0.17, 20, 14)), paper(0xb98a4e), 0, 0.15, 0);
  ball.scale.y = 0.9;
  for (const dy of [-0.07, 0, 0.07]) {
    const r = Math.sqrt(0.17 * 0.17 - dy * dy) * 1.01;
    const t = add(g, ring(r, 0.008, 20), matte(0x6d4c2a), 0, 0.15 + dy * 0.9, 0);
    t.rotation.x = Math.PI / 2;
  }
  const fuse = add(g, cyl(0.007, 0.007, 0.26, 6), matte(0xd8c9a0), 0.025, 0.43, 0);
  fuse.rotation.z = -0.2;
  g.userData = { centerY: 0.15, fuseTop: { x: 0.05, y: 0.56 }, fuseBase: { x: 0, y: 0.3 } };
  return g;
}

// -------------------------------------------------------------------- Ladis
const LADI_COUNT = 56;
export function buildLadis() {
  const g = new THREE.Group();
  const pieceGeo = geo('ladi-piece', () => new THREE.CylinderGeometry(0.055, 0.055, 0.17, 10).rotateX(Math.PI / 2));
  const inst = new THREE.InstancedMesh(pieceGeo, mat('ladi-m', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, emissive: 0x551018, emissiveIntensity: 0.3 })), LADI_COUNT);
  inst.castShadow = true;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const points = [];
  const linePts = [];
  const palette = [0xd2202c, 0xe8403f, 0xffc84a, 0xd2202c];
  for (let i = 0; i < LADI_COUNT; i++) {
    const a = (i / LADI_COUNT) * TAU * 2.3;
    const r = 1.15 - (i / LADI_COUNT) * 0.87;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    dummy.position.set(x, 0.07, z);
    dummy.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    col.setHex(palette[i % palette.length]);
    inst.setColorAt(i, col);
    points.push({ x, z });
    linePts.push(new THREE.Vector3(x, 0.03, z));
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  g.add(inst);
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0xd8c9a0 })));
  const p0 = points[0];
  const fuse = add(g, cyl(0.012, 0.012, 0.35, 6), matte(0xd8c9a0), p0.x + 0.05, 0.05, p0.z - 0.12);
  fuse.rotation.x = 1.2;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  g.userData = {
    count: LADI_COUNT,
    previewSize: 2.4,
    points,
    fuseTip: { x: p0.x + 0.07, z: p0.z - 0.28 },
    hidePiece: (i) => {
      inst.setMatrixAt(i, zero);
      inst.instanceMatrix.needsUpdate = true;
    },
    inst,
  };
  return g;
}

// ------------------------------------------------------------------ Pencils
export function buildPencils() {
  const g = new THREE.Group();
  add(g, cyl(0.2, 0.22, 0.03, 20), metal(0x555560, 0.5), 0, 0.015, 0);
  const defs = [[0xff3b4e, [1.9, 0.35, 0.45]], [0x2fe08a, [0.4, 1.9, 0.9]], [0x9a5bff, [1.1, 0.5, 2.0]]];
  const pencils = [];
  defs.forEach(([hex, color], i) => {
    const a = (i / 3) * TAU + 0.4;
    const x = Math.cos(a) * 0.1;
    const z = Math.sin(a) * 0.1;
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    holder.rotation.z = -Math.cos(a) * 0.08;
    holder.rotation.x = Math.sin(a) * 0.08;
    g.add(holder);
    add(holder, cyl(0.034, 0.034, 0.8, 12), paper(hex), 0, 0.43, 0);
    add(holder, geo('pencil-tip', () => new THREE.ConeGeometry(0.034, 0.12, 12)), paper(0xfff0d8), 0, 0.89, 0);
    pencils.push({ x, z, topY: 1.0, color });
  });
  g.userData = { pencils, fuseTop: { x: 0.2, y: 0.5 }, fuseBase: { x: 0.04, y: 0.3 } };
  return g;
}

// ------------------------------------------------------------------ Sky Shot
export function buildSkyShot() {
  const g = new THREE.Group();
  add(g, geo('sky-base', () => new THREE.BoxGeometry(0.4, 0.05, 0.4)), matte(0x6b4a2a), 0, 0.025, 0);
  const tube = add(g, cyl(0.13, 0.13, 0.95, 28), paper(0x1f4fb8), 0, 0.53, 0);
  const band = metal(0xffc84a, 0.35);
  add(g, ring(0.133, 0.014, 28), band, 0, 0.2, 0).rotation.x = Math.PI / 2;
  add(g, ring(0.133, 0.014, 28), band, 0, 0.82, 0).rotation.x = Math.PI / 2;
  add(g, cyl(0.12, 0.12, 0.12, 28), paper(0xf4f0e0), 0, 0.5, 0);
  add(g, cyl(0.15, 0.15, 0.06, 28), matte(0x2a2a30), 0, 1.03, 0);
  const fuse = add(g, cyl(0.008, 0.008, 0.24, 6), matte(0xd8c9a0), 0.15, 0.3, 0);
  fuse.rotation.z = -0.9;
  g.userData = { tube, muzzleY: 1.06, fuseTop: { x: 0.24, y: 0.2 }, fuseBase: { x: 0.13, y: 0.32 } };
  return g;
}

// ---------------------------------------------------------------- Snappers
export function buildSnappers() {
  const g = new THREE.Group();
  const packets = [];
  const spots = [[0.18, 0.05], [-0.15, 0.14], [0.05, -0.2], [-0.2, -0.1], [0.24, -0.16], [-0.02, 0.26]];
  spots.forEach(([x, z], i) => {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.rotation.y = i * 1.3;
    add(p, geo('snap-cone', () => new THREE.ConeGeometry(0.06, 0.13, 10).translate(0, 0.065, 0)), paper(i % 2 ? 0xf2efe6 : 0xe9e0cc), 0, 0, 0).rotation.z = 0.15;
    add(p, cyl(0.012, 0.012, 0.07, 6), paper(i % 2 ? 0xd8c9a0 : 0xf2efe6), 0, 0.16, 0);
    g.add(p);
    packets.push({ obj: p, lx: x, lz: z });
  });
  g.userData = { packets };
  return g;
}

/** Frees the shared geometry / material caches (once, on shutdown). */
export function disposeModelCache() {
  for (const g of geoCache.values()) g.dispose();
  for (const m of matCache.values()) m.dispose();
  geoCache.clear();
  matCache.clear();
}
