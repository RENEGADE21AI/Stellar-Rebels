export const cruiseSpeed = 132;

// All speeds are in simulation units per second along the flight route.
const stationKinds = new Set(['siphon','bulwark','scavenger','beacon','citadel','stabilizer','gridControl','signalPost']);

export function flightApproach(kind, distance) {
  const fixed = stationKinds.has(kind);
  const speed = fixed ? 0 : kind === 'emperor' ? 27 : kind === 'wraith' ? 46 : 37;
  const minimum = kind === 'emperor' ? 5.25 : 2.7;
  return { fixed, speed, entryTime:Math.max(minimum, distance / (cruiseSpeed - speed)) };
}

export function pursuitPosition(boss, elapsed) {
  const fraction = Math.min(1, elapsed / boss.entryTime);
  const progress = fraction + fraction ** 2 - fraction ** 3;
  const afterCatch = Math.max(0, elapsed - boss.entryTime);
  const surge = boss.approach.fixed ? 0 : (boss.kind === 'emperor' ? 21 : 13) * Math.sin(afterCatch * .58) ** 2;
  return boss.entryY + (boss.arrivalY - boss.entryY) * progress - surge;
}
