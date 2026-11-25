import * as THREE from 'three';
import { Environment } from './Environment.js';
import { makeGlowPoints } from '../utils/GlowMaterial.js';
import { makeFloorTexture, makeRangoliTexture } from '../utils/ProceduralTextures.js';
import { TAU, rand, pick } from '../utils/math.js';

const HALF = 24; // half-size of the courtyard plaza
const BAY = 6; // width of one arcade bay
const RANGOLI_Z = -6;
const RANGOLI_R = 6.5;

const BULB_COLORS = [
  [1.7, 0.85, 0.15], [1.7, 0.25, 0.5], [1.7, 1.4, 0.35],
  [0.5, 1.7, 0.8], [0.6, 0.9, 1.8], [1.8, 1.5, 1.2],
];

/**
 * Indian haveli courtyard at night: sandstone arcades with lit doorways, chhatri domes,
 * a rangoli, hundreds of diyas, string lights and lanterns, distant trees and city glow.
 */
export class Courtyard extends Environment {
  constructor(world) {
    super(world);
    this.id = 'courtyard';
    this.label = 'Indian Courtyard';
    this.playRadius = 21;
    this.bounds = { minX: -19, maxX: 19, minY: 1.4, maxY: 45, minZ: -17, maxZ: 21.5 };
    this.atmosphere = {
      skyTop: 0x04051c,
      skyMid: 0x15104a,
      skyHorizon: 0x4b2358,
      skyGlow: 0xff7a2e,
      fog: 0x2b1a44,
      fogDensity: 0.0052,
      hemiSky: 0x4b5296,
      hemiGround: 0x2e1a14,
      hemiIntensity: 0.6,
      moonColor: 0x9db4ff,
      moonIntensity: 1.15,
      moonDir: [-0.45, 0.6, -0.65],
      exposure: 1.05,
      bloom: { strength: 0.8, radius: 0.55, threshold: 0.88 },
      cloudColor: 0x4a3f86,
      starAlpha: 1,
    };
    this.lamps = [];
    this._archCache = new Map();
    this._shared = {};
  }

