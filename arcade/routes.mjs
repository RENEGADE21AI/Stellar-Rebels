export const innerRoute = [
  {
    id: 2, name: 'Asteroid Belt', region: 'Debris field', brief: 'Follow the openings through the belt.', accent: '#c39be9',
    environment: 'belt', boss: 'warden', bossAt: 152, first: 95, repeat: 21, defeatCap: 24,
    waves: [[1,'sweep'],[8,'cross'],[16,'break'],[24,'rake',1],[32,'sweep',1],[39,'cross',1],[47,'break',1],[54,'sweep'],[62,'hook'],[69,'break'],[76,'cross'],[83,'sweep',1],[90,'anvil'],[97,'break',1],[104,'sweep'],[111,'linked',1],[121,'break'],[129,'sweep',1],[136,'cross'],[142,'anvil',1]],
    drops: [[16,'power',.38],[38,'barrier',.61],[72,'repair',.50],[101,'power',.35],[138,'overdrive',.55]],
    terrain: [[34,2],[67,1],[92,3],[119,2]],
    mastery: { name: 'Thread the belt', detail: 'Beat Harrow without losing hull in the boss fight.', condition: 'cleanBoss' }
  },
  {
    id: 3, name: 'Relay Station', region: 'Relay defense', brief: 'Cut the links between the command ships.', accent: '#84e6d8',
    environment: 'relay', boss: 'matron', bossAt: 156, first: 112, repeat: 27, defeatCap: 27,
    waves: [[1,'escort'],[9,'trap',1],[17,'linked'],[26,'sweep'],[33,'escort',1],[41,'break'],[48,'trap'],[55,'escort'],[63,'surge',1],[72,'spear'],[78,'linked',1],[86,'trap'],[94,'sweep',1],[100,'escort',1],[107,'surge'],[115,'trap',1],[122,'linked'],[129,'break',1],[136,'escort'],[143,'surge',1]],
    drops: [[13,'barrier',.44],[31,'power',.63],[68,'repair',.47],[102,'overdrive',.54],[145,'overdrive',.42]],
    mastery: { name: 'Clean reception', detail: 'Beat the Relay Carrier without losing hull in the boss fight.', condition: 'cleanBoss' }
  }
];
