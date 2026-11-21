export const innerRoute = [
  {
    id: 2, name: 'Asteroid Belt', region: 'Debris field', brief: 'Follow the openings through the belt.', accent: '#c39be9',
    environment: 'belt', boss: 'warden', bossAt: 152, first: 95, repeat: 21, defeatCap: 24,
    chapters: [[0,'Belt approach'],[34,'Debris lanes'],[67,'Inner belt'],[119,'Last crossing']],
    waves: [[1,'sweep'],[8,'cross'],[14,'break'],[22,'splitWing'],[29,'sweep',1],[40,'cross',1],[46,'break',1],[55,'sweep'],[60,'hook','flank'],[70,'break'],[78,'cross'],[83,'sweep',1],[94,'anvil'],[100,'splitWing',1],[104,'sweep'],[111,'linked',1],[122,'break','flank'],[130,'sweep',1],[137,'cross'],[144,'anvil','flank']],
    drops: [[16,'power',.38],[38,'barrier',.61],[72,'repair',.50],[101,'power',.35],[138,'overdrive',.55]],
    terrain: [[34,'wall',2],[67,'wall',1],[92,'wall',3],[119,'wall',2]],
    mastery: { name: 'Thread the belt', detail: 'Beat Harrow without losing hull in the boss fight.', condition: 'cleanBoss' }
  },
  {
    id: 3, name: 'Relay Station', region: 'Relay defense', brief: 'Destroy the Command Ship to expose its escorts.', accent: '#84e6d8',
    environment: 'relay', boss: 'matron', bossAt: 156, first: 112, repeat: 27, defeatCap: 27,
    chapters: [[0,'Escort screen'],[48,'Command wings'],[121,'Relay approach']],
    waves: [[1,'escort'],[10,'trap',1],[18,'linked'],[24,'column'],[31,'escort',1],[40,'break'],[48,'trap','flank'],[53,'escort'],[62,'surge',1],[73,'spear'],[78,'linked',1],[87,'trap','flank'],[94,'sweep',1],[102,'escort',1],[108,'surge'],[118,'trap','flank'],[123,'linked'],[129,'break',1],[138,'escort'],[145,'surge',1]],
    drops: [[13,'barrier',.44],[31,'power',.63],[68,'repair',.47],[102,'overdrive',.54],[145,'overdrive',.42]],
    mastery: { name: 'Clean reception', detail: 'Beat the Relay Carrier without losing hull in the boss fight.', condition: 'cleanBoss' }
  }
];

export const outerRoute = [
  {
    id: 4, name: 'Red Sun', region: 'Solar approach', brief: 'Draw the rail lock away from your firing lane.', accent: '#ff9b72',
    environment: 'sun', boss: 'tyrant', bossAt: 152, first: 132, repeat: 33, defeatCap: 31,
    chapters: [[0,'Solar approach'],[45,'Rail corridor'],[98,'Fleet line']],
    waves: [[1,'anvil'],[8,'ladder'],[16,'sweep'],[23,'ladder',1],[30,'break'],[38,'spear'],[45,'trap'],[53,'ladder','flank'],[60,'escort'],[67,'cross',1],[75,'ladder',1],[82,'anvil',1],[90,'break',1],[98,'trap'],[105,'ladder','flank'],[112,'surge'],[120,'cross'],[126,'anvil','flank'],[133,'ladder',1],[140,'spear']],
    drops: [[18,'power',.57],[45,'barrier',.61],[78,'repair',.38],[112,'power',.34],[141,'overdrive',.58]],
    terrain: [[45,'rail'],[77,'rail'],[111,'rail'],[135,'rail']],
    mastery: { name: 'Outside the line', detail: 'Beat the Rail Ship without losing hull in the boss fight.', condition: 'cleanBoss' }
  },
  {
    id: 5, name: 'Outer Orbit', region: 'Gravity well', brief: 'Phantom fire comes from both sides of the veil.', accent: '#c0a9ff',
    environment: 'outer', boss: 'wraith', bossAt: 154, first: 155, repeat: 40, defeatCap: 35,
    chapters: [[0,'Phantom patrol'],[36,'Gravity lanes'],[93,'Outer rings']],
    waves: [[1,'specters'],[8,'cross'],[16,'pinch'],[24,'escort',1],[31,'specters',1],[39,'pinch',1],[47,'sweep',1],[54,'trap','flank'],[62,'break'],[70,'specters','flank'],[77,'linked'],[85,'cross'],[93,'sweep'],[100,'pinch',1],[107,'escort'],[114,'trap','flank'],[123,'specters',1],[131,'ladder',1],[138,'pinch'],[145,'break',1]],
    drops: [[15,'power',.64],[47,'barrier',.33],[73,'repair',.48],[101,'overdrive',.65],[141,'overdrive',.44]],
    terrain: [[36,'pull',.27],[65,'pull',.68],[92,'pull',.48],[124,'pull',.22]],
    mastery: { key: 'wraith', name: 'Through the veil', detail: 'Beat the Wraith without losing hull in the boss fight.', condition: 'cleanBoss' }
  },
  {
    id: 6, name: 'The Flagship', region: 'Fleet center', brief: 'Break through the fleet and disable its flagship.', accent: '#ffb67d',
    environment: 'flagship', boss: 'crown', bossAt: 158, first: 185, repeat: 48, defeatCap: 40,
    chapters: [[0,'Fleet approach'],[35,'Outer defense'],[89,'Inner defense'],[128,'Final assault']],
    waves: [[1,'surge'],[8,'ladder'],[16,'linked'],[23,'escort',1],[30,'pinch'],[38,'anvil',1],[45,'surge',1],[53,'cross'],[61,'trap','flank'],[67,'ladder',1],[75,'pinch',1],[82,'break'],[89,'linked',1],[97,'surge','flank'],[104,'escort'],[112,'trap','flank'],[120,'pinch'],[128,'ladder'],[135,'sweep'],[141,'surge',1],[149,'escort',1]],
    drops: [[14,'barrier',.42],[34,'power',.66],[66,'repair',.48],[93,'power',.32],[116,'barrier',.65],[145,'overdrive',.47]],
    terrain: [[35,'wall',2],[66,'rail'],[104,'wall',3],[128,'rail']],
    mastery: { name: 'Clean sweep', detail: 'Beat the Flagship without losing hull in the boss fight.', condition: 'cleanBoss' }
  }
];
