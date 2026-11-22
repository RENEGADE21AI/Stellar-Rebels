import { innerRoute, outerRoute } from './routes.mjs';
import { buildCampaign, veteranRoute } from './campaign-routes.mjs';
import { SIDE_OPERATIONS } from './side-operations.mjs';

export { ACTS, FREE_MISSIONS } from './campaign-routes.mjs';
export { UPGRADES, weaponStats } from './progression.mjs';
export { SIDE_OPERATIONS } from './side-operations.mjs';

export const WIDTH = 384;
export const HEIGHT = 768;
export const RULES_VERSION = 'arcade-12';
export const FIXED_TICK = 1 / 60;
export const AIM_PRECISION = 16;
export const INPUT_SHIFT = 1;
export const INPUT_RESUME = 2;
export const GUNNER_MUZZLES = [[-21,22],[21,22]];
export const GHOST = { capacity: 100, start: 100, recharge: 3, cost: 38, duration: 1.05, recovery: 1.15, hop: 18, hopRecovery: .42 };

export const SPECIALS = {
  ghost: { name: 'Ghost Shift', label: 'Shift', clearance: 0, cost: GHOST.cost,
    description: 'Briefly phase through physical fire.' },
  ion: { name: 'Ion Burst', label: 'Burst', clearance: 2, cost: 50, radius: 96, recovery: 1.65,
    description: 'Clear nearby physical shots. Beams and debris keep moving.' }
};

export const SHIPS = {
  kestrel: {
    name: 'Fighter', role: 'Fighter', clearance: 0, hull: 5, speed: 318, interval: .224,
    size: 58, hit: 8, engines: [[-3.2, 17], [3.2, 17]],
    guns: [[-10.5, -6.5, 0, .89], [10.5, -6.5, 0, .89]],
    description: 'Twin parallel guns and responsive handling. Line both lanes up on large targets.'
  },
  needle: {
    name: 'Interceptor', role: 'Interceptor', clearance: 2, hull: 4, speed: 388, interval: .19,
    size: 59, hit: 6.8, engines: [[0, 23]],
    guns: [[0, -22, 0, 1.55]],
    description: 'A concentrated center lance and quick lateral movement. Slip through tight gaps with less hull.'
  },
  bastion: {
    name: 'Gunship', role: 'Gunship', clearance: 3, hull: 5, speed: 258, interval: .30,
    size: 68, hit: 9.2, engines: [[-19.2, 13.7], [0, 23.3], [19.2, 13.7]],
    guns: [[-18.6, -17.3, -.21, .8], [-10.8, -17.3, -.009, .95], [10.8, -17.3, .009, .95], [18.6, -17.3, .21, .8]],
    description: 'A broad four-gun salvo covers groups and wide targets. Move early to make up for slower handling.'
  }
};

export const PICKUPS = {
  power: { name: 'Multi-Shot', hint: 'Adds two flank shots for 12 seconds.', color: '#c8a0ff', duration: 12 },
  barrier: { name: 'Shield', hint: 'Blocks one hit for up to 12 seconds.', color: '#77c7ff', duration: 12 },
  repair: { name: 'Repair', hint: 'Restores up to two hull segments.', color: '#8bffd0', hull: 2 },
  overdrive: { name: 'Rapid Fire', hint: 'Faster, harder shots for seven seconds.', color: '#ffd478', duration: 7 }
};

export const ENEMIES = {
  scout: { name: 'Scout', hull: 2.45, y: 138, size: 43, hit: 11, value: 120, cadence: 1.95, speed: 166, drift: 20, muzzle: 11 },
  lancer: { name: 'Gunner', hull: 5.4, y: 169, size: 52, hit: 13, value: 240, cadence: 2.28, speed: 107, drift: 8 },
  diver: { name: 'Diver', hull: 3.35, y: 144, size: 42, hit: 10, value: 220, cadence: 3.25, speed: 144, drift: 10, muzzle: 18 },
  sweeper: { name: 'Sweeper', hull: 6.8, y: 153, size: 56, hit: 14, value: 270, cadence: 2.3, speed: 100, drift: 43, muzzle: 7 },
  escort: { name: 'Escort', hull: 8.4, y: 191, size: 54, hit: 15, value: 300, cadence: 2.62, speed: 90, drift: 9, muzzle: 16 },
  relay: { name: 'Command Ship', hull: 6.6, y: 133, size: 55, hit: 15, value: 390, cadence: 2.73, speed: 91, drift: 20, muzzle: 17 },
  phantom: { name: 'Phantom', hull: 6.1, y: 153, size: 59, hit: 14, value: 295, cadence: 2.7, speed: 113, drift: 25, muzzle: 19 },
  splitter: { name: 'Splitter', hull: 6.2, size: 58, hit: 15, value: 310, speed: 102 },
  shard: { name: 'Shard', hull: 1.3, size: 26, hit: 7, value: 60, speed: 247, cadence: 4, muzzle: 8 }
};

