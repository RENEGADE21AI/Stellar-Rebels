import { GHOST, SPECIALS } from './catalog.mjs';

const lessons = {
  steer: ['Steer your Fighter', 'Drag anywhere on the field or use the arrow keys.'],
  fire: ['Line up a shot', 'Move underneath the drone. Your guns fire automatically.'],
  shift: ['Ghost Shift', 'Stay in the shot’s path and wait for the cue.'],
  cue: ['Shift now', 'Tap Shift or press Space to phase through the shot.'],
  retry: ['Try again', 'Shift when the shot is close to your Fighter.'],
  burst: ['Ion Burst', 'Stay in the shot’s path and wait for the cue.'],
  burstCue: ['Burst now', 'Tap Burst or press Space to clear the shot.'],
  burstRetry: ['Try again', 'Burst when the shot is close to your Fighter.'],
  complete: ['Ready to fly', 'Good hunting, pilot.']
};

function prompt(flight, step) {
  const [title, copy] = lessons[step];
  flight.message(copy, Infinity, 'training', title);
}

export function startTraining(flight, drill = 'basics') {
  flight.practice = true;
  flight.player.ghostEnergy = 0;
  const step = drill === 'special' ? 'shift' : 'steer';
  prompt(flight, step === 'shift' && flight.special === 'ion' ? 'burst' : step);
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
      Object.assign(drone, { y:Math.max(65, p.y - 220), fireTimer:Infinity, hull:.7, pace:0 });
      training.nextThreat = flight.elapsed + 3.6;
    }
  }
  if (training.step !== 'shift') return;
  const ion = flight.special === 'ion';
  const burst = ion ? events.find((event) => event.type === 'ionBurst') : null;
  const shot = training.volley;
  if (ion ? burst?.detail.cleared > 0 : shot?.trainingContact === 'phased') {
    training.step = 'complete';
    prompt(flight, 'complete');
    return;
  }
  if (shot) {
    if (burst || shot.trainingContact || shot.y > p.y + 22) {
      shot.live = false;
      training.volley = null;
      training.nextThreat = flight.elapsed + .6;
      prompt(flight, ion ? 'burstRetry' : 'retry');
    } else if (!training.cued && flight.shiftReady) {
      const inRange = ion ? Math.hypot(shot.x - p.x, shot.y - p.y) <= SPECIALS.ion.radius * .88
        : p.y - shot.y <= shot.vy * GHOST.duration * .7;
      if (inRange) {
        training.cued = true;
        prompt(flight, ion ? 'burstCue' : 'cue');
        flight.signal('practiceCue', p.x, p.y);
      }
    }
    return;
  }
  if (flight.elapsed < training.nextThreat || p.ghostRecovery) return;
  p.ghostEnergy = GHOST.capacity;
  flight.projectile(p.x, p.y - 205, Math.PI / 2, ion ? 104 : 132, 'bolt', { trainingShot:true });
  training.volley = flight.hostile.at(-1);
  training.cued = false;
  prompt(flight, ion ? 'burst' : 'shift');
}
