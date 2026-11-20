import { bossBody, coreBody, enemyBody, friendlyBody, hostileBody, moduleBody, railBody, pickupBody, pilotBody,
  pilotReceiver, vaneBody, wraithWingBody } from './collision.mjs';

function drawBody(ctx, { x, y, turn, scale, rects, dx, dy }, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.fillStyle = color + '48';
  ctx.strokeStyle = color + 'b8';
  ctx.lineWidth = .75;
  ctx.beginPath();
  for (const [left, top, right, bottom] of rects) {
    ctx.rect(left * scale, top * scale, (right - left) * scale, (bottom - top) * scale);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x, y);
  ctx.stroke();
}

export function drawHitboxes(ctx, flight) {
  ctx.save();
  drawBody(ctx, pilotReceiver(flight), '#a1ff73');
  drawBody(ctx, pilotBody(flight), flight.player.realm === 'ghost' ? '#c99eff' : '#ffffff');
  for (const enemy of flight.enemies) {
    if (enemy.hull <= 0 || enemy.loop || enemy.retreat) continue;
    drawBody(ctx, enemyBody(enemy), '#ff975a');
    if (enemy.vane > 0) drawBody(ctx, vaneBody(enemy), '#d48bff');
  }
  for (const ship of [flight.cruiser, flight.boss]) {
    if (!ship || ship.hull <= 0) continue;
    if (ship.kind === 'wraith') {
      drawBody(ctx, wraithWingBody(ship), '#ff975a');
      drawBody(ctx, coreBody(ship), '#fff88c');
    } else drawBody(ctx, bossBody(ship), '#ff975a');
    for (const part of ship.parts) if (part.hull > 0) drawBody(ctx, moduleBody(ship, part), '#fff88c');
  }
  for (const shot of flight.friendly) drawBody(ctx, friendlyBody(shot), '#75fff1');
  for (const shot of flight.hostile) drawBody(ctx, hostileBody(shot), (shot.realm ?? 'physical') === flight.player.realm ? '#ff5078' : '#887fc0');
  for (const drop of flight.pickups) drawBody(ctx, pickupBody(drop), '#a1ff73');
  for (const hazard of flight.hazards) {
    if (hazard.kind === 'rail' && hazard.triggered) drawBody(ctx, railBody(hazard), '#ff5078');
  }
  ctx.font = '12px monospace';
  ctx.fillStyle = '#edf8ff';
  ctx.fillText('Collision geometry', 8, 18);
  ctx.restore();
}