// Lanes are normalized fractions. Successive craft arrive at 0.25-second intervals.
const formations = {
  arrow: [['scout', .49], ['scout', .34], ['scout', .66], ['scout', .21], ['scout', .79]],
  column: [['scout', .24], ['scout', .28], ['scout', .32], ['scout', .36]],
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
  surge: [['sweeper', .18], ['diver', .32], ['relay', .52], ['escort', .59], ['lancer', .84], ['diver', .74]],
  ladder: [['lancer', .17], ['scout', .27], ['lancer', .46], ['scout', .56], ['lancer', .77], ['diver', .86]],
  pinch: [['sweeper', .22], ['sweeper', .78], ['diver', .40], ['diver', .60], ['escort', .50]],
  specters: [['phantom', .32], ['scout', .50], ['phantom', .69], ['diver', .81]],
  splitWing: [['splitter', .44], ['scout', .18], ['scout', .76]],
  screen: [['scout', .29], ['diver', .61], ['scout', .77]],
  returnPatrol: [['scout', .14], ['diver', .75], ['scout', .33], ['scout', .64], ['diver', .49]],
  watch: [['lancer', .27], ['escort', .49], ['lancer', .73], ['scout', .58]],
  pincer: [['diver', .16], ['sweeper', .77], ['diver', .35], ['sweeper', .56], ['scout', .87]],
  counterwing: [['relay', .46], ['diver', .72], ['lancer', .64], ['scout', .23], ['diver', .32]],
  convoyWing: [['relay', .61], ['escort', .59], ['escort', .73], ['lancer', .32], ['scout', .81]],
  wreckGuard: [['splitter', .26], ['phantom', .71], ['sweeper', .57], ['scout', .38]],
  veilWing: [['phantom', .26], ['phantom', .74], ['diver', .48], ['phantom', .61]],
  wingSweep: [['sweeper', .19], ['scout', .33], ['sweeper', .61], ['scout', .77]],
  scissor: [['diver', .14], ['scout', .86], ['diver', .35], ['diver', .72], ['sweeper', .51]],
  freightScreen: [['escort', .35], ['lancer', .41], ['relay', .47], ['escort', .56], ['scout', .79]],
  railCover: [['lancer', .23], ['diver', .82], ['lancer', .57], ['escort', .68], ['scout', .39]],
  voidPatrol: [['phantom', .21], ['diver', .77], ['splitter', .51], ['phantom', .68], ['scout', .35]],
  ghostEscort: [['relay', .45], ['phantom', .25], ['escort', .54], ['phantom', .72], ['diver', .87]],
  bomberFlight: [['lancer', .35], ['scout', .49], ['lancer', .65], ['scout', .21], ['diver', .78]],
  recoveryRaid: [['scout', .27], ['splitter', .58], ['diver', .77], ['scout', .42]],
  supplyTransport: [['escort', .39], ['lancer', .48], ['escort', .61], ['diver', .22], ['scout', .77]],
  hunterWing: [['diver', .31], ['scout', .49], ['diver', .69], ['lancer', .37], ['sweeper', .79]],
  reinforcement: [['relay', .36], ['lancer', .52], ['relay', .63], ['sweeper', .26], ['escort', .71]]
};

export function formation(name, flipped = false) {
  return formations[name].map(([kind, lane], i) => ({ kind, lane: flipped ? 1 - lane : lane, after: i * .25 }));
}

