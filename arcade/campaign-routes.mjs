import { extendMission } from './campaign-pacing.mjs';

// These are permanent mission IDs. Display order changed when the six-flight
// route became a campaign. In particular, mission 3 is still saved as stage 2.
const missions = [
  {
    id:1, name:'Neyara Orbit', region:'Auren', first:112, defeatCap:25,
    brief:'Hold the line at Neyara and break the enemy command ship.',
    objective:'Defend Neyara', resolution:'The advance fleet retreats.',
    chapters:[[0,'Neyara under attack'],[16,'Orbital screen'],[46,'Cruiser patrol'],[82,'Heavy cruiser'],[103,'Command approach']],
    veteran: { waves:[[3.5,'hook',1],[23,'counterwing','flank'],[56,'returnPatrol',1],[91,'watch','flank'],[124,'screen',1]],
      terrain:[[66,'rail'],[107,'rail']] }
  },
  {
    id:7, name:'The Pursuit', region:'Auren outer orbit', first:120, defeatCap:27, accent:'#ffab88',
    brief:'Follow the retreating scouts through the wreckage.',
    objective:'Trace the retreat route', resolution:'The retreat lanes lead into the belt.',
    environment:'breach', backdrop:'wreck', boss:'interdictor', bossAt:139,
    chapters:[[0,'Retreat lanes'],[26,'Broken defense ring'],[70,'Thruster wakes'],[118,'Rear guard']],
    waves:[[.7,'column',1],[7,'cross'],[14,'hook',1],[22,'returnPatrol'],[29,'screen','flank'],[36,'rake',1],
      [43,'splitWing',1],[50,'returnPatrol','flank'],[57,'watch',1],[63,'sweep'],[70,'break',1],[79,'counterwing'],
      [87,'column'],[94,'pincer','flank'],[103,'returnPatrol'],[109,'watch',1],[118,'cross','flank'],[123,'break'],[130,'counterwing',1]],
    drops:[[12,'power',.52],[40,'barrier',.61],[70,'repair',.44],[110,'overdrive',.59]],
    terrain:[[27,'wall',3],[55,'wall',1],[92,'wall',2]],
    mastery:{ name:'Pursuit line', detail:'Collect at least three enemy supply drops and clear the mission.', condition:'supply', target:3 },
    veteran:{ waves:[[9.5,'pincer',1],[42,'counterwing',1],[67,'sweep','flank'],[100,'returnPatrol',1],[127,'watch']],
      terrain:[[81,'wall',3],[116,'wall',1]] }
  },
  {
    id:2, first:124, defeatCap:29, objective:'Cross the debris field', resolution:'Harrow falls. The convoy route is open.',
    veteran:{ waves:[[10.5,'splitWing','flank'],[37,'counterwing'],[63,'splitWing'],[98,'pincer',1],[140,'splitWing','flank']],
      terrain:[[52,'wall',3],[111,'wall',1]] }
  },
  {
    id:8, name:'Supply Line', region:'Imperial convoy route', first:132, defeatCap:31, accent:'#efba82',
    brief:'Peel away the escorts and cut the convoy’s supply couplers.',
    objective:'Cut imperial supplies', resolution:'The captured shipment log points to Relay Station.',
    environment:'relay', backdrop:'convoy', boss:'convoy', bossAt:148,
    chapters:[[0,'Convoy pickets'],[42,'Lead cruiser'],[80,'Supply escort'],[128,'Supply tender']],
    waves:[[.9,'screen',1],[9,'watch'],[16,'convoyWing'],[24,'escort',1],[32,'returnPatrol','flank'],[38,'spear'],
      [53,'convoyWing',1],[60,'hook'],[67,'anvil',1],[75,'linked','flank'],[82,'watch',1],[92,'escort'],
      [101,'screen',1],[109,'convoyWing'],[116,'counterwing',1],[124,'returnPatrol','flank'],[131,'trap'],[140,'escort',1]],
    cruisers:[{ at:42, variant:'patrol' },{ at:94, variant:'heavy' }],
    drops:[[8,'power',.48],[31,'barrier',.35],[68,'repair',.57],[110,'power',.39],[129,'overdrive',.57]],
    mastery:{ name:'Disarmed convoy', detail:'Destroy at least three passing cruiser turrets and clear the mission.', condition:'turrets', target:3 },
    veteran:{ waves:[[20,'pincer',1],[56,'returnPatrol',1],[79,'convoyWing'],[108,'counterwing','flank'],[136,'watch',1]],
      cruisers:[{ at:42, variant:'heavy' },{ at:94, variant:'heavy' }] }
  },
  {
    id:3, first:140, defeatCap:33, objective:'Intercept imperial intelligence', resolution:'The relay falls. The Dark Matter Array is real.',
    mastery:{ name:'Clear frequency', detail:'Break two linked wings and defeat the Relay Carrier.', condition:'links', target:2 },
    veteran:{ waves:[[5,'watch',1],[28,'convoyWing'],[65,'linked',1],[102.5,'pincer',1],[149,'trap','flank']],
      terrain:[[47,'rail'],[112,'rail']] }
  },
  {
    id:9, name:'Border Crossing', region:'Imperial perimeter', first:148, defeatCap:34, accent:'#f7b07b',
    brief:'Find a route through the blockade and silence its gun platforms.',
    objective:'Break through the blockade', resolution:'The border guns fall silent. The crew can cross into imperial territory.',
    environment:'sun', backdrop:'blockade', boss:'bulwark', bossAt:151,
    chapters:[[0,'Approach beacons'],[38,'Blockade patrol'],[76,'Crossfire zone'],[126,'Border bastion']],
    waves:[[1,'watch'],[8,'ladder',1],[15,'pincer'],[22,'convoyWing',1],[29,'trap'],[35,'spear',1],
      [47,'rake'],[54,'watch','flank'],[61,'cross'],[69,'ladder',1],[76,'counterwing','flank'],[86,'pinch'],
      [93,'watch',1],[106,'convoyWing'],[116,'pincer','flank'],[124,'trap',1],[133,'ladder'],[143,'counterwing']],
    cruisers:[{ at:38, variant:'heavy' },{ at:96, variant:'patrol' }],
    terrain:[[64,'rail'],[83,'rail'],[119,'rail']],
    drops:[[16,'power',.40],[50,'barrier',.58],[90,'repair',.37],[125,'overdrive',.55]],
    mastery:{ name:'Guns silent', detail:'Disable every bastion battery before destroying the hull.', condition:'bossParts' },
    veteran:{ waves:[[11.5,'counterwing'],[45,'pincer',1],[73,'watch','flank'],[105,'ladder',1],[145,'convoyWing',1]],
      terrain:[[22,'rail'],[108,'rail'],[136,'rail']] }
  },
  {
    id:4, first:154, defeatCap:36, objective:'Slip through the solar defense line', resolution:'The rail corridor is open. The crew heads for the old Zoruun system.',
    veteran:{ waves:[[12,'ladder'],[41,'watch',1],[65,'counterwing'],[103,'pincer',1],[142,'anvil']],
      terrain:[[33,'rail'],[63,'rail'],[121,'rail']] }
  },
  {
    id:10, name:'Dead System', region:'Zoruun ruins', first:160, defeatCap:38, accent:'#b4c7bd',
    brief:'Read the debris currents and follow the ruined station’s transponder.',
    objective:'Enter the ruins of Zoruun', resolution:'The wreckage reveals what the Empire’s Dark Matter experiments did.',
    environment:'belt', backdrop:'ruins', boss:'scavenger', bossAt:144,
    chapters:[[0,'Dead orbit'],[24,'Derelict yards'],[68,'Drifting scrap'],[113,'Salvage platform']],
    waves:[[.8,'splitWing'],[9,'sweep',1],[17,'watch'],[26,'splitWing',1],[34,'hook',1],[42,'rake','flank'],
      [50,'pincer'],[58,'splitWing','flank'],[65,'cross'],[74,'splitWing',1],[82,'counterwing'],[90,'sweep'],
      [98,'cross',1],[107,'watch','flank'],[116,'splitWing',1],[124,'pincer','flank'],[133,'break']],
    terrain:[[21,'wall',1],[41,'pull',.69],[58,'wall',3],[74,'pull',.25],[94,'wall',2],[110,'pull',.52],[127,'wall',1]],
    drops:[[17,'barrier',.60],[45,'power',.38],[70,'repair',.56],[109,'barrier',.38],[127,'overdrive',.63]],
    mastery:{ name:'Clean crossing', detail:'Clear the mission without taking hull damage.', condition:'integrity', target:0 },
    veteran:{ waves:[[12,'wreckGuard',1],[54,'splitWing'],[87,'pincer','flank'],[112,'wreckGuard'],[135,'splitWing','flank']],
      terrain:[[32,'pull',.23],[68,'wall',1],[120,'pull',.28]] }
  },
  {
    id:11, name:'Ghost Signals', region:'Covert signals corridor', first:166, defeatCap:39, accent:'#c4a5f8',
    brief:'Trace the signal. Spectral rounds have a distinct color and rhythm.',
    objective:'Find the source of the spectral signal', resolution:'The beacon transmits to a gravitational support installation.',
    environment:'outer', backdrop:'signal', boss:'beacon', bossAt:146,
    chapters:[[0,'Faint contact'],[37,'Spectral contact'],[78,'Signal corridor'],[120,'Imperial beacon']],
    waves:[[.9,'specters'],[8,'screen'],[16,'veilWing',1],[24,'break'],[30,'specters',1],[38,'veilWing'],
      [45,'rake',1],[52,'specters','flank'],[62,'pincer'],[69,'veilWing',1],[79,'watch'],[86,'specters',1],
      [93,'veilWing','flank'],[100,'cross'],[109,'counterwing'],[119,'specters'],[126,'veilWing'],[136,'pincer',1]],
    terrain:[[44,'pull',.67],[95,'pull',.28],[130,'pull',.71]],
    drops:[[10,'power',.52],[39,'barrier',.36],[67,'repair',.58],[105,'power',.62],[129,'overdrive',.43]],
    mastery:{ name:'Ghost on the scope', detail:'Defeat the beacon without taking hull damage during the encounter.', condition:'cleanBoss' },
    veteran:{ waves:[[12,'veilWing'],[35,'specters',1],[65,'veilWing','flank'],[92,'pincer',1],[133,'specters','flank']],
      terrain:[[68,'pull',.25],[112,'pull',.71]] }
  },
  {
    id:12, name:'Gravity Well', region:'Array support orbit', first:172, defeatCap:41, accent:'#a6cbfd',
    brief:'Let the pull lanes pass, then shoot through the gaps around the platform.',
    objective:'Disable the Array’s support installation', resolution:'The lost stabilization signal exposes a way to disable the flagship’s Array.',
    environment:'outer', backdrop:'gravity', boss:'siphon', bossAt:150,
    chapters:[[0,'Gravity survey'],[38,'Pull lanes'],[84,'Support perimeter'],[126,'Gravity Platform']],
    waves:[[.8,'watch'],[8,'pincer',1],[16,'specters'],[24,'wreckGuard','flank'],[32,'sweep',1],[40,'cross'],
      [48,'convoyWing',1],[56,'sweep'],[65,'veilWing','flank'],[73,'counterwing'],[81,'wreckGuard',1],[89,'linked'],
      [97,'pincer',1],[105,'break'],[114,'convoyWing','flank'],[122,'veilWing'],[131,'sweep'],[141,'pincer','flank']],
    terrain:[[36,'pull',.32],[57,'pull',.66],[80,'wall',2],[98,'pull',.49],[118,'pull',.24],[136,'pull',.76]],
    drops:[[13,'power',.46],[42,'barrier',.64],[71,'repair',.36],[109,'power',.54],[136,'overdrive',.64]],
    mastery:{ name:'Unbroken orbit', detail:'Clear the mission with at most one instance of hull damage.', condition:'integrity', target:1 },
    veteran:{ waves:[[11,'veilWing',1],[46,'counterwing','flank'],[62,'pincer'],[104,'sweep',1],[144,'wreckGuard',1]],
      terrain:[[50,'wall',3],[112,'pull',.65],[142,'wall',1]] }
  },
  {
    id:13, name:'The Inner Fleet', region:'Imperial anchorage', first:178, defeatCap:42, accent:'#f2a888',
    brief:'Watch the returning fighters while you knock out the fleet guns.',
    objective:'Disable the fleet’s line of battle', resolution:'The Emperor’s escorts withdraw toward the flagship.',
    environment:'flagship', backdrop:'anchorage', boss:'vanguard', bossAt:156,
    chapters:[[0,'Fleet pickets'],[40,'First line'],[85,'Battle line'],[130,'Vanguard']],
    waves:[[1,'ladder'],[7,'convoyWing',1],[15,'pincer'],[22,'returnPatrol','flank'],[30,'linked'],[37,'anvil',1],
      [50,'counterwing',1],[58,'convoyWing'],[65,'trap'],[72,'watch'],[80,'ladder','flank'],[89,'watch',1],
      [101,'returnPatrol',1],[110,'convoyWing',1],[118,'surge'],[126,'ladder',1],[136,'pincer','flank'],[145,'trap']],
    cruisers:[{ at:40, variant:'patrol' },{ at:87, variant:'heavy' }],
    terrain:[[73,'rail'],[113,'rail']],
    drops:[[18,'power',.57],[42,'barrier',.39],[76,'repair',.61],[106,'power',.34],[142,'overdrive',.61]],
    mastery:{ name:'Fleet disarmed', detail:'Destroy at least six passing cruiser turrets and clear the mission.', condition:'turrets', target:6 },
    veteran:{ waves:[[14,'anvil',1],[47,'counterwing','flank'],[68,'returnPatrol',1],[108,'pincer',1],[150,'surge',1]],
      cruisers:[{ at:40, variant:'heavy' },{ at:87, variant:'heavy' }], terrain:[[34,'rail'],[130,'rail']] }
  },
  {
    id:5, name:'Wraith', region:'Outer Orbit', first:184, defeatCap:43,
    objective:'Destroy the Empire’s realm-shifting interceptor', resolution:'The Wraith falls. The flagship’s inner defenses are within reach.',
    veteran:{ waves:[[3,'veilWing',1],[34,'pincer',1],[59,'specters'],[96,'wreckGuard',1],[144,'veilWing','flank']],
      terrain:[[51,'pull',.70],[111,'pull',.25]] }
  },
  {
    id:14, name:'Imperial Defense', region:'Flagship defensive ring', first:192, defeatCap:45, accent:'#ffc28c',
    brief:'Cut the command links and take out the defense grid’s shield nodes.',
    objective:'Disable the integrated defense grid', resolution:'The flagship can no longer draw protection from its defensive ring.',
    environment:'relay', backdrop:'defense-grid', boss:'citadel', bossAt:157,
    chapters:[[0,'Shield screen'],[41,'Cruiser line'],[80,'Defense grid'],[130,'Command citadel']],
    waves:[[.8,'convoyWing'],[7,'linked',1],[15,'escort'],[23,'pincer',1],[31,'trap','flank'],[39,'watch'],
      [48,'ladder',1],[55,'convoyWing',1],[63,'linked'],[71,'sweep','flank'],[79,'returnPatrol',1],[86,'trap'],
      [96,'escort',1],[103,'convoyWing'],[111,'pincer','flank'],[120,'linked',1],[127,'ladder'],[135,'surge',1],[146,'convoyWing',1]],
    cruisers:[{ at:41, variant:'heavy' },{ at:91, variant:'patrol' }],
    terrain:[[65,'rail'],[113,'rail'],[141,'rail']],
    drops:[[15,'power',.50],[37,'barrier',.34],[70,'repair',.55],[112,'power',.64],[140,'overdrive',.47]],
    mastery:{ name:'Broken network', detail:'Disrupt at least six linked formations and clear the mission.', condition:'links', target:6 },
    veteran:{ waves:[[11,'linked',1],[36,'watch','flank'],[60,'convoyWing',1],[109,'pincer'],[142,'trap','flank']],
      terrain:[[48,'rail'],[121,'rail']] }
  },
  {
    id:15, name:'Final Approach', region:'Array stabilization ring', first:200, defeatCap:47, accent:'#c4bcfa',
    brief:'Dismantle the stabilizer arms as the Array bends the approach lanes.',
    objective:'Destroy the external stabilizers', resolution:'The Array’s last external supports are gone. The crew has one shot at the core.',
    environment:'outer', backdrop:'stabilizer', boss:'stabilizer', bossAt:152,
    chapters:[[0,'Stabilization ring'],[40,'Debris throat'],[86,'Array crossfire'],[122,'Last stabilizer']],
    waves:[[.9,'veilWing'],[9,'watch'],[16,'splitWing',1],[24,'ladder','flank'],[31,'pincer'],[39,'wreckGuard',1],
      [47,'cross'],[55,'veilWing',1],[63,'convoyWing'],[71,'break',1],[79,'splitWing','flank'],[86,'pincer',1],
      [95,'ladder',1],[103,'counterwing'],[112,'watch',1],[121,'veilWing','flank'],[127,'wreckGuard'],[138,'trap',1],[145,'pincer']],
    terrain:[[25,'pull',.66],[40,'wall',3],[63,'rail'],[86,'pull',.30],[101,'wall',1],[119,'rail'],[137,'wall',2]],
    drops:[[12,'barrier',.57],[38,'power',.43],[73,'repair',.62],[104,'power',.38],[138,'overdrive',.53]],
    mastery:{ name:'Eyes on the Array', detail:'Clear the mission with at most one instance of hull damage.', condition:'integrity', target:1 },
    veteran:{ waves:[[6,'wreckGuard',1],[52,'pincer','flank'],[77,'veilWing'],[99,'splitWing',1],[143,'watch','flank']],
      terrain:[[36,'rail'],[74,'pull',.65],[131,'pull',.28]] }
  },
  {
    id:6, first:220, defeatCap:50, boss:'emperor', bossAt:166,
    brief:'Break the defensive systems, then destroy the Dark Matter Array’s exposed core.',
    objective:'Stop the Emperor and save Auren', resolution:'The Dark Matter Array is destroyed. The imperial offensive fractures.',
    chapters:[[0,'Guard fleet'],[36,'Outer armor'],[86,'Array corridor'],[135,'Reinforcements']],
    cruisers:[{ at:39, variant:'heavy' },{ at:92, variant:'heavy' }],
    mastery:{ name:'Clean sweep', detail:'Destroy the Dark Matter Array without taking hull damage during the final encounter.', condition:'cleanBoss' },
    veteran:{ waves:[[10.5,'counterwing',1],[50,'convoyWing',1],[83,'veilWing','flank'],[113,'pincer'],[153,'returnPatrol','flank']],
      terrain:[[57,'rail'],[111,'pull',.71],[145,'wall',3]] }
  }
];

export const FREE_MISSIONS = 5;
export const ACTS = [
  { id:1, name:'The Invasion' },
  { id:2, name:'The Empire’s Secret' },
  { id:3, name:'The Emperor’s Fall' }
];

export function buildCampaign(legacyStages) {
  return missions.map((mission, index) => extendMission({
    ...legacyStages.find((stage) => stage.id === mission.id),
    ...mission,
    number:index + 1,
    act:1 + Math.floor(index / FREE_MISSIONS)
  }));
}

function combineBeats(standard, remixed) {
  return [...(standard ?? []), ...remixed].sort((a, b) => a[0] - b[0]);
}

export function veteranRoute(stage) {
  return {
    ...stage,
    waves: combineBeats(stage.waves, stage.veteran.waves),
    terrain: combineBeats(stage.terrain, stage.veteran.terrain ?? []),
    cruisers: stage.veteran.cruisers ?? stage.cruisers
  };
}
