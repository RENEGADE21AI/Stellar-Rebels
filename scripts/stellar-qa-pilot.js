// Shared steering strategy for black-box browser input and the model balance test.
// The strategy reads the current flight and returns only a point to steer toward.
function chooseFlightPath(f, bounds, useSupplies = false) {
  function proximitySquared(dx, dy, vx, vy, span) {
    const velocity = vx * vx + vy * vy;
    const time = velocity ? Math.max(0, Math.min(span, -(dx * vx + dy * vy) / velocity)) : 0;
    return (dx + vx * time) ** 2 + (dy + vy * time) ** 2;
  }
  function routeRisk(player, ship, target, threat) {
    const travel = Math.hypot(target.x - player.x, target.y - player.y);
    const moving = Math.min(.88, travel / ship.speed);
    const ux = travel > .1 ? (target.x - player.x) * ship.speed / travel : 0;
    const uy = travel > .1 ? (target.y - player.y) * ship.speed / travel : 0;
    let distance = proximitySquared(player.x - threat.x, player.y - threat.y, ux - threat.vx, uy - threat.vy, moving);
    if (moving < .88) {
      distance = Math.min(distance, proximitySquared(target.x - threat.x - moving * threat.vx,
        target.y - threat.y - moving * threat.vy, -threat.vx, -threat.vy, .88 - moving));
    }
    const padding = threat.radius + ship.hit + 7;
    return distance < padding * padding ? 15 + (padding - Math.sqrt(distance)) * 20 : 0;
  }
  const p = f.player;
  const b = f.boss;
  const cruiser = f.cruiser;
  const activeHull = b ?? cruiser;
  const velocity = f.run.ship === 'needle' ? 782 : 685;
  const timeToTarget = (p.y - (activeHull?.y ?? 120)) / velocity;
  const rootX = b ? 192 + b.spec.motion * Math.sin(Math.max(0, b.age + timeToTarget - b.entryTime) * .78)
    : cruiser ? cruiser.x + cruiser.speed * timeToTarget : 192;
  const module = activeHull?.parts.filter((part) => part.hull > 0 && (b || rootX + part.dx > 25 && rootX + part.dx < 359))
    .sort((a, c) => Math.abs(rootX + a.dx - p.x) - Math.abs(rootX + c.dx - p.x))[0];
  const priority = (e) => Math.abs(e.x - p.x) - (e.vane > 0 ? 105 : e.kind === 'relay' ? 53 : 0);
  const enemy = f.enemies.filter((e) => !e.retreat && e.y > 18 && e.y < p.y - 38).sort((a,c) => priority(a) - priority(c))[0];
  let targetX = b || module ? rootX + (module?.dx ?? 0) : enemy ? enemy.x + (enemy.vane > 0 ? enemy.side * 30 : 0) : 192;
  if (f.run.ship === 'bastion' && (module || enemy && !b)) {
    const aimY = module ? activeHull.y + module.dy : enemy.y;
    const inside = 10 + Math.tan(Math.abs(f.ship.guns[1][2])) * Math.max(0, p.y - aimY - 13);
    targetX += p.x < targetX ? -inside : inside;
  }
  const pickup = f.pickups.find((d) => Math.abs(p.y - d.y) < (useSupplies ? 110 : 65) &&
    (d.kind === 'repair' ? p.hull < p.maxHull - 1 : useSupplies));
  if (pickup) targetX = pickup.x;

  const rails = f.hazards.filter((w) => w.kind === 'rail' && w.age > w.windup - .34);
  const optionsX = [p.x, targetX, ...Array.from({ length:22 }, (_,i) => bounds.left + 15 + i * 15.2)];
  const optionsY = [p.y, 530, 599, 668, 710];
  if (pickup && useSupplies) optionsY.push(Math.max(bounds.top, Math.min(bounds.bottom, pickup.y + 24)));
  const divers = f.enemies.filter((e) => e.dive && e.hull > 0).map((e) => ({
    x:e.x, y:e.y, vx:Math.cos(e.vector) * 225, vy:Math.max(.55, Math.sin(e.vector)) * 225, radius:e.spec.hit
  }));
  const threats = [...f.hostile, ...divers];
  let best;
  for (const rawX of optionsX) {
    const x = Math.min(bounds.right - 4, Math.max(bounds.left + 4, rawX));
    for (const y of optionsY) {
      const target = { x, y };
      const travel = Math.hypot(x - p.x, y - p.y);
      let cost = Math.abs(x - targetX) * .29 + travel * .20 + Math.abs(y - (pickup?.y ?? 594)) * .07;
      if (rails.some((w) => Math.abs(x - w.x) < w.width / 2 + f.ship.hit + 6)) cost += 180;
      for (const s of threats) {
        if (s.y > Math.max(p.y, y) + 22 || s.y + s.vy * 1.08 < Math.min(p.y, y) - 34) continue;
        cost += routeRisk(p, f.ship, target, s);
      }
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  }
  return best;
}

module.exports = { chooseFlightPath };
