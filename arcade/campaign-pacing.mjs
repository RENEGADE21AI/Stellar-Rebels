// The early route introduces each mission's pressure. These later chapters
// develop it through authored beats, using chapter-relative seconds so a
// section can be tuned without changing the timing of its individual attacks.
const laterChapters = {
  1: { encounterAt:245, chapters:[
    [125,'Defense ring',{
      waves:[[0,'screen',1],[7,'rake'],[16,'wingSweep',1],[24,'spear'],[33,'cross','flank'],
        [43,'rake',1],[50,'counterwing'],[59,'screen'],[65,'linked',1]],
      drops:[[8,'barrier',.43],[35,'repair',.56],[62,'power',.49]],
      veteran:[[13,'scissor',1],[41,'returnPatrol','flank']]
    }],
    [194,'Command screen',{
      waves:[[0,'hook',1],[8,'wingSweep'],[16,'pincer','flank'],[25,'watch',1],
        [32,'screen'],[38,'anvil','flank'],[44,'counterwing',1]],
      drops:[[17,'repair',.48],[40,'overdrive',.53]],
      veteran:[[12,'linked','flank'],[34,'railCover',1]]
    }]
  ] },
  7: { encounterAt:335, chapters:[
    [137,'Broken stations',{
      waves:[[0,'column',1],[6,'wingSweep','flank'],[14,'splitWing'],[22,'returnPatrol',1],[30,'hook'],[37,'scissor',1],
        [45,'screen','flank'],[52,'pincer',1],[60,'splitWing','flank']],
      terrain:[[9,'wall',1],[36,'wall',3],[58,'wall',2]],
      drops:[[8,'barrier',.52],[30,'repair',.36],[55,'power',.60]],
      veteran:[[12,'wreckGuard',1],[40,'scissor','flank']]
    }],
    [205,'Retreat funnel',{
      waves:[[0,'returnPatrol'],[7,'rake',1],[16,'scissor','flank'],[24,'watch'],[31,'returnPatrol',1],[38,'wingSweep'],
        [46,'counterwing',1],[54,'cross','flank'],[65,'pincer',1]],
      terrain:[[19,'wall',3],[51,'wall',1]],
      drops:[[12,'repair',.45],[44,'barrier',.62],[62,'overdrive',.36]],
      veteran:[[21,'returnPatrol',1],[59,'pincer','flank']]
    }],
    [279,'Intercept point',{
      waves:[[0,'counterwing'],[8,'wingSweep',1],[16,'scissor'],[25,'watch','flank'],[33,'returnPatrol',1],
        [41,'scissor','flank'],[49,'spear',1]],
      drops:[[15,'repair',.57],[40,'power',.42]], veteran:[[11,'counterwing',1],[37,'splitWing',1]]
    }]
  ] },
  2: { encounterAt:355, chapters:[
    [151,'Moving seams',{
      waves:[[0,'splitWing',1],[8,'sweep'],[16,'cross',1],[25,'scissor'],[33,'splitWing','flank'],[42,'pincer',1],
        [48,'sweep'],[57,'splitWing',1],[64,'wingSweep']],
      terrain:[[3,'wall',3],[21,'wall',1],[39,'wall',2],[61,'wall',3]],
      drops:[[10,'barrier',.58],[30,'repair',.46],[52,'power',.54]],
      veteran:[[11,'splitWing'],[44,'scissor','flank']]
    }],
    [224,'Rockfall',{
      waves:[[0,'screen',1],[7,'splitWing'],[14,'pincer',1],[22,'wingSweep'],[31,'cross','flank'],[40,'splitWing',1],
        [49,'sweep'],[57,'scissor',1],[64,'splitWing']],
      terrain:[[5,'wall',1],[23,'wall',2],[37,'wall',3],[56,'wall',2]],
      drops:[[11,'repair',.53],[32,'barrier',.35],[53,'power',.66]],
      veteran:[[19,'break',1],[60,'splitWing','flank']]
    }],
    [296,'Harrow’s ambush',{
      waves:[[0,'hook',1],[8,'splitWing','flank'],[17,'wingSweep'],[25,'scissor','flank'],[33,'sweep',1],
        [41,'pincer'],[50,'screen',1]],
      terrain:[[10,'wall',3],[34,'wall',1],[47,'wall',2]],
      drops:[[11,'repair',.50],[41,'overdrive',.48]], veteran:[[22,'splitWing',1],[39,'pincer']]
    }]
  ] },
  8: { encounterAt:368, chapters:[
    [151,'Decoy freight',{
      waves:[[0,'watch',1],[8,'returnPatrol','flank'],[15,'convoyWing',1],[24,'escort'],[31,'counterwing',1],
        [39,'spear'],[46,'freightScreen',1],[54,'scissor','flank'],[65,'wingSweep']],
      cruisers:[{ at:38, variant:'patrol' }],
      drops:[[10,'power',.49],[35,'repair',.54],[59,'barrier',.36]],
      veteran:[[12,'freightScreen','flank'],[55,'returnPatrol',1]]
    }],
    [224,'Supply corridor',{
      waves:[[0,'convoyWing'],[7,'freightScreen',1],[15,'returnPatrol'],[22,'escort',1],[30,'watch'],
        [38,'pincer','flank'],[45,'linked',1],[54,'freightScreen'],[63,'scissor',1],[70,'spear']],
      cruisers:[{ at:23, variant:'heavy' }],
      drops:[[17,'repair',.44],[46,'barrier',.53],[64,'power',.61]],
      veteran:[[12,'pincer','flank'],[60,'convoyWing',1]]
    }],
    [302,'Tender escort',{
      waves:[[0,'freightScreen'],[8,'watch',1],[15,'counterwing','flank'],[24,'linked'],[33,'escort',1],
        [40,'freightScreen',1],[47,'pincer','flank'],[56,'convoyWing']],
      drops:[[16,'repair',.58],[45,'overdrive',.41]], veteran:[[12,'returnPatrol','flank'],[42,'escort']]
    }]
  ] },
  3: { encounterAt:382, chapters:[
    [155,'Signal repeaters',{
      waves:[[0,'linked'],[10,'freightScreen',1],[16,'counterwing','flank'],[24,'escort'],[32,'watch',1],
        [41,'linked',1],[49,'scissor'],[58,'convoyWing',1],[67,'linked','flank']],
      drops:[[10,'power',.59],[32,'repair',.48],[62,'barrier',.36]], veteran:[[15,'escort','flank'],[45,'linked']]
    }],
    [231,'Command web',{
      waves:[[0,'trap',1],[7,'linked','flank'],[15,'pincer',1],[22,'freightScreen'],[30,'spear',1],
        [37,'linked'],[46,'escort',1],[54,'watch'],[62,'counterwing','flank'],[70,'linked',1]],
      drops:[[18,'repair',.58],[40,'barrier',.49],[64,'power',.38]],
      veteran:[[12,'linked',1],[51,'freightScreen','flank']]
    }],
    [308,'Uplink defense',{
      waves:[[0,'escort'],[9,'counterwing',1],[16,'linked'],[24,'wingSweep',1],[31,'freightScreen','flank'],
        [40,'trap',1],[49,'linked','flank'],[56,'scissor'],[66,'convoyWing',1]],
      drops:[[11,'power',.39],[34,'repair',.61],[60,'overdrive',.48]], veteran:[[19,'escort',1],[55,'linked']]
    }]
  ] },
  9: { encounterAt:388, chapters:[
    [150,'Outer pickets',{
      waves:[[0,'railCover',1],[7,'spear'],[17,'pincer','flank'],[24,'watch'],[31,'ladder',1],[42,'railCover'],
        [50,'returnPatrol',1],[60,'convoyWing','flank'],[69,'cross']],
      terrain:[[9,'rail'],[27,'rail'],[48,'rail'],[65,'rail']], cruisers:[{ at:34, variant:'heavy' }],
      drops:[[8,'power',.53],[26,'repair',.43],[61,'barrier',.60]], veteran:[[12,'railCover','flank'],[53,'scissor']]
    }],
    [228,'Blockade crossing',{
      waves:[[0,'wingSweep'],[8,'convoyWing',1],[16,'ladder'],[24,'pincer','flank'],[32,'railCover',1],
        [40,'trap'],[48,'counterwing',1],[57,'railCover','flank'],[65,'watch'],[72,'spear',1]],
      terrain:[[12,'rail'],[30,'rail'],[42,'rail'],[57,'rail'],[70,'rail']],
      drops:[[10,'repair',.38],[41,'power',.62],[63,'overdrive',.48]], veteran:[[14,'pincer',1],[60,'ladder',1]]
    }],
    [306,'Battery field',{
      waves:[[0,'railCover'],[7,'counterwing','flank'],[15,'pincer',1],[23,'convoyWing'],[30,'spear'],
        [40,'scissor',1],[49,'railCover','flank'],[57,'ladder'],[65,'linked',1],[72,'watch','flank']],
      terrain:[[23,'rail'],[52,'rail'],[68,'rail']], cruisers:[{ at:9, variant:'patrol' }],
      drops:[[17,'barrier',.37],[41,'repair',.63],[67,'overdrive',.50]], veteran:[[12,'convoyWing',1],[48,'railCover',1]]
    }]
  ] },
  4: { encounterAt:398, chapters:[
    [151,'Solar batteries',{
      waves:[[0,'ladder',1],[8,'railCover'],[16,'scissor','flank'],[26,'spear'],[35,'railCover',1],
        [44,'counterwing'],[53,'rake',1],[62,'ladder','flank'],[71,'pincer',1]],
      terrain:[[6,'rail'],[23,'rail'],[38,'rail'],[58,'rail'],[68,'rail']],
      drops:[[9,'power',.59],[35,'repair',.39],[63,'barrier',.51]], veteran:[[11,'railCover',1],[55,'pincer']]
    }],
    [232,'Crossing fire',{
      waves:[[0,'wingSweep'],[8,'watch',1],[16,'scissor'],[25,'railCover',1],[33,'anvil','flank'],
        [41,'pincer',1],[49,'linked'],[58,'ladder',1],[67,'railCover','flank'],[74,'break']],
      terrain:[[12,'rail'],[29,'rail'],[52,'rail'],[70,'rail']],
      drops:[[16,'barrier',.63],[36,'repair',.48],[65,'power',.37]], veteran:[[19,'railCover'],[54,'scissor','flank']]
    }],
    [312,'Narrow corridor',{
      waves:[[0,'railCover',1],[10,'ladder'],[18,'convoyWing',1],[27,'wingSweep'],[35,'counterwing','flank'],
        [44,'scissor',1],[53,'railCover'],[62,'pincer','flank'],[70,'ladder',1],[78,'spear']],
      terrain:[[14,'rail'],[25,'rail'],[41,'rail'],[61,'rail'],[77,'rail']],
      drops:[[18,'barrier',.47],[43,'repair',.57],[71,'overdrive',.42]], veteran:[[13,'ladder','flank'],[55,'railCover',1]]
    }]
  ] },
  10: { encounterAt:410, chapters:[
    [142,'Silent shipyards',{
      waves:[[0,'wreckGuard'],[8,'splitWing','flank'],[17,'scissor',1],[26,'pincer'],[36,'wingSweep',1],
        [44,'wreckGuard','flank'],[53,'returnPatrol'],[62,'splitWing',1],[71,'voidPatrol']],
      terrain:[[5,'wall',2],[19,'pull',.71],[31,'wall',3],[48,'pull',.29],[66,'wall',1]],
      drops:[[12,'barrier',.40],[31,'repair',.59],[64,'power',.47]],
      veteran:[[20,'wreckGuard',1],[54,'scissor','flank']]
    }],
    [225,'Debris current',{
      waves:[[0,'wingSweep'],[8,'splitWing',1],[18,'voidPatrol','flank'],[27,'pincer',1],
        [36,'wreckGuard'],[45,'scissor','flank'],[53,'splitWing',1],[62,'counterwing'],[71,'voidPatrol',1],[80,'sweep']],
      terrain:[[5,'pull',.25],[16,'wall',3],[28,'pull',.66],[42,'wall',1],[58,'pull',.52],[74,'wall',2]],
      drops:[[8,'repair',.55],[38,'power',.43],[70,'barrier',.60]],
      veteran:[[14,'splitWing','flank'],[55,'voidPatrol']]
    }],
    [313,'Extraction platform',{
      waves:[[0,'wreckGuard',1],[8,'pincer','flank'],[16,'voidPatrol'],[25,'splitWing'],[33,'counterwing',1],
        [42,'wingSweep'],[51,'wreckGuard','flank'],[60,'scissor',1],[68,'splitWing','flank'],[77,'voidPatrol'],[86,'watch',1]],
      terrain:[[10,'wall',1],[24,'pull',.70],[40,'wall',3],[52,'pull',.30],[76,'wall',2]],
      drops:[[13,'power',.48],[39,'repair',.57],[78,'overdrive',.42]], veteran:[[29,'voidPatrol',1],[70,'pincer','flank']]
    }]
  ] },
  11: { encounterAt:420, chapters:[
    [145,'Signal mirages',{
      waves:[[0,'voidPatrol'],[8,'veilWing',1],[17,'screen','flank'],[25,'ghostEscort',1],[32,'specters'],
        [41,'pincer',1],[50,'voidPatrol','flank'],[58,'veilWing'],[67,'wingSweep',1],[75,'ghostEscort']],
      terrain:[[32,'pull',.70],[69,'pull',.26]],
      drops:[[12,'barrier',.60],[37,'repair',.48],[70,'power',.37]],
      veteran:[[14,'ghostEscort'],[52,'veilWing','flank']]
    }],
    [228,'Spectral relay',{
      waves:[[0,'specters'],[9,'ghostEscort',1],[17,'wingSweep'],[25,'voidPatrol',1],[34,'veilWing','flank'],
        [43,'counterwing'],[52,'ghostEscort','flank'],[63,'voidPatrol'],[71,'veilWing',1],[80,'watch']],
      terrain:[[8,'pull',.32],[38,'pull',.66],[72,'pull',.50]],
      drops:[[9,'power',.53],[38,'repair',.44],[73,'barrier',.63]],
      veteran:[[22,'voidPatrol','flank'],[76,'ghostEscort',1]]
    }],
    [318,'The beacon',{
      waves:[[0,'ghostEscort'],[8,'scissor',1],[16,'veilWing'],[26,'voidPatrol','flank'],[36,'ghostEscort',1],
        [45,'specters',1],[54,'pincer'],[64,'veilWing','flank'],[73,'ghostEscort'],[82,'voidPatrol',1],[91,'watch','flank']],
      terrain:[[26,'pull',.70],[53,'pull',.31],[79,'pull',.55]],
      drops:[[13,'repair',.57],[53,'power',.39],[80,'overdrive',.49]], veteran:[[20,'veilWing',1],[69,'ghostEscort','flank']]
    }]
  ] },
  12: { encounterAt:427, chapters:[
    [150,'Containment corridor',{
      waves:[[0,'voidPatrol',1],[8,'wingSweep'],[17,'wreckGuard','flank'],[25,'pincer',1],[32,'veilWing'],
        [40,'scissor'],[51,'ghostEscort',1],[60,'splitWing'],[70,'voidPatrol','flank'],[77,'watch']],
      terrain:[[6,'pull',.27],[20,'wall',3],[36,'pull',.64],[56,'wall',1],[73,'pull',.48]],
      drops:[[11,'barrier',.40],[36,'repair',.60],[65,'power',.50]], veteran:[[21,'voidPatrol'],[58,'splitWing','flank']]
    }],
    [237,'Shear lanes',{
      waves:[[0,'wingSweep',1],[8,'pincer','flank'],[16,'voidPatrol'],[25,'veilWing',1],[34,'counterwing'],[43,'scissor','flank'],
        [53,'wreckGuard'],[61,'pincer',1],[69,'voidPatrol',1],[78,'sweep']],
      terrain:[[4,'wall',2],[19,'pull',.71],[30,'wall',3],[49,'pull',.28],[61,'wall',1],[76,'pull',.62]],
      drops:[[12,'repair',.53],[39,'barrier',.47],[70,'power',.61]], veteran:[[29,'ghostEscort','flank'],[73,'wreckGuard',1]]
    }],
    [325,'Stabilization array',{
      waves:[[0,'watch'],[8,'voidPatrol',1],[16,'splitWing','flank'],[26,'counterwing'],[34,'ghostEscort',1],[43,'pincer'],
        [51,'wingSweep',1],[60,'voidPatrol','flank'],[70,'veilWing'],[79,'wreckGuard',1],[90,'watch','flank']],
      terrain:[[14,'pull',.33],[31,'wall',3],[52,'pull',.67],[67,'wall',1],[86,'pull',.44]],
      drops:[[14,'power',.39],[49,'repair',.58],[83,'overdrive',.47]], veteran:[[20,'pincer','flank'],[64,'voidPatrol',1]]
    }]
  ] },
  13: { encounterAt:434, chapters:[
    [154,'Second fleet line',{
      waves:[[0,'freightScreen',1],[8,'ladder'],[15,'returnPatrol','flank'],[24,'pincer',1],[34,'railCover'],
        [44,'scissor',1],[51,'counterwing'],[60,'watch','flank'],[69,'convoyWing',1],[78,'wingSweep']],
      cruisers:[{ at:24, variant:'patrol' }], terrain:[[48,'rail'],[72,'rail']],
      drops:[[12,'power',.62],[38,'repair',.43],[70,'barrier',.54]], veteran:[[19,'freightScreen','flank'],[56,'returnPatrol',1]]
    }],
    [242,'Carriers in formation',{
      waves:[[0,'linked'],[8,'railCover',1],[17,'convoyWing','flank'],[25,'watch',1],[35,'ladder'],[44,'counterwing','flank'],
        [52,'freightScreen'],[60,'pincer',1],[69,'linked','flank'],[78,'railCover',1],[86,'returnPatrol']],
      cruisers:[{ at:35, variant:'heavy' }], terrain:[[20,'rail'],[59,'rail'],[81,'rail']],
      drops:[[15,'repair',.57],[48,'power',.37],[76,'barrier',.64]], veteran:[[20,'railCover'],[64,'counterwing',1]]
    }],
    [337,'Vanguard screen',{
      waves:[[0,'convoyWing'],[8,'freightScreen',1],[17,'scissor','flank'],[26,'railCover'],[35,'ladder',1],
        [45,'pincer','flank'],[54,'counterwing',1],[62,'watch'],[73,'convoyWing','flank'],[82,'returnPatrol'],[89,'ladder',1]],
      terrain:[[29,'rail'],[54,'rail'],[86,'rail']],
      drops:[[14,'barrier',.37],[38,'repair',.54],[80,'overdrive',.63]], veteran:[[22,'linked','flank'],[79,'convoyWing',1]]
    }]
  ] },
  5: { encounterAt:446, chapters:[
    [153,'Veil patrols',{
      waves:[[0,'voidPatrol',1],[8,'ghostEscort'],[17,'scissor','flank'],[27,'veilWing',1],[36,'watch'],[44,'specters',1],
        [52,'wingSweep'],[62,'ghostEscort','flank'],[71,'pincer',1],[81,'voidPatrol']],
      terrain:[[18,'pull',.70],[49,'pull',.25],[78,'pull',.54]],
      drops:[[13,'power',.62],[41,'repair',.45],[73,'barrier',.49]], veteran:[[13,'ghostEscort','flank'],[56,'veilWing',1]]
    }],
    [245,'Unstable orbit',{
      waves:[[0,'ghostEscort',1],[8,'pincer'],[17,'voidPatrol','flank'],[26,'wreckGuard'],[35,'veilWing',1],[44,'scissor','flank'],
        [53,'ghostEscort'],[62,'wingSweep',1],[71,'voidPatrol'],[80,'veilWing','flank'],[89,'specters',1]],
      terrain:[[11,'wall',1],[28,'pull',.63],[46,'pull',.27],[68,'wall',3],[86,'pull',.68]],
      drops:[[15,'repair',.50],[43,'power',.61],[78,'barrier',.38]], veteran:[[21,'voidPatrol',1],[60,'wreckGuard','flank']]
    }],
    [344,'The Wraith’s trail',{
      waves:[[0,'voidPatrol'],[9,'ghostEscort',1],[18,'veilWing','flank'],[27,'watch'],[34,'scissor',1],[44,'specters','flank'],
        [53,'ghostEscort'],[62,'pincer',1],[71,'veilWing'],[80,'ghostEscort','flank'],[92,'specters']],
      terrain:[[15,'pull',.25],[42,'pull',.73],[74,'pull',.49]],
      drops:[[13,'power',.41],[47,'repair',.58],[82,'overdrive',.51]], veteran:[[23,'veilWing',1],[76,'ghostEscort']]
    }]
  ] },
  14: { encounterAt:462, chapters:[
    [157,'Outer nodes',{
      waves:[[0,'linked',1],[9,'freightScreen'],[18,'railCover','flank'],[27,'convoyWing',1],[36,'counterwing'],[45,'linked'],
        [53,'watch',1],[62,'pincer','flank'],[71,'freightScreen',1],[80,'returnPatrol'],[89,'ladder']],
      terrain:[[21,'rail'],[57,'rail'],[80,'rail']], cruisers:[{ at:38, variant:'heavy' }],
      drops:[[15,'power',.61],[43,'repair',.52],[76,'barrier',.40]], veteran:[[12,'linked','flank'],[63,'railCover',1]]
    }],
    [254,'Shield crossfire',{
      waves:[[0,'railCover'],[9,'linked','flank'],[18,'freightScreen',1],[28,'convoyWing'],[37,'scissor',1],
        [46,'counterwing','flank'],[55,'linked',1],[64,'pincer'],[73,'railCover',1],[82,'escort'],[91,'watch','flank']],
      terrain:[[10,'rail'],[32,'rail'],[70,'rail'],[86,'rail']], cruisers:[{ at:29, variant:'patrol' }],
      drops:[[12,'barrier',.53],[48,'repair',.41],[80,'power',.63]], veteran:[[24,'counterwing',1],[79,'freightScreen']]
    }],
    [354,'Defense command',{
      waves:[[0,'convoyWing',1],[9,'linked'],[18,'scissor','flank'],[27,'railCover',1],[37,'freightScreen'],[46,'pincer',1],
        [55,'linked','flank'],[64,'counterwing'],[73,'convoyWing',1],[82,'railCover','flank'],[91,'linked'],[99,'watch',1]],
      terrain:[[11,'rail'],[34,'rail'],[65,'rail'],[93,'rail']],
      drops:[[14,'power',.49],[46,'repair',.59],[88,'overdrive',.41]], veteran:[[22,'linked','flank'],[84,'railCover',1]]
    }]
  ] },
  15: { encounterAt:474, chapters:[
    [151,'First stabilizer arm',{
      waves:[[0,'voidPatrol'],[9,'railCover',1],[18,'ghostEscort','flank'],[26,'splitWing'],[35,'watch',1],
        [44,'wreckGuard'],[52,'pincer','flank'],[63,'scissor',1],[72,'veilWing'],[81,'voidPatrol',1],[90,'railCover']],
      terrain:[[14,'pull',.29],[31,'wall',3],[48,'rail'],[60,'pull',.70],[84,'wall',1]],
      drops:[[13,'barrier',.59],[46,'repair',.41],[83,'power',.52]], veteran:[[21,'voidPatrol',1],[69,'railCover','flank']]
    }],
    [249,'Array disturbance',{
      waves:[[0,'scissor'],[9,'voidPatrol',1],[17,'veilWing','flank'],[27,'splitWing',1],[36,'railCover'],[45,'ghostEscort','flank'],
        [54,'wreckGuard',1],[63,'counterwing'],[72,'voidPatrol','flank'],[81,'pincer'],[89,'railCover',1],[99,'scissor']],
      terrain:[[10,'wall',2],[26,'pull',.68],[42,'rail'],[54,'wall',3],[73,'pull',.27],[94,'wall',1]],
      drops:[[15,'repair',.55],[49,'power',.38],[89,'barrier',.62]], veteran:[[22,'wreckGuard','flank'],[69,'voidPatrol',1]]
    }],
    [358,'Last stabilizer arm',{
      waves:[[0,'ghostEscort'],[9,'railCover','flank'],[18,'voidPatrol',1],[28,'pincer','flank'],[38,'counterwing'],
        [48,'veilWing',1],[58,'wreckGuard'],[68,'railCover',1],[78,'scissor'],[88,'voidPatrol','flank'],[98,'ghostEscort'],[107,'watch',1]],
      terrain:[[9,'pull',.26],[27,'wall',3],[45,'rail'],[57,'pull',.74],[77,'wall',2],[101,'wall',1]],
      drops:[[16,'barrier',.40],[51,'repair',.63],[99,'overdrive',.50]], veteran:[[24,'railCover',1],[80,'ghostEscort','flank']]
    }]
  ] },
  6: { encounterAt:500, chapters:[
    [158,'The Emperor’s guard',{
      waves:[[0,'convoyWing'],[9,'railCover',1],[17,'returnPatrol','flank'],[26,'freightScreen'],[36,'counterwing',1],
        [46,'pincer'],[56,'scissor','flank'],[66,'linked',1],[75,'railCover'],[84,'convoyWing',1],[94,'watch']],
      terrain:[[19,'rail'],[41,'wall',1],[72,'rail'],[90,'wall',2]], cruisers:[{ at:31, variant:'heavy' }],
      drops:[[14,'power',.59],[43,'repair',.41],[87,'barrier',.53]], veteran:[[23,'voidPatrol','flank'],[77,'convoyWing',1]]
    }],
    [260,'Gravity wake',{
      waves:[[0,'voidPatrol'],[10,'railCover','flank'],[20,'pincer',1],[29,'ghostEscort'],[39,'freightScreen',1],
        [49,'scissor'],[59,'veilWing','flank'],[69,'railCover'],[79,'wreckGuard',1],[89,'convoyWing'],[99,'counterwing',1]],
      terrain:[[12,'pull',.68],[34,'wall',3],[50,'rail'],[63,'pull',.26],[81,'wall',1],[98,'rail']],
      drops:[[16,'barrier',.49],[51,'repair',.62],[92,'power',.40]], veteran:[[24,'ghostEscort','flank'],[72,'railCover',1]]
    }],
    [368,'Flagship perimeter',{
      waves:[[0,'convoyWing',1],[10,'freightScreen'],[20,'railCover','flank'],[30,'linked'],[40,'scissor',1],
        [50,'voidPatrol','flank'],[60,'pincer'],[70,'counterwing',1],[79,'railCover'],[88,'convoyWing','flank']],
      terrain:[[11,'rail'],[36,'wall',2],[57,'pull',.69],[75,'rail']], cruisers:[{ at:28, variant:'heavy' }],
      drops:[[14,'power',.61],[54,'repair',.40],[84,'barrier',.54]], veteran:[[24,'convoyWing',1],[72,'railCover','flank']]
    }],
    [465,'Last firing line',{
      waves:[[0,'watch'],[8,'railCover',1],[16,'freightScreen','flank'],[24,'pincer'],[29,'spear',1]],
      terrain:[[6,'rail'],[21,'wall',1]], drops:[[1,'repair',.55],[21,'overdrive',.51]], veteran:[[12,'counterwing','flank']]
    }]
  ] }
};

