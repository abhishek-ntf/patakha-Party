# Patakha Party 2.0 - Phase 1 + cracker selection + Phase 2 audio

3D Diwali fireworks simulator built with **Three.js + Vite + JavaScript** only.

## Run
```bash
npm install
npm run dev        # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run check      # static check of imports/exports
```

## Controls
| Action | Desktop | Mobile |
|---|---|---|
| Look around | drag | one-finger drag |
| Zoom | wheel | pinch |
| Light fountain / launch rocket | click | tap |
| Random firework | Space | - |
| Modes | 1 ground, 2 sky, 3 show | menu buttons |
| Home / Settings / Fullscreen / Reset view | H or Esc / S / F / R | HUD buttons |

## Architecture (src/)
- `game/` Game (composition root), World (renderer, sky, lights, bloom, quality), Camera (smooth orbit rig + presets), GameLoop, GameState, ModeManager
- `environments/` Environment base, SceneManager, Courtyard (more environments register in SceneManager)
- `fireworks/` ParticleSystem (GPU-simulated pooled ring buffer), ExplosionTypes (registry), Fireworks (launch + burst events)
- `modes/` BaseMode + Menu / Ground / Sky / Show
- `systems/` InputManager (pointer events), Pointing (ray -> ground/sky), StorageManager, ProgressManager
- `ui/` HUD, MainMenu, Settings, UI, dom helpers
- `audio/`, `crackers/` reserved for Phases 2 and 3

Fireworks emit `launch`, `burst` and `fountain` events; audio (Phase 2) and crackers (Phase 3) subscribe to them without touching existing code.


## Phase 2 additions
- **Ground view = cracker tray.** Pick one of 10 crackers (3D preview cards), tap the floor to move it,
  press **Light it** (or tap the cracker / press Enter or Space). Arrow keys change the selection.
  With nothing selected, tapping the floor still lights the Phase 1 spark fountain.
- **Audio** (`src/audio/`): `AudioManager` (context, buses, limiter, volumes, mute, voice limits, panning),
  `SoundSynth` (noise/click buffers, Voice class), `SoundEffects` (one recipe per sound),
  `MusicManager` (procedural festive instrumental). No audio files. Starts after the first tap/key.
- **Sound controls:** speaker button (mute) + chevron (panel with master / effects / music sliders,
  mute and music on/off). `M` toggles mute.
- **Smoke:** `fireworks/SmokeSystem.js`.
- **Tests (no browser needed):** `npm test` runs the import check, a mock-Web-Audio test of every sound and
  the music scheduler, and a headless run of all ten cracker behaviours.

## Realistic bangs (update)
- Impulsive sounds (bombs, ladi pops, snappers, pencil cracks, shell bursts) use pre-rendered shock-wave
  "bang" buffers: N-wave front + crack + body + rumble, soft-clipped, several random variants.
- Courtyard reverb with distinct wall echoes and a darkening tail; distant sounds lose highs and arrive
  after the real speed-of-sound delay (distance / 343 m/s, max 0.45 s).
- Rocket whistle is a wavering band of noise, not a sine tone.
- Optional real recordings: put files in `public/sounds/` and list them in `manifest.json`
  (see `public/sounds/README.md`). They replace the synthesised sound automatically.
