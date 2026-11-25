import * as M from './CrackerModels.js';
import { Phuljhadi, PencilCrackers } from './Sparkler.js';
import { Anar } from './Fountain.js';
import { Chakri, ZameenChakkar } from './Spinner.js';
import { Rocket, SkyShot } from './Rocket.js';
import { SutliBomb } from './Bomb.js';
import { Ladis, PopPopSnappers } from './Chain.js';

/**
 * The ten selectable crackers. `repeatable` crackers can be fired again while an earlier one is
 * still burning; the others lock the Light button until they finish.
 */
export const CRACKERS = [
  { id: 'phuljhadi', name: 'Phuljhadi', sub: 'Sparkler', accent: '#ffd36b', repeatable: false,
    desc: 'Hand-held sparkler that burns down in a shower of bright, crackling stars.',
    build: M.buildPhuljhadi, Behavior: Phuljhadi },
  { id: 'anar', name: 'Anar', sub: 'Flower pot', accent: '#ff8a3d', repeatable: false,
    desc: 'Flower pot fountain. A fizzing fuse, then a tall blossom of colour-changing sparks.',
    build: M.buildAnar, Behavior: Anar },
  { id: 'chakri', name: 'Chakri', sub: 'Ground spinner', accent: '#ffb02e', repeatable: false,
    desc: 'Whirls on the floor spraying a spiral of fire. It wanders, so stand back.',
    build: M.buildChakri, Behavior: Chakri },
  { id: 'rocket', name: 'Rocket', sub: 'Sky rocket', accent: '#ff4d5e', repeatable: true,
    desc: 'Sizzling fuse, a whistling climb on a smoke trail, then a burst high in the sky.',
    build: M.buildRocket, Behavior: Rocket },
  { id: 'sutli', name: 'Sutli Bomb', sub: 'Twine bomb', accent: '#c99a5b', repeatable: true,
    desc: 'Twine-wrapped bomb with a short fuse and one deafening bang.',
    build: M.buildSutli, Behavior: SutliBomb },
  { id: 'ladis', name: 'Ladis', sub: 'Garland', accent: '#ff3d5a', repeatable: false,
    desc: 'A long garland of tiny crackers popping one after another, rapid fire.',
    build: M.buildLadis, Behavior: Ladis },
  { id: 'zameen', name: 'Zameen Chakkar', sub: 'Big ground wheel', accent: '#e24bd0', repeatable: false,
    desc: 'Big colourful wheel that buzzes, hops and zooms around in changing colours.',
    build: M.buildZameenChakkar, Behavior: ZameenChakkar },
  { id: 'pencil', name: 'Pencil Crackers', sub: 'Colour pencils', accent: '#4be0a0', repeatable: true,
    desc: 'Three slim pencils firing short, sharp coloured jets that finish with a star pop.',
    build: M.buildPencils, Behavior: PencilCrackers },
  { id: 'skyshot', name: 'Sky Shot', sub: 'Aerial shell', accent: '#5b8bff', repeatable: true,
    desc: 'A tube that thumps a shell skyward to open into a big aerial display.',
    build: M.buildSkyShot, Behavior: SkyShot },
  { id: 'snappers', name: 'Pop Pop Snappers', sub: 'Throw-down pops', accent: '#f2efe6', repeatable: true,
    desc: 'Twist packets you throw down. Each one pops with a little snap on landing.',
    build: M.buildSnappers, Behavior: PopPopSnappers },
];

export const CRACKER_BY_ID = Object.fromEntries(CRACKERS.map((c) => [c.id, c]));