function extendBeats(beats, additions) {
  return [...(beats ?? []), ...additions].sort((a, b) => a[0] - b[0]);
}

function offsetBeats(chapters, type) {
  return chapters.flatMap(([start, , data]) => (data[type] ?? []).map(([at, ...beat]) => [at + start, ...beat]));
}

export function extendMission(stage) {
  const extension = laterChapters[stage.id];
  if (!extension) return stage;
  const { encounterAt, chapters } = extension;
  const cruisers = chapters.flatMap(([start, , data]) => (data.cruisers ?? []).map((entry) => ({ ...entry, at:start + entry.at })));
  return {
    ...stage,
    bossAt:encounterAt,
    chapters:[...stage.chapters, ...chapters.map(([start, title]) => [start, title])],
    waves:extendBeats(stage.waves, offsetBeats(chapters, 'waves')),
    drops:extendBeats(stage.drops, offsetBeats(chapters, 'drops')),
    terrain:extendBeats(stage.terrain, offsetBeats(chapters, 'terrain')),
    cruisers:[...(stage.cruisers ?? []), ...cruisers],
    veteran:{
      ...stage.veteran,
      waves:extendBeats(stage.veteran.waves, offsetBeats(chapters, 'veteran')),
      cruisers:stage.veteran.cruisers ? [...stage.veteran.cruisers, ...cruisers] : undefined
    }
  };
}