const legacyStages = [
  {
    id: 1, name: 'Vesper Orbit', region: 'Blockade', brief: 'Fight through the blockade.', accent: '#ff8752',
    environment: 'breach', boss: 'gatekeeper', bossAt: 126, first: 78, repeat: 16, defeatCap: 20,
    cruisers: [{ at:46, variant:'patrol' }, { at:82, variant:'heavy' }],
    chapters: [[0,'Approach'],[16,'Blockade screen'],[46,'Cruiser patrol'],[82,'Heavy cruiser'],[103,'Final approach']],
    waves: [[.6,'arrow',0,'opening'],[6.4,'column',1],[12.5,'spear'],[19.5,'hook','flank'],[30,'linked'],[38,'rake'],[43,'anvil'],
      [47.4,'screen',1],[58,'linked',1],[63,'sweep'],[71,'break'],[77,'column',1],[89,'screen'],[98,'anvil','flank'],
      [103,'linked'],[112,'hook','flank'],[118,'cross']],
    drops: [[14,'power',.50,'opening'],[39,'barrier',.65],[72,'repair',.37],[99,'power',.57],[116,'overdrive',.50]],
    mastery: { name: 'Disarm the Warden', detail: 'Destroy both turrets before the main hull.', condition: 'parts' }
  },
  ...innerRoute,
  ...outerRoute
];

export const STAGES = buildCampaign(legacyStages);
const standardStages = [...STAGES, ...SIDE_OPERATIONS];
const veteranStages = STAGES.map(veteranRoute);

