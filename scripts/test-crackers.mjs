// Headless behaviour test for all ten crackers (three.js replaced by a stub, audio/particles mocked).
// Verifies every cracker finishes, emits valid particles, plays its own sounds and stops its loops.
import assert from 'node:assert/strict';
import { CRACKERS } from '../src/crackers/CrackerCatalog.js';
import { CrackerManager } from '../src/crackers/CrackerManager.js';
import { Fireworks } from '../src/fireworks/Fireworks.js';
import { EmitConfig } from '../src/fireworks/ParticleSystem.js';
import { SOUNDS } from '../src/audio/SoundEffects.js';

const finite = (...v) => v.every((x) => Number.isFinite(x));
function makeEnv() {
  const log = { emits: 0, puffs: 0, sounds: [], loops: [], glows: 0, flashes: 0, looks: 0, shakes: 0, bursts: [], launches: [] };
  const cfg = new EmitConfig();
  const ps = {
    cfg,
    emit(x, y, z, vx, vy, vz) {
      assert.ok(finite(x, y, z, vx, vy, vz), `particle args must be finite: ${[x, y, z, vx, vy, vz]}`);
      assert.ok(cfg.life > 0 && cfg.size > 0 && finite(cfg.drag, cfg.gravity, cfg.r0, cfg.g0, cfg.b0), 'valid cfg');
      log.emits++;
    },
    clear() {},
  };
  const smoke = { puff(...a) { assert.ok(finite(...a), `smoke args finite ${a}`); log.puffs++; }, clear() {} };
  const fireworks = new Fireworks(ps);
  const audio = {
    play(name, o = {}) {
      assert.ok(SOUNDS[name], `sound "${name}" exists`);
      log.sounds.push(name);
      const v = { name, stopped: false, set() {}, setPos(x, y, z) { assert.ok(finite(x, y, z)); }, stop() { this.stopped = true; }, after() {} };
      if (['fuse', 'sparkler', 'anar', 'spinner'].includes(name)) log.loops.push(v);
      return v;
    },
    onLaunch() {}, onBurst(e) { log.bursts.push(e); }, onFountain() {},
  };
  fireworks.on('burst', (e) => audio.onBurst(e));
  fireworks.on('launch', (e) => log.launches.push({ ...e }));
  const world = { glow(x, y, z, r, g, b, i) { assert.ok(finite(x, y, z, r, g, b, i), `glow finite ${[x, y, z, i]}`); log.glows++; }, flash() { log.flashes++; }, scene: { add() {}, remove() {} } };
  const rig = { lookUp() { log.looks++; }, addShake() { log.shakes++; }, camera: {} };
  return { log, ctx: { ps, smoke, fireworks, audio, world, rig, haptic() {}, radius: 21 }, ps, smoke, fireworks, audio, world, rig };
}

const EXPECT = {
  phuljhadi: ['match', 'sparkler'], anar: ['match', 'fuse', 'anar'], chakri: ['match', 'spinner'], zameen: ['match', 'spinner'],
  rocket: ['match', 'fuse', 'rocketFlight'], sutli: ['match', 'fuse', 'bomb'], ladis: ['match', 'fuse', 'snap'],
  pencil: ['match', 'fuse', 'pencil', 'snap'], skyshot: ['match', 'fuse', 'mortar'], snappers: ['snapper'],
};

assert.equal(CRACKERS.length, 10, 'ten crackers');
const summary = [];
for (const def of CRACKERS) {
  const env = makeEnv();
  const model = def.build();
  const inst = new def.Behavior(def, model, env.ctx, 0, 4);
  const dt = 1 / 60;
  let t = 0;
  while (!inst.done && t < 20) {
    inst.update(dt);
    env.fireworks.update(dt);
    t += dt;
  }
  assert.ok(inst.done, `${def.id} must finish (ran ${t.toFixed(1)}s)`);
  assert.ok(env.log.emits > 20, `${def.id} emits particles (${env.log.emits})`);
  for (const s of EXPECT[def.id]) assert.ok(env.log.sounds.includes(s), `${def.id} plays "${s}" (got ${[...new Set(env.log.sounds)]})`);
  assert.ok(env.log.loops.every((v) => v.stopped), `${def.id} stops every looping sound`);
  assert.ok(env.log.glows > 0, `${def.id} drives the glow light`);
  if (def.id === 'rocket' || def.id === 'skyshot') {
    // let the shell reach its burst
    for (let i = 0; i < 60 * 4; i++) env.fireworks.update(dt);
    assert.equal(env.log.launches.length, 1, `${def.id} launches one shell`);
    assert.equal(env.log.launches[0].tag, def.id, `${def.id} tags its launch`);
    assert.equal(env.log.bursts.length, 1, `${def.id} bursts in the sky`);
    assert.equal(env.log.bursts[0].tag, def.id);
    assert.ok(env.log.looks >= 1, 'camera looks up for the shell');
  }
  if (def.id === 'ladis') assert.ok(env.log.sounds.filter((s) => s === 'snap').length >= 50, 'ladis pops many times');
  if (def.id === 'snappers') assert.equal(env.log.sounds.filter((s) => s === 'snapper').length, 6, 'six snapper pops');
  if (def.id === 'pencil') assert.ok(env.log.sounds.filter((s) => s === 'pencil').length >= 9, 'pencil pulses');
  summary.push(`${def.id}:${t.toFixed(1)}s/${env.log.emits}p`);
}

// manager: selection, lock-out and repeat firing
{
  const env = makeEnv();
  const game = { world: env.world, particles: env.ps, smoke: env.smoke, fireworks: env.fireworks, audio: env.audio, rig: env.rig, scenes: { current: { playRadius: 21 } }, haptic() {} };
  const m = new CrackerManager(game);
  const changes = [];
  m.on('change', () => changes.push(1));
  m.resume();
  assert.equal(m.canIgnite(), false, 'nothing selected');
  m.select('anar');
  assert.ok(m.canIgnite());
  assert.ok(m.ignite());
  assert.equal(m.canIgnite(), false, 'non-repeatable is locked while burning');
  assert.equal(m.ignite(), false, 'accidental second ignition is blocked');
  m.select('rocket');
  assert.ok(m.canIgnite(), 'can select another cracker while one burns');
  for (let i = 0; i < 4; i++) assert.ok(m.ignite(), 'repeatable fires again');
  assert.equal(m.ignite(), false, 'cap of simultaneous repeats');
  for (let i = 0; i < 60 * 12; i++) { m.update(1 / 60); env.fireworks.update(1 / 60); }
  assert.equal(m.active.length, 0, 'all instances cleaned up');
  m.select('anar');
  assert.ok(m.canIgnite(), 'anar can be lit again after it finished');
  m.moveTo(100, -100);
  assert.ok(Math.abs(m.pos.x) <= 21 && Math.abs(m.pos.z) <= 21, 'placement clamped to the courtyard');
  m.ignite();
  m.suspend();
  assert.equal(m.active.length, 0, 'suspend aborts running crackers');
  assert.ok(changes.length > 5);
}
console.log(`OK: ${summary.join('  ')}`);
