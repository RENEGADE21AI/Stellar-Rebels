import { GHOST } from './catalog.mjs';

const lessons = {
  steer: ['Steer your Fighter', 'Drag anywhere on the field or use the arrow keys.'],
  fire: ['Line up a shot', 'Move underneath the drone. Your guns fire automatically.'],
  shift: ['Ghost Shift', 'Stay in the shot’s path and wait for the cue.'],
  cue: ['Shift now', 'Tap Shift or press Space to phase through the shot.'],
  retry: ['Try again', 'Shift when the shot is close to your Fighter.'],
  complete: ['Ready to fly', 'Good hunting, pilot.']
};

function prompt(flight, step) {
  const [title, copy] = lessons[step];
  flight.message(copy, Infinity, 'training', title);
}

export function startTraining(flight, drill = 'basics') {
  flight.practice = true;
  flight.player.ghostEnergy = 0;
  const step = drill === 'shift' ? 'shift' : 'steer';
  prompt(flight, step);
  return { step, drill, x:flight.player.x, y:flight.player.y, nextThreat:0 };
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
      training.nextThreat = flight.elapsed;
    } else if (!flight.enemies.length && flight.elapsed >= training.nextThreat) {
      const x = p.x < 192 ? 260 : 110;
      flight.addEnemy({ kind:'scout', lane:x / 384, returns:false });
      const drone = flight.enemies.at(-1);
      Object.assign(drone, { y:Math.max(65, p.y - 220), fireTimer:30, hull:.7, pace:.48 });
      training.nextThreat = flight.elapsed + 3.6;
    }
  }
  if (training.step !== 'shift') return;
  const shot = training.volley;
  if (shot?.trainingContact === 'phased') {
    training.step = 'complete';
    prompt(flight, 'complete');
    return;
  }
  if (shot) {
    if (shot.trainingContact || shot.y > p.y + 22) {
      training.volley = null;
      training.nextThreat = flight.elapsed + .6;
      prompt(flight, 'retry');
    } else if (!training.cued && flight.shiftReady && p.y - shot.y <= shot.vy * GHOST.duration * .7) {
      training.cued = true;
      prompt(flight, 'cue');
    }
    return;
  }
  if (flight.elapsed < training.nextThreat || p.ghostRecovery) return;
  p.ghostEnergy = GHOST.capacity;
  flight.projectile(p.x, p.y - 205, Math.PI / 2, 132, 'bolt', { trainingShot:true });
  training.volley = flight.hostile.at(-1);
  training.cued = false;
  prompt(flight, 'shift');
}
