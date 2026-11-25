import * as THREE from 'three';
import { CRACKERS } from './CrackerCatalog.js';

/**
 * Renders small 3D previews of each cracker with one shared offscreen WebGL renderer and copies
 * the result into the tray cards' 2D canvases (so only a single extra WebGL context is needed).
 */
export class CrackerPreview {
  constructor(size = 192) {
    this.size = size;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xbfc8ff, 0x402020, 1.2));
    const key = new THREE.DirectionalLight(0xffe0b0, 2.4);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff4d9a, 1.4);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);

    // one normalised model per cracker, shown one at a time
    this.items = new Map();
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    const dim = new THREE.Vector3();
    for (const def of CRACKERS) {
      const model = def.build();
      let extent;
      if (model.userData.previewSize) {
        // instanced models (the ladi spiral) report a single-piece box, so they state their size
        extent = model.userData.previewSize;
        model.position.set(0, -0.05, 0);
      } else {
        box.setFromObject(model);
        box.getCenter(center);
        box.getSize(dim);
        model.position.sub(center);
        extent = Math.max(dim.x, dim.y, dim.z, 0.01);
      }
      const pivot = new THREE.Group();
      pivot.add(model);
      pivot.scale.setScalar(2 / extent);
      pivot.visible = false;
      this.scene.add(pivot);
      this.items.set(def.id, pivot);
    }
    this.camera.position.set(0, 1.6, 5.2);
    this.camera.lookAt(0, 0, 0);
  }

  /** Draws cracker `id` at turntable angle into a 2D canvas. */
  drawTo(id, angle, canvas) {
    const pivot = this.items.get(id);
    if (!pivot || !canvas) return;
    for (const p of this.items.values()) p.visible = false;
    pivot.visible = true;
    pivot.rotation.y = angle;
    this.renderer.render(this.scene, this.camera);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.isLine && o.geometry) o.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
