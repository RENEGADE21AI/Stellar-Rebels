const lessons = {
  steer: ['Steer your Fighter', 'Drag anywhere on the field or use the arrow keys.'],
  fire: ['Line up a shot', 'Move underneath the drone. Your guns fire automatically.'],
  shift: ['Ghost Shift', 'Tap Shift or press Space to phase through the incoming fire.'],
  complete: ['Ready to fly', 'Good hunting, pilot.']
};

function prompt(flight, step) {
  const [title, copy] = lessons[step];
  flight.message(copy, Infinity, 'training', title);
}

export function startTraining(flight) {
  flight.practice = true;
  flight.player.ghostEnergy = 0;
  prompt(flight, 'steer');
  return { step:'steer', x:flight.player.x, y:flight.player.y, nextThreat:0 };
}

export function advanceTraining(flight, training, events) {
  const p = flight.player;
  p.guard = Math.max(p.guard, 1.5);
  if (training.step === 'steer' && Math.hypot(p.x - training.x, p.y - training.y) >= 43) {
    training.step = 'fire';
    prompt(flight, 'fire');
  }
  if (training.step === 'fire') {
    if (events.some((e) => e.type === 'enemyDown')) {
      training.step = 'shift';
      p.ghostEnergy = 100;
      prompt(flight, 'shift');
    } else if (!flight.enemies.length && flight.elapsed >= training.nextThreat) {
      const x = p.x < 192 ? 260 : 110;
      flight.addEnemy({ kind:'scout', lane:x / 384, returns:false });
      const drone = flight.enemies.at(-1);
      Object.assign(drone, { y:Math.max(65, p.y - 220), fireTimer:30, hull:.7, pace:.48 });
      training.nextThreat = flight.elapsed + 3.6;
    }
  }
  if (training.step !== 'shift') return;
  if (events.some((e) => e.type === 'ghostStart')) {
    training.step = 'complete';
    prompt(flight, 'complete');
    return;
  }
  if (flight.elapsed >= training.nextThreat || !training.volley) {
    flight.fan(p.x, Math.max(70, p.y - 195), Math.PI / 2, 5, .14, 132, 'bolt');
    training.volley = true;
    training.nextThreat = flight.elapsed + 3;
  }
}
