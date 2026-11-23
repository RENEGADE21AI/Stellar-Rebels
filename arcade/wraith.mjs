export const PHYSICAL = 'physical';
export const SPECTRAL = 'ghost';
export const WRAITH_ARMOR = [[-74, -5], [-48, 0], [48, 0], [74, -5]];
export const WRAITH_EMITTER = 26;
export const otherRealm = (realm) => realm === PHYSICAL ? SPECTRAL : PHYSICAL;
export const realmTint = (realm) => realm === SPECTRAL ? '#d3b6ff' : '#ffb887';
export const realmLabel = (realm) => realm === SPECTRAL ? 'Ghost' : 'Physical';

export function enterWraith(flight, boss) {
  flight.player.ghostTime = 0;
  flight.player.specialTime = 0;
  flight.player.ghostRecovery = 0;
  flight.player.realm = PHYSICAL;
  Object.assign(boss, { realm: PHYSICAL, shiftAt: 8.6, shifting: false, charge: null, timer: 2.95 });
}

function wraithFan(flight, boss, y, direction, realm, count, spacing, speed) {
  flight.fan(boss.x, y, direction, count, spacing, speed, realm === SPECTRAL ? 'specter' : 'orb', { realm });
}

export function advanceWraith(flight, boss, dt) {
  if (boss.age < boss.entryTime) return;
  const enraged = boss.hull <= boss.spec.hull * .47;
  if (!boss.shifting && boss.age >= boss.shiftAt - 1.06) {
    boss.shifting = true;
    flight.signal('realmWarning', boss.x, boss.y, otherRealm(boss.realm));
  }
  if (boss.age >= boss.shiftAt) {
    boss.realm = otherRealm(boss.realm);
    boss.shiftAt += enraged ? 6.7 : 8.1;
    boss.shifting = false;
    flight.signal('wraithShift', boss.x, boss.y, boss.realm);
  }

  const y = boss.y + WRAITH_EMITTER;
  if (boss.charge) {
    const charge = boss.charge;
    if (boss.age < charge.fireAt) return;
    wraithFan(flight, boss, y, charge.aim, charge.realm, enraged ? 7 : 5, .19, enraged ? 235 : 213);
    wraithFan(flight, boss, y, Math.PI / 2 + .14, otherRealm(charge.realm), 4, .25, 154);
    boss.charge = null;
    boss.timer = enraged ? 1.53 : 1.95;
    flight.signal('wraithVolley', boss.x, y, charge.realm);
    return;
  }
  boss.timer -= dt;
  if (boss.timer > 0) return;
  boss.attack++;
  if (boss.attack % 3 === 0) {
    boss.charge = { realm: flight.player.realm, aim: flight.angleToPilot(boss.x, y), fireAt: boss.age + 1.04 };
    flight.signal('realmWarning', boss.x, y, boss.charge.realm);
    flight.message(`${realmLabel(boss.charge.realm)} fire. ${flight.shiftReady ? 'Dodge or Hop.' : 'Dodge.'}`, 1.65, 'warning');
    return;
  }
  const side = boss.attack % 2 ? -1 : 1;
  wraithFan(flight, boss, y, Math.PI / 2 + side * .27, boss.realm, enraged ? 7 : 6, .17, enraged ? 175 : 149);
  wraithFan(flight, boss, y, flight.angleToPilot(boss.x, y) - side * .14, otherRealm(boss.realm), enraged ? 5 : 3, .235, enraged ? 183 : 158);
  boss.timer = enraged ? 1.66 : 2.04;
  flight.signal('wraithVolley', boss.x, y, boss.realm);
}