  build() {
    const g = (this.group = new THREE.Group());
    g.name = 'courtyard';
    this.world.scene.add(g);
    this._makeMaterials();
    this._ground();
    this._rangoli();
    this._arcades();
    this._towers();
    this._roofline();
    this._diyas();
    this._stringLights();
    this._toran();
    this._surroundings();
    this._lamps();
    // everything except animated lights is static: skip per-frame matrix updates
    g.traverse((o) => {
      if (o === g) return;
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
  }

  // ------------------------------------------------------------ materials
  _makeMaterials() {
    const M = (color, rough = 0.85, metal = 0, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.35, ...extra });
    this.mat = {
      wall: M(0xc4825a),
      trim: M(0xe8d5b0, 0.8),
      dome: M(0xf1e6cf, 0.55),
      gold: M(0xffc84a, 0.35, 0.9, { emissive: 0x7a4a00, emissiveIntensity: 0.6 }),
      terracotta: M(0xb04a25, 0.9),
      dark: M(0x120c1e, 1),
      marigold: M(0xffffff, 0.7),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.58, 0.22) }),
      lantern: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      wire: new THREE.LineBasicMaterial({ color: 0x150f1c }),
    };
  }

  _mesh(geo, mat, x, y, z, { cast = true, receive = true, ry = 0 } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }

  // --------------------------------------------------------------- ground
  _ground() {
    const floorTex = makeFloorTexture(this.world.maxAnisotropy);
    const floor = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.5,
      metalness: 0.05,
      envMapIntensity: 0.6,
    });
    const plaza = this._mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), floor, 0, 0, 0, { cast: false });
    plaza.rotation.x = -Math.PI / 2;

    // dark earth stretching to the horizon, swallowed by fog
    const earth = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48),
      new THREE.MeshStandardMaterial({ color: 0x120c1c, roughness: 1 }),
    );
    earth.rotation.x = -Math.PI / 2;
    earth.position.y = -0.03;
    earth.receiveShadow = true;
    this.group.add(earth);
  }

  _rangoli() {
    const tex = makeRangoliTexture(1024);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.85,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.28,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
      envMapIntensity: 0.3,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(RANGOLI_R * 2, RANGOLI_R * 2), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.02, RANGOLI_Z);
    m.receiveShadow = true;
    this.group.add(m);
  }

  // ------------------------------------------------------------ architecture
  /** Wall panel with an arched doorway cut out (extruded shape with a hole). */
  _archGeo(w, h, aw, sh, depth) {
    const key = [w, h, aw, sh, depth].join('|');
    let geo = this._archCache.get(key);
    if (geo) return geo;
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -0.5);
    s.lineTo(w / 2, -0.5);
    s.lineTo(w / 2, h);
    s.lineTo(-w / 2, h);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-aw / 2, 0);
    hole.lineTo(aw / 2, 0);
    hole.lineTo(aw / 2, sh);
    hole.absarc(0, sh, aw / 2, 0, Math.PI, false);
    hole.lineTo(-aw / 2, 0);
    s.holes.push(hole);
    geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 });
    geo.translate(0, 0, -depth / 2);
    this._archCache.set(key, geo);
    return geo;
  }

  _bay(geo, glowGeo, x, y, z, ry, glowY) {
    this._mesh(geo, this.mat.wall, x, y, z, { ry });
    const nx = Math.sin(ry);
    const nz = Math.cos(ry);
    const p = new THREE.Mesh(glowGeo, this.mat.glow);
    p.position.set(x - nx * 1.0, y + glowY, z - nz * 1.0);
    p.rotation.y = ry;
    this.group.add(p);
  }

  _arcades() {
    const lower = this._archGeo(BAY, 7, 3.4, 3.7, 1.4);
    const lowerGlow = new THREE.PlaneGeometry(3.6, 5.6);
    const upper = this._archGeo(3, 5, 1.5, 1.5, 1.2);
    const upperGlow = new THREE.PlaneGeometry(1.7, 2.4);
    for (let i = 0; i < 8; i++) {
      const u = -21 + BAY * i;
      this._bay(lower, lowerGlow, u, 0, -HALF, 0, 2.7); // back
      this._bay(lower, lowerGlow, -HALF, 0, u, Math.PI / 2, 2.7); // left
      this._bay(lower, lowerGlow, HALF, 0, u, -Math.PI / 2, 2.7); // right
    }
    for (let i = 0; i < 16; i++) {
      const u = -22.5 + 3 * i;
      this._bay(upper, upperGlow, u, 7, -HALF - 0.1, 0, 1.2); // back upper storey
    }
  }

  _chhatri(x, y, z, s = 1) {
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.scale.setScalar(s);
    const sh = this._shared;
    sh.base = sh.base || new THREE.BoxGeometry(2.8, 0.22, 2.8);
    sh.pillar = sh.pillar || new THREE.CylinderGeometry(0.16, 0.18, 2.4, 8);
    sh.ring = sh.ring || new THREE.CylinderGeometry(1.62, 1.62, 0.18, 28);
    sh.dome = sh.dome || new THREE.SphereGeometry(1.55, 28, 14, 0, TAU, 0, Math.PI / 2);
    sh.ball = sh.ball || new THREE.SphereGeometry(0.17, 12, 8);
    sh.spike = sh.spike || new THREE.ConeGeometry(0.1, 0.8, 8);
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      grp.add(m);
    };
    add(sh.base, this.mat.trim, 0, 0.11, 0);
    for (const sx of [-1.1, 1.1]) for (const sz of [-1.1, 1.1]) add(sh.pillar, this.mat.trim, sx, 1.42, sz);
    add(sh.ring, this.mat.trim, 0, 2.7, 0);
    add(sh.dome, this.mat.dome, 0, 2.79, 0);
    add(sh.ball, this.mat.gold, 0, 4.4, 0);
    add(sh.spike, this.mat.gold, 0, 4.9, 0);
    this.group.add(grp);
  }

  _towers() {
    const capGeo = new THREE.BoxGeometry(3.9, 0.6, 3.9);
    const backTower = new THREE.BoxGeometry(3.4, 12.5, 3.4);
    const frontTower = new THREE.BoxGeometry(3.4, 8, 3.4);
    for (const sx of [-1, 1]) {
      this._mesh(backTower, this.mat.wall, sx * HALF, 6.25, -HALF);
      this._mesh(capGeo, this.mat.trim, sx * HALF, 12.8, -HALF);
      this._chhatri(sx * HALF, 13.1, -HALF, 1);
      this._mesh(frontTower, this.mat.wall, sx * HALF, 4, HALF);
      this._mesh(capGeo, this.mat.trim, sx * HALF, 8.3, HALF);
      this._chhatri(sx * HALF, 8.6, HALF, 0.9);
    }
    this._chhatri(0, 12.7, -HALF, 1.6);
    this._chhatri(-12, 12.7, -HALF, 1.1);
    this._chhatri(12, 12.7, -HALF, 1.1);
  }

  _roofline() {
    // cornices
    this._mesh(new THREE.BoxGeometry(HALF * 2 + 3.2, 0.7, 2.0), this.mat.trim, 0, 12.35, -HALF);
    this._mesh(new THREE.BoxGeometry(2.0, 0.7, HALF * 2), this.mat.trim, -HALF, 7.35, 0);
    this._mesh(new THREE.BoxGeometry(2.0, 0.7, HALF * 2), this.mat.trim, HALF, 7.35, 0);
    // low parapet on the open (camera) side
    this._mesh(new THREE.BoxGeometry(HALF * 2, 1.3, 0.7), this.mat.wall, 0, 0.65, HALF);

    // kangura (pointed battlements) as one instanced mesh
    const spots = [];
    for (let x = -22; x <= 22; x += 1.1) spots.push([x, 12.7 + 0.45, -HALF]);
    for (let z = -22; z <= 22; z += 1.1) {
      spots.push([-HALF, 7.7 + 0.45, z]);
      spots.push([HALF, 7.7 + 0.45, z]);
    }
    for (let x = -22; x <= 22; x += 1.4) spots.push([x, 1.3 + 0.45, HALF]);
    const geo = new THREE.ConeGeometry(0.32, 0.9, 4);
    geo.rotateY(Math.PI / 4);
    const inst = new THREE.InstancedMesh(geo, this.mat.trim, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((p, i) => {
      m4.makeTranslation(p[0], p[1], p[2]);
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = true;
    this.group.add(inst);
  }

  // ----------------------------------------------------------------- diyas
  _diyas() {
    const spots = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      spots.push([Math.sin(a) * 7.6, RANGOLI_Z + Math.cos(a) * 7.6]);
    }
    for (let x = -21; x <= 21; x += 3) spots.push([x, -22.3]);
    for (let z = -18; z <= 18; z += 4.5) {
      spots.push([-22.3, z]);
      spots.push([22.3, z]);
    }
    for (let x = -21; x <= 21; x += 4.2) spots.push([x, 22.4]);

    const profile = [
      new THREE.Vector2(0, 0), new THREE.Vector2(0.14, 0), new THREE.Vector2(0.2, 0.05),
      new THREE.Vector2(0.24, 0.13), new THREE.Vector2(0.2, 0.16), new THREE.Vector2(0.15, 0.1),
      new THREE.Vector2(0, 0.08),
    ];
    const bowl = new THREE.InstancedMesh(new THREE.LatheGeometry(profile, 14), this.mat.terracotta, spots.length);
    const m4 = new THREE.Matrix4();
    const flames = [];
    spots.forEach((p, i) => {
      m4.makeTranslation(p[0], 0.02, p[1]);
      bowl.setMatrixAt(i, m4);
      flames.push({ x: p[0], y: 0.3, z: p[1], r: 2.0, g: 0.95, b: 0.25, size: 0.75 });
      flames.push({ x: p[0], y: 0.24, z: p[1], r: 3.4, g: 2.6, b: 1.2, size: 0.26 });
    });
    this.group.add(bowl);
    this.group.add(makeGlowPoints(this.world.shared, flames, { flicker: 0.28, speed: 9 }));
  }

  // ------------------------------------------------------ string lights etc.
  _stringLights() {
    const bulbs = [];
    const lanternData = [];
    const cordPts = [];
    const strandZ = [-18, -9, 0, 9, 18];
    const palette = (b) => {
      const c = pick(BULB_COLORS);
      return { r: c[0], g: c[1], b: c[2], size: b };
    };

    strandZ.forEach((z, si) => {
      const a = new THREE.Vector3(-HALF, 7.5, z);
      const b = new THREE.Vector3(HALF, 7.5, z);
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 2.8; // control point; real sag is half of this
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(40);
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.mat.wire));
      for (let i = 1; i < 40; i++) {
        const p = pts[i];
        bulbs.push({ x: p.x, y: p.y, z: p.z, ...palette(0.5) });
      }
      if (si % 2 === 0) {
        for (const t of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
          const p = curve.getPoint(t);
          lanternData.push({ x: p.x, y: p.y - 1.1, z: p.z });
          cordPts.push(p, new THREE.Vector3(p.x, p.y - 0.65, p.z));
        }
      }
    });

    // vertical curtains of lights hanging down the back arcade
    for (let k = 1; k < 8; k++) {
      const x = -HALF + BAY * k;
      for (let j = 0; j < 10; j++) {
        bulbs.push({ x, y: 12.1 - j * 0.58, z: -HALF + 1.0, ...palette(0.42) });
      }
    }
    this.group.add(makeGlowPoints(this.world.shared, bulbs, { flicker: 0.18, speed: 3.5 }));

    // lanterns (akash kandil): HDR instance colours, halo sprites
    const lanternGeo = new THREE.SphereGeometry(0.5, 16, 12);
    const inst = new THREE.InstancedMesh(lanternGeo, this.mat.lantern, lanternData.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const halos = [];
    lanternData.forEach((p, i) => {
      m4.makeScale(1, 1.3, 1);
      m4.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, m4);
      const c = pick(BULB_COLORS);
      col.setRGB(c[0] * 0.9, c[1] * 0.9, c[2] * 0.9);
      inst.setColorAt(i, col);
      halos.push({ x: p.x, y: p.y, z: p.z, r: c[0] * 0.5, g: c[1] * 0.5, b: c[2] * 0.5, size: 2.6 });
    });
    inst.instanceColor.needsUpdate = true;
    this.group.add(inst);
    this.group.add(makeGlowPoints(this.world.shared, halos, { flicker: 0.08, speed: 2 }));
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cordPts), this.mat.wire));
  }

  /** Marigold garlands (toran) swagged across the back arcade. */
  _toran() {
    const per = 9;
    const count = 8 * per;
    const geo = new THREE.SphereGeometry(0.17, 8, 6);
    const inst = new THREE.InstancedMesh(geo, this.mat.marigold, count);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    for (let bay = 0; bay < 8; bay++) {
      const cx = -21 + BAY * bay;
      for (let j = 0; j < per; j++) {
        const t = j / (per - 1);
        const x = cx - BAY / 2 + t * BAY;
        const y = 6.7 - Math.sin(t * Math.PI) * 0.55;
        m4.makeTranslation(x, y, -HALF + 0.95);
        inst.setMatrixAt(n, m4);
        col.setHex(Math.random() > 0.35 ? 0xff8a00 : 0xffc400);
        inst.setColorAt(n, col);
        n++;
      }
    }
    inst.instanceColor.needsUpdate = true;
    this.group.add(inst);
  }

  // --------------------------------------------------------- surroundings
  _surroundings() {
    // dark tree silhouettes around the compound
    const trees = 90;
    const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.mat.dark, trees);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < trees; i++) {
      const a = Math.random() * TAU;
      const r = rand(62, 135);
      const sc = rand(3.5, 7);
      p.set(Math.sin(a) * r, sc * 0.85, Math.cos(a) * r);
      s.set(sc, sc * rand(0.9, 1.3), sc);
      m4.compose(p, q, s);
      canopy.setMatrixAt(i, m4);
    }
    this.group.add(canopy);

    // distant city windows
    const lights = [];
    for (let i = 0; i < 280; i++) {
      const a = Math.random() * TAU;
      const r = rand(115, 270);
      const warm = Math.random() > 0.2;
      lights.push({
        x: Math.sin(a) * r,
        y: rand(0.6, 16),
        z: Math.cos(a) * r,
        r: warm ? 1.5 : 0.7,
        g: warm ? 0.9 : 1.0,
        b: warm ? 0.4 : 1.5,
        size: rand(0.9, 1.8),
      });
    }
    this.group.add(makeGlowPoints(this.world.shared, lights, { flicker: 0.1, speed: 2.5 }));
  }

  // ----------------------------------------------------------------- lamps
  _lamps() {
    const spots = [[-14, 4, -12], [14, 4, -12], [-10, 3.2, 10], [10, 3.2, 10]];
    spots.forEach((p, i) => {
      const l = new THREE.PointLight(0xff9a45, 90, 34, 1.8);
      l.position.set(...p);
      l.userData.base = 90;
      l.userData.phase = i * 1.7;
      this.group.add(l);
      this.lamps.push(l);
    });
  }

  update(dt, time) {
    for (const l of this.lamps) {
      const ph = l.userData.phase;
      l.intensity = l.userData.base * (1 + 0.08 * Math.sin(time * 7 + ph) + 0.05 * Math.sin(time * 13.7 + ph * 2));
    }
  }
}
