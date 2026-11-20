import { innerRoute } from './routes.mjs';

export const WIDTH = 384;
export const HEIGHT = 768;
export const RULES_VERSION = 'arcade-1';

export const SHIPS = {
  kestrel: {
    name: 'Fighter', role: 'Fighter', clearance: 0, hull: 5, speed: 318, interval: .224,
    size: 58, hit: 8, engines: [[-9.6, 19], [9.6, 19]],
    guns: [[-9.3, -15, 0, .89], [9.3, -15, 0, .89]],
    description: 'Twin parallel guns and responsive handling. Line both lanes up on large targets.'
  },
  needle: {
    name: 'Interceptor', role: 'Interceptor', clearance: 2, hull: 4, speed: 388, interval: .19,
    size: 59, hit: 6.8, engines: [[0, 18]],
    guns: [[0, -18, 0, 1.55]],
    description: 'A concentrated center lance and quick lateral movement. Slip through tight gaps with less hull.'
  },
  bastion: {
    name: 'Gunship', role: 'Gunship', clearance: 4, hull: 6, speed: 258, interval: .30,
    size: 68, hit: 9.2, engines: [[-18, 13], [0, 19], [18, 13]],
    guns: [[-19, -6, -.21, .8], [-10, -13, -.09, .95], [10, -13, .09, .95], [19, -6, .21, .8]],
    description: 'A broad four-gun salvo and reinforced hull. Move early and dominate the approach lanes.'
  }
};

export const UPGRADES = {
  rails: { name: 'Calibrated Rails', cost: 70, detail: '+8% weapon damage', icon: 'power' },
  chamber: { name: 'Cycling Chamber', cost: 125, needs: 'rails', detail: '+9% rate of fire', icon: 'overdrive' },
  cells: { name: 'Resonant Cells', cost: 210, needs: 'chamber', detail: '+10% weapon damage', icon: 'power' },
  hull: { name: 'Ablative Hull', cost: 95, detail: '+1 hull on every ship', icon: 'barrier' }
};

export const PICKUPS = {
  power: { name: 'Weapon Power', hint: 'Adds two flank shots for 12 seconds.', color: '#c8a0ff', duration: 12 },
  barrier: { name: 'Barrier', hint: 'Blocks the next two hits.', color: '#77c7ff', charges: 2 },
  repair: { name: 'Repair', hint: 'Restores up to two hull segments.', color: '#8bffd0', hull: 2 },
  overdrive: { name: 'Overdrive', hint: 'Faster, harder shots for seven seconds.', color: '#ffd478', duration: 7 }
};

export const ENEMIES = {
  scout: { name: 'Scout', hull: 2.45, y: 138, size: 43, hit: 11, value: 120, cadence: 2.9, speed: 108, drift: 20 },
  lancer: { name: 'Gunner', hull: 5.4, y: 169, size: 52, hit: 13, value: 240, cadence: 2.6, speed: 95, drift: 8 },
  diver: { name: 'Diver', hull: 3.35, y: 144, size: 42, hit: 10, value: 220, cadence: 3.25, speed: 119, drift: 10 },
  sweeper: { name: 'Sweeper', hull: 6.8, y: 153, size: 56, hit: 14, value: 270, cadence: 2.45, speed: 84, drift: 43 },
  escort: { name: 'Escort', hull: 8.4, y: 191, size: 54, hit: 15, value: 300, cadence: 2.8, speed: 90, drift: 9 },
  relay: { name: 'Command Ship', hull: 6.6, y: 133, size: 55, hit: 15, value: 390, cadence: 2.9, speed: 91, drift: 20 }
};

