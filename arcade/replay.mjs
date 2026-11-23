import { AIM_PRECISION, FIXED_TICK, HEIGHT, INPUT_RESUME, INPUT_SHIFT, PREVIOUS_RULES, RULES_VERSION, SHIPS, SPECIALS, WIDTH, legacyStageById, stageById } from './catalog.mjs';
import { Flight } from './flight.mjs';
import { LEGACY_UPGRADES, tierKey, validTiers } from './progression.mjs';
import { validFlightSeed } from './seed.mjs';

const legacyRules = 'arcade-11';
const tickLimit = (run) => (run.mode === 'endless' ? 30 : run.rules === legacyRules ? 7 : 16) * 60 * 60;
const flags = INPUT_SHIFT | INPUT_RESUME;
const movementLimit = AIM_PRECISION * HEIGHT;

function outcome(terminal) {
  return { status: terminal.status, score: terminal.score, kills: terminal.kills, breaks: terminal.breaks,
    mastery: terminal.mastery };
}

export function captureReplay(run) {
  const commands = [];
  let x, y;
  const legacy = run.rules === legacyRules;
  const context = { seed: run.seed, rules: run.rules, mode: run.mode, stage: run.stage, ship: run.ship,
    special: run.special ?? 'ghost', ...(legacy ? { equipment:[...run.equipment] } :
      { tiers:{ ...run.tiers }, variant:run.variant ?? 'standard' }) };
  const limit = tickLimit(run);
  return {
    recordInput(tick, nextX, nextY, actions) {
      if (tick >= limit || (!actions && x === nextX && y === nextY)) return;
      x = nextX;
      y = nextY;
      commands.push([tick, x, y, actions]);
    },
    finish(ticks, terminal) {
      const schema = legacy ? 1 : 2;
      if (!validContext(context, schema) || !commands.length || ticks > limit) return null;
      return { schema, run: context, ticks, commands, result: outcome(terminal) };
    }
  };
}

function validContext(run, schema) {
  const legacy = schema === 1 && run?.rules === legacyRules;
  if (!run || !validFlightSeed(run.seed) || !(legacy || schema === 2 && [PREVIOUS_RULES, RULES_VERSION].includes(run.rules)) ||
      !Object.hasOwn(SHIPS, run.ship)) return false;
  if (typeof run.special !== 'string' || !Object.hasOwn(SPECIALS, run.special)) return false;
  if (run.rules !== RULES_VERSION && !['ghost', 'ion'].includes(run.special)) return false;
  const stage = legacy ? legacyStageById : stageById;
  if (!(run.mode === 'arcade' && Number.isInteger(run.stage) && stage(run.stage) || run.mode === 'endless' && run.stage === null)) return false;
  if (!legacy) return (run.variant === 'standard' || run.variant === 'veteran' && run.mode === 'arcade') && validTiers(run.tiers);
  if (!Array.isArray(run.equipment) || run.equipment.length > Object.keys(LEGACY_UPGRADES).length || new Set(run.equipment).size !== run.equipment.length) return false;
  return run.equipment.every((key) => typeof key === 'string' && Object.hasOwn(LEGACY_UPGRADES, key) &&
    (!LEGACY_UPGRADES[key].needs || run.equipment.includes(LEGACY_UPGRADES[key].needs)));
}

export function verifyReplay(replay) {
  const fail = (reason) => ({ valid: false, reason });
  if (!validContext(replay?.run, replay?.schema)) return fail('Unknown flight rules or loadout');
  const { run, commands, ticks, result } = replay;
  if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > tickLimit(run) || !Array.isArray(commands) ||
      !commands.length || commands.length > ticks || !result) return fail('Malformed replay or duration limit exceeded');

  let lastTick = -1;
  for (const command of commands) {
    if (!Array.isArray(command) || command.length !== 4 || !command.every(Number.isSafeInteger)) return fail('Malformed command');
    const [tick, x, y, action] = command;
    if (tick < 0 || tick <= lastTick || tick >= ticks || x < 0 || x > AIM_PRECISION * WIDTH ||
        y < 0 || y > movementLimit || action < 0 || action > flags) return fail('Command outside the flight bounds');
    lastTick = tick;
  }
  if (commands[0][0] !== 0) return fail('Missing opening input');

  const flight = new Flight({ ...run, assistance: {} });
  let index = 0;
  let aim = [0, 0];
  for (let tick = 0; tick < ticks; tick++) {
    if (commands[index]?.[0] === tick) {
      const [, x, y, action] = commands[index++];
      aim = [x, y];
      if ((action & INPUT_RESUME) && !flight.resumeProtection()) return fail('Resume protection is still recovering');
      if ((action & INPUT_SHIFT) && !flight.activateGhost()) return fail('The selected Special was unavailable');
    }
    flight.step(FIXED_TICK, aim);
    flight.takeEvents();
    if (flight.status !== 'active' && tick + 1 !== ticks) return fail('Flight ended before the claimed tick');
  }
  const terminal = flight.terminal();
  if (!terminal || !Object.entries(outcome(terminal)).every(([key, value]) => result[key] === value)) return fail('Claimed result differs from the replay');
  const legacy = replay.schema === 1;
  const loadout = legacy ? run.equipment.slice().sort().join(',') || 'stock' : tierKey(run.tiers);
  const mode = !legacy && run.variant === 'veteran' ? 'veteran' : run.mode;
  return { valid: true, board: `${run.rules}/${mode}/${run.stage ?? 'survival'}/${run.ship}/${loadout}/${run.special}`, seed: run.seed, ticks,
    duration: ticks * FIXED_TICK, result: outcome(terminal) };
}
