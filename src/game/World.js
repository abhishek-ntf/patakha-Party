import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeMoonTexture, makeCloudTexture, makeGlowTexture } from '../utils/ProceduralTextures.js';
import { rand } from '../utils/math.js';
import { disposeObject } from '../utils/dispose.js';

export const GRAPHICS = {
  low:    { pixelRatio: 1,   shadows: false, shadowMap: 512,  bloom: false, msaa: 0, clouds: 3 },
  medium: { pixelRatio: 1.5, shadows: true,  shadowMap: 1024, bloom: true,  msaa: 0, clouds: 5 },
  high:   { pixelRatio: 2,   shadows: true,  shadowMap: 2048, bloom: true,  msaa: 4, clouds: 7 },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGlow;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
  c = mix(c, uTop, smoothstep(0.18, 0.9, h));
  c += uGlow * pow(1.0 - h, 7.0) * 0.55;
  if (vDir.y < 0.0) c = uHorizon * 0.6;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
uniform float uAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.65 + 0.35 * sin(uTime * (1.0 + aPhase * 2.0) + aPhase * 40.0);
  vColor = aColor * tw * uAlpha;
  gl_PointSize = aSize * uPixelRatio * (0.8 + 0.4 * tw);
}`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 1.6);
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Owns the renderer, scene, sky (gradient dome, stars, moon, clouds), global lights,
 * post-processing (bloom) and quality tiers. Environments plug into it through SceneManager.
 */
export class World {
  constructor(container, camera, quality = 'high') {
    this.container = container;
    this.camera = camera;
    this.quality = quality;
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;
    this.composer = null;
    this.bloomPass = null;
    this.atmosphere = null;
    this.envTarget = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.style.touchAction = 'none';
    container.appendChild(this.canvas);
    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2b1a44, 0.005);

    // uniforms shared by every point-sprite material (particles, glow lights)
    this.shared = {
      uTime: { value: 0 },
      uScale: { value: 800 },
      uMaxSize: { value: 160 },
      uPixelRatio: { value: 1 },
    };

    this._buildSky();
    this._buildLights();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.setQuality(quality);
  }

  // ------------------------------------------------------------------ sky
  _buildSky() {
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(skyGeo, this.skyMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.skyGroup.add(dome);

    // a second dome in a private scene so PMREM can bake sky reflections for the ground
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(skyGeo, this.skyMat));

    // stars
    const N = 1600;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const y = 0.02 + Math.random() * 0.98;
      const r = Math.sqrt(1 - y * y);
      const th = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(th) * r * 480;
      pos[i * 3 + 1] = y * 480;
      pos[i * 3 + 2] = Math.sin(th) * r * 480;
      const b = 0.5 + Math.random() * 1.6;
      const warm = Math.random();
      col[i * 3] = b * (0.8 + warm * 0.2);
      col[i * 3 + 1] = b * (0.85 + warm * 0.1);
      col[i * 3 + 2] = b * (1.0 - warm * 0.25);
      size[i] = 1.2 + Math.random() * 2.2;
      phase[i] = Math.random();
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.shared.uTime, uPixelRatio: this.shared.uPixelRatio, uAlpha: { value: 1 } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.skyGroup.add(this.stars);

    // moon (HDR colour so bloom picks it up) + soft halo
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(16, 32, 16),
      new THREE.MeshBasicMaterial({ map: makeMoonTexture(), color: new THREE.Color(1.5, 1.45, 1.3), fog: false }),
    );
    this.moon.renderOrder = -8;
    this.skyGroup.add(this.moon);
    this.moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: new THREE.Color(0.45, 0.5, 0.95),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      }),
    );
    this.moonHalo.scale.set(170, 170, 1);
    this.moonHalo.renderOrder = -8;
    this.skyGroup.add(this.moonHalo);

    // drifting clouds
    this.cloudPivot = new THREE.Group();
    this.skyGroup.add(this.cloudPivot);
    this.clouds = [];
    const cloudTex = makeCloudTexture();
    this.cloudMat = [];
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: cloudTex,
        transparent: true,
        opacity: rand(0.3, 0.5),
        depthWrite: false,
        fog: false,
        color: 0x4a3f86,
      });
      this.cloudMat.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(150, 240), rand(45, 80)), mat);
      const a = (i / 7) * Math.PI * 2 + rand(-0.3, 0.3);
      m.position.set(Math.sin(a) * 400, rand(55, 150), Math.cos(a) * 400);
      m.lookAt(0, m.position.y * 0.5, 0);
      m.renderOrder = -7;
      this.cloudPivot.add(m);
      this.clouds.push(m);
    }
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x4b5296, 0x2e1a14, 0.6);
    this.scene.add(this.hemi);

    this.moonLight = new THREE.DirectionalLight(0x9db4ff, 1.1);
    const sc = this.moonLight.shadow.camera;
    sc.left = -36;
    sc.right = 36;
    sc.top = 36;
    sc.bottom = -36;
    sc.near = 1;
    sc.far = 170;
    this.moonLight.shadow.bias = -0.0004;
    this.moonLight.shadow.normalBias = 0.04;
    this.scene.add(this.moonLight, this.moonLight.target);

    // brief colour flash lighting the courtyard when shells burst
    this.flashLight = new THREE.PointLight(0xffffff, 0, 170, 1.4);
    this.scene.add(this.flashLight);

    // steady flickering light for the cracker that is currently burning
    this.glowLight = new THREE.PointLight(0xffaa55, 0, 40, 1.6);
    this.scene.add(this.glowLight);
    this._glowTarget = 0;
  }

  // ------------------------------------------------------------ atmosphere
  setAtmosphere(a) {
    this.atmosphere = a;
    const u = this.skyMat.uniforms;
    u.uTop.value.set(a.skyTop);
    u.uMid.value.set(a.skyMid);
    u.uHorizon.value.set(a.skyHorizon);
    u.uGlow.value.set(a.skyGlow);
    this.scene.fog.color.set(a.fog);
    this.scene.fog.density = a.fogDensity;
    this.hemi.color.set(a.hemiSky);
    this.hemi.groundColor.set(a.hemiGround);
    this.hemi.intensity = a.hemiIntensity;
    this.moonLight.color.set(a.moonColor);
    this.moonLight.intensity = a.moonIntensity;
    const d = new THREE.Vector3(...a.moonDir).normalize();
    this.moonLight.position.copy(d).multiplyScalar(90);
    this.moonLight.target.position.set(0, 0, 0);
    this.moon.position.copy(d).multiplyScalar(430);
    this.moonHalo.position.copy(this.moon.position);
    this.starMat.uniforms.uAlpha.value = a.starAlpha;
    for (const m of this.cloudMat) m.color.set(a.cloudColor);
    this.renderer.toneMappingExposure = a.exposure;
    if (this.bloomPass) this._applyBloom();

    // bake sky reflections so wet stone / metal picks up the night colours
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 1000);
    this.scene.environment = this.envTarget.texture;
  }

  _applyBloom() {
    const b = (this.atmosphere && this.atmosphere.bloom) || { strength: 0.8, radius: 0.55, threshold: 0.88 };
    this.bloomPass.strength = b.strength;
    this.bloomPass.radius = b.radius;
    this.bloomPass.threshold = b.threshold;
  }

  /** Colour flash from a burst (decays quickly in update()). */
  flash(x, y, z, r, g, b, intensity) {
    const l = this.flashLight;
    l.position.set(x, y, z);
    l.color.setRGB(r, g, b);
    if (intensity > l.intensity) l.intensity = intensity;
  }

  /** Call every frame while something burns; the light fades out by itself when calls stop. */
  glow(x, y, z, r, g, b, intensity) {
    const l = this.glowLight;
    l.position.set(x, y, z);
    l.color.setRGB(r, g, b);
    if (intensity > this._glowTarget) this._glowTarget = intensity;
  }

  // --------------------------------------------------------------- quality
  setQuality(name) {
    const q = GRAPHICS[name] || GRAPHICS.medium;
    this.quality = GRAPHICS[name] ? name : 'medium';
    this.moonLight.castShadow = q.shadows;
    if (this.moonLight.shadow.mapSize.x !== q.shadowMap) {
      this.moonLight.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      if (this.moonLight.shadow.map) {
        this.moonLight.shadow.map.dispose();
        this.moonLight.shadow.map = null;
      }
    }
    this.clouds.forEach((c, i) => (c.visible = i < q.clouds));
    this._buildComposer(q);
    this.resize(this.width, this.height);
  }

  _buildComposer(q) {
    this._disposeComposer();
    if (!q.bloom) return;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    const samples = this.renderer.capabilities.isWebGL2 ? q.msaa : 0;
    const target = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(this.width * pr)),
      Math.max(1, Math.floor(this.height * pr)),
      { type: THREE.HalfFloatType, samples },
    );
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.8, 0.55, 0.88);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this._applyBloom();
  }

  _disposeComposer() {
    if (!this.composer) return;
    if (this.bloomPass) this.bloomPass.dispose();
    this.composer.dispose();
    this.composer = null;
    this.bloomPass = null;
  }

  resize(w, h) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    const q = GRAPHICS[this.quality];
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.width, this.height, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(this.width, this.height);
    }
    this.shared.uPixelRatio.value = pr;
    this.shared.uMaxSize.value = 160 * pr;
    this.updateScale();
  }

  /** Converts world-unit point sizes to pixels for the current camera / resolution. */
  updateScale() {
    const h = this.renderer.domElement.height;
    this.shared.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  // ----------------------------------------------------------------- frame
  update(dt, time) {
    this.shared.uTime.value = time;
    this.skyGroup.position.copy(this.camera.position);
    this.cloudPivot.rotation.y += dt * 0.004;
    const gl = this.glowLight;
    gl.intensity += (this._glowTarget - gl.intensity) * (1 - Math.exp(-14 * dt));
    if (gl.intensity < 0.3 && this._glowTarget === 0) gl.intensity = 0;
    this._glowTarget = 0;
    const l = this.flashLight;
    if (l.intensity > 0) {
      l.intensity *= Math.exp(-5 * dt);
      if (l.intensity < 0.5) l.intensity = 0;
    }
  }

  render(dt) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._disposeComposer();
    if (this.envTarget) this.envTarget.dispose();
    this.pmrem.dispose();
    disposeObject(this.skyGroup);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