// Lanes are normalized fractions. Successive craft arrive at 0.25-second intervals.
const formations = {
  arrow: [['scout', .49], ['scout', .34], ['scout', .66], ['scout', .21], ['scout', .79]],
  rake: [['scout', .15], ['scout', .28], ['scout', .43], ['scout', .61], ['scout', .78]],
  spear: [['lancer', .48], ['scout', .31], ['scout', .67], ['scout', .80]],
  cross: [['diver', .20], ['diver', .80], ['scout', .49], ['scout', .34], ['scout', .66]],
  linked: [['relay', .53], ['scout', .26], ['scout', .74], ['lancer', .34], ['lancer', .66]],
  hook: [['lancer', .18], ['diver', .77], ['scout', .54], ['scout', .69]],
  anvil: [['lancer', .29], ['lancer', .73], ['scout', .49], ['diver', .84]],
  sweep: [['sweeper', .28], ['sweeper', .72], ['scout', .50]],
  escort: [['escort', .39], ['escort', .61], ['relay', .50], ['scout', .2], ['scout', .80]],
  break: [['diver', .19], ['sweeper', .54], ['lancer', .80], ['scout', .37], ['diver', .72]],
  trap: [['relay', .26], ['escort', .33], ['lancer', .78], ['diver', .57], ['scout', .88]],
  surge: [['sweeper', .18], ['diver', .32], ['relay', .52], ['escort', .59], ['lancer', .84], ['diver', .74]]
};

export function formation(name, flipped = false) {
  return formations[name].map(([kind, lane], i) => ({ kind, lane: flipped ? 1 - lane : lane, after: i * .25 }));
}

export const STAGES = [
  {
    id: 1, name: 'Vesper Orbit', region: 'Blockade', brief: 'Fight through the blockade.', accent: '#ff8752',
    environment: 'breach', boss: 'gatekeeper', bossAt: 147, first: 78, repeat: 16, defeatCap: 20,
    waves: [[1,'arrow'],[8,'rake'],[15,'linked'],[26,'spear'],[33,'rake',1],[40,'spear',1],[48,'cross'],[55,'hook'],[63,'linked',1],[74,'anvil'],[82,'rake'],[89,'hook',1],[96,'anvil',1],[103,'arrow'],[109,'cross'],[116,'linked'],[127,'anvil'],[134,'hook',1],[140,'cross']],
    drops: [[18,'power',.51],[43,'barrier',.67],[79,'repair',.37],[110,'power',.56],[138,'overdrive',.5]],
    mastery: { name: 'Disarm the Warden', detail: 'Destroy both turrets before the main hull.', condition: 'parts' }
  },
  ...innerRoute
];

export const BOSSES = {
  gatekeeper: { name: 'Warden', intro: 'Destroy the marked turrets to cut their fire.', hull: 164, size: 267, hit: 41, motion: 43, parts: [[-69, 31], [69, 31]], partHull: 27 },
  warden: { name: 'Harrow', intro: 'Move through the seams in the debris walls.', hull: 186, size: 242, hit: 44, motion: 42, parts: [] },
  matron: { name: 'Relay Carrier', intro: 'Break the linked nodes to expose the core.', hull: 196, size: 246, hit: 37, motion: 42, parts: [[-70, 6], [70, 6]], partHull: 30 },
  tyrant: { name: 'Rail Ship', intro: 'Leave its striped lane before the rail fires.', hull: 238, size: 245, hit: 40, motion: 47, parts: [] },
  siphon: { name: 'Gravity Platform', intro: 'Keep clear of its pull lane and rotating fan.', hull: 253, size: 247, hit: 39, motion: 47, parts: [] },
  crown: { name: 'Flagship', intro: 'Break its pylons and read the next safe seam.', hull: 272, size: 258, hit: 45, motion: 45, parts: [[-74, 8], [74, 8]], partHull: 37 }
};

export function stageById(id) {
  return STAGES[id - 1];
}

export function weaponStats(owned) {
  return {
    damage: (owned.includes('rails') ? 1.08 : 1) * (owned.includes('cells') ? 1.10 : 1),
    rate: owned.includes('chamber') ? 1.09 : 1,
    hull: Number(owned.includes('hull'))
  };
}

export function hardpointAt(body, dx, dy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: body.x + dx * cos - dy * sin, y: body.y + dx * sin + dy * cos };
}
