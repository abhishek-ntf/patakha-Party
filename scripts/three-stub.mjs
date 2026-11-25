// Minimal stand-in for 'three' so cracker models + behaviours can run headlessly in Node.
// It only checks control flow and the userData contract between models and behaviours.
const any = () => {
  const f = function () { return any(); };
  return new Proxy(f, {
    get: (t, k) => (k in t ? t[k] : k === Symbol.toPrimitive ? () => 0 : (t[k] = any())),
    set: (t, k, v) => { t[k] = v; return true; },
    apply: () => any(),
  });
};
class V {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y ?? this.y; this.z = z ?? this.z; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  sub() { return this; } add() { return this; } copy() { return this; } clone() { return new V(this.x, this.y, this.z); }
  multiplyScalar() { return this; } setRGB() { return this; } setHex() { return this; }
}
class Obj {
  constructor() {
    this.position = new V(); this.rotation = new V(); this.scale = new V(1, 1, 1);
    this.children = []; this.userData = {}; this.visible = true;
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : (t[k] = any())), set: (t, k, v) => { t[k] = v; return true; } });
  }
  add(...c) { this.children.push(...c); return this; }
  remove(c) { this.children = this.children.filter((x) => x !== c); return this; }
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
  translate() { return this; } rotateX() { return this; }
  setFromObject() { return this; } getCenter() { return this; } getSize() { return this; }
}
const names = ['Group', 'Mesh', 'Object3D', 'InstancedMesh', 'Line', 'Points', 'BufferGeometry', 'BufferAttribute', 'CylinderGeometry', 'TorusGeometry',
  'ConeGeometry', 'SphereGeometry', 'LatheGeometry', 'BoxGeometry', 'RingGeometry', 'MeshStandardMaterial', 'MeshBasicMaterial', 'LineBasicMaterial',
  'ShaderMaterial', 'Raycaster', 'Box3', 'Matrix4', 'Color', 'Vector2', 'Vector3'];
export const Group = class extends Obj {}; export const Mesh = class extends Obj {}; export const Object3D = class extends Obj {};
export const InstancedMesh = class extends Obj { constructor() { super(); this.isInstancedMesh = true; } };
export const Line = class extends Obj {}; export const Points = class extends Obj {};
export const BufferGeometry = class extends Obj {}; export const BufferAttribute = class extends Obj {};
export const CylinderGeometry = class extends Obj {}; export const TorusGeometry = class extends Obj {}; export const ConeGeometry = class extends Obj {};
export const SphereGeometry = class extends Obj {}; export const LatheGeometry = class extends Obj {}; export const BoxGeometry = class extends Obj {}; export const RingGeometry = class extends Obj {};
export const MeshStandardMaterial = class extends Obj {}; export const MeshBasicMaterial = class extends Obj {}; export const LineBasicMaterial = class extends Obj {};
export const ShaderMaterial = class extends Obj {}; export const Raycaster = class extends Obj { intersectObject() { return []; } };
export const Box3 = class extends Obj {}; export const Matrix4 = class extends Obj {}; export const Color = class extends Obj {};
export const Vector2 = V; export const Vector3 = V;
export const DoubleSide = 2; export const DynamicDrawUsage = 35048; export const AdditiveBlending = 2; export const ACESFilmicToneMapping = 4;