export const BOSSES = {
  gatekeeper: { name: 'Warden', intro: 'Destroy its two turrets.', hull: 164, size: 235, artSize:267, hit: 38, motion: 43, parts: [[-59, 28], [59, 28]], partHull: 27 },
  warden: { name: 'Harrow', intro: 'Follow each debris gap.', hull: 186, size: 203, artSize:242, hit: 42, motion: 42, arrivalY:225, parts: [] },
  matron: { name: 'Relay Carrier', intro: 'Break the linked nodes to expose the core.', hull: 196, size: 198, artSize:246, hit: 35, motion: 42, parts: [[-63, 40], [63, 40]], partHull: 30 },
  tyrant: { name: 'Rail Ship', intro: 'Leave its striped lane before the rail fires.', hull: 238, size: 245, hit: 40, motion: 47, arrivalY: 230, parts: [] },
  siphon: { name: 'Gravity Platform', intro: 'Stay clear of pull lanes.', hull: 253, size: 224, artSize:247, hit: 37, motion: 47, arrivalY: 248, parts: [] },
  wraith: { name: 'Wraith', intro: 'Hop to match realms. Shoot the core.', hull: 152, size: 215, hit: 37, motion: 48, arrivalY: 229, parts: [] },
  crown: { name: 'Flagship', intro: 'Break its pylons and read the next safe seam.', hull: 272, size: 208, artSize:258, hit: 40, motion: 45, arrivalY: 231, parts: [[-77, 35], [77, 35]], partHull: 37 },
  interdictor: { name:'Rear Guard', intro:'Target the wing guns or press the hull.', art:'cruiser-alt', body:'cruiser',
    hull:150, size:250, artSize:250, hit:35, motion:36, arrivalY:218,
    parts:[[-50,27,'turret',24],[50,27,'turret',24]] },
  convoy: { name:'Supply Tender', intro:'Break the cargo couplers to expose its hull.', art:'cruiser', body:'cruiser', shielded:true,
    hull:152, size:288, artSize:288, hit:38, motion:28, arrivalY:205,
    parts:[[-59,25,'shield',26],[59,25,'shield',26],[0,58,'turret',31]] },
  bulwark: { name:'Border Bastion', intro:'Break the gun batteries or target the center.', art:'tyrant', body:'tyrant',
    hull:204, size:302, hit:46, motion:19, arrivalY:217,
    parts:[[-71,26,'rail',30],[71,26,'rail',30],[-27,54,'turret',25],[27,54,'turret',25]] },
  scavenger: { name:'Salvage Platform', intro:'Find the opening as it sends scrap downrange.', art:'warden', body:'warden',
    hull:182, size:239, hit:39, motion:30, arrivalY:207, parts:[] },
  beacon: { name:'Spectral Beacon', intro:'Silence the two transmitters.', art:'matron', body:'matron', shielded:true,
    hull:158, size:240, hit:40, motion:36, arrivalY:220,
    parts:[[-61,39,'shield',31],[61,39,'shield',31]] },
  vanguard: { name:'Vanguard', intro:'Take out its batteries to open a fire lane.', art:'gatekeeper', body:'gatekeeper',
    hull:230, size:309, artSize:267, hit:46, motion:27, arrivalY:206,
    parts:[[-59,28,'turret',35],[59,28,'turret',35],[-25,56,'rail',28],[25,56,'rail',28]] },
  citadel: { name:'Defense Citadel', intro:'Destroy all three nodes to drop the defense shield.', art:'crown', body:'crown', shielded:true,
    hull:207, size:320, artSize:258, hit:47, motion:17, arrivalY:192,
    parts:[[-77,34,'shield',34],[77,34,'shield',34],[0,109,'shield',36]] },
  stabilizer: { name:'Array Stabilizer', intro:'Break the stabilizer arms between pull lanes.', art:'siphon', body:'siphon', shielded:true,
    hull:210, size:310, artSize:247, hit:43, motion:23, arrivalY:217,
    parts:[[-69,94,'stabilizer',33],[69,94,'stabilizer',33],[-29,62,'shield',28],[29,62,'shield',28]] },
  emperor: { name:'Imperial Flagship', intro:'Disable its systems. Destroy the Dark Matter core.', art:'crown', body:'crown', shielded:true,
    hull:270, size:472, artSize:258, hit:53, motion:12, arrivalY:160,
    parts:[[-76,35,'rail',40],[76,35,'rail',40],[-38,57,'stabilizer',35],[38,57,'stabilizer',35]],
    coreHit:[[-23,157,23,204]], coreY:183 },
  gridControl: { name:'Grid Control', intro:'Dismantle all four batteries to drop its shield.', art:'siphon', body:'siphon', shielded:true,
    hull:175, size:295, hit:43, motion:14, arrivalY:194,
    parts:[[-99,99,'rail',27],[99,99,'rail',27],[-43,74,'shield',30],[43,74,'shield',30]] },
  ambushLead: { name:'Ambush Leader', intro:'Watch the lead ship’s flank attacks.', art:'warden', body:'warden',
    hull:168, size:240, hit:42, motion:62, arrivalY:220, parts:[[-80,75,'turret',22],[80,75,'turret',22]] },
  hunterLead: { name:'Hunter Lead', intro:'Track its lateral passes between salvos.', art:'lancer-alt', body:'lancer',
    hull:168, size:161, hit:34, motion:94, arrivalY:235, parts:[] },
  signalPost: { name:'Communications Post', intro:'Destroy both marked transmitters before the signal goes out.', art:'matron', body:'matron', shielded:true,
    hull:183, size:266, hit:45, motion:21, arrivalY:211,
    parts:[[-71,53,'transmitter',34],[71,53,'transmitter',34],[0,83,'turret',23]] },
  siegeShip: { name:'Siege Cruiser', intro:'Disarm the gun batteries and defeat the armored cruiser.', art:'cruiser-alt', body:'cruiser', shielded:true,
    hull:244, size:414, hit:51, motion:15, arrivalY:172,
    parts:[[-126,49,'rail',35],[126,49,'rail',35],[-64,58,'turret',34],[64,58,'turret',34]] }
};

export const LEGACY_ENDLESS_BOSSES = [...legacyStages.map((stage) => stage.boss), 'siphon'];
export const ENDLESS_BOSSES = ['gatekeeper','warden','matron','tyrant','wraith','emperor','siphon'];

export function stageById(id, mode = 'arcade') {
  return (mode === 'veteran' ? veteranStages : standardStages).find((stage) => stage.id === id);
}

export function nextStage(id) {
  const current = stageById(id);
  return current ? STAGES[current.number] : undefined;
}

export function legacyStageById(id) {
  return legacyStages[id - 1];
}

export function hardpointAt(body, dx, dy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: body.x + dx * cos - dy * sin, y: body.y + dx * sin + dy * cos };
}

export function enemyMuzzle(enemy) {
  return hardpointAt(enemy, 0, ENEMIES[enemy.kind].muzzle ?? 9, enemy.turn ?? 0);
}
