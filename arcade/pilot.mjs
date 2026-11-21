import { RULES_VERSION, SHIPS, SPECIALS, STAGES, UPGRADES, stageById } from './catalog.mjs';
import { validFlightSeed } from './seed.mjs';

const WEEK = 7 * 24 * 3600 * 1000;
const SCHEMA = 1;
const REWARD_VERSION = 2;
const upgrades = Object.keys(UPGRADES);
const loadoutLimit = 2 * (STAGES.length + 1) * Object.keys(SHIPS).length * Object.keys(SPECIALS).length * 2 ** upgrades.length;
export const DEFAULT_SETTINGS = { music: true, effects: true, reduced: false, contrast: false, sensitivity: 'standard', trainingDone: false };

export function normalizeCallSign(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  return name === '' || /^[\p{L}\p{N}][\p{L}\p{N}\p{M} -]{0,15}$/u.test(name) ? name : null;
}

function number(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

export function newPilot(preferences) {
  return {
    schema: SCHEMA, callSign: '', salvage: 0, clears: {}, mastery: {}, equipment: [], ship: 'kestrel', special: 'ghost',
    records: { arcade: {}, endless: null }, active: {}, receipts: {},
    settings: { ...DEFAULT_SETTINGS, ...preferences }
  };
}

export function hasStage(pilot, id) {
  return Boolean(stageById(id)) && (id === 1 || Boolean(pilot.clears[id - 1]));
}

export function hasShip(pilot, key) {
  return Object.hasOwn(SHIPS, key) && (SHIPS[key].clearance === 0 || Boolean(pilot.clears[SHIPS[key].clearance]));
}

export function equip(pilot, key) {
  if (!hasShip(pilot, key)) return false;
  pilot.ship = key;
  return true;
}

export function hasSpecial(pilot, key) {
  if (typeof key !== 'string' || !Object.hasOwn(SPECIALS, key)) return false;
  const { clearance } = SPECIALS[key];
  return clearance === 0 || Boolean(pilot.clears[clearance]);
}

export function equipSpecial(pilot, key) {
  if (!hasSpecial(pilot, key)) return false;
  pilot.special = key;
  return true;
}

export function install(pilot, key) {
  const item = Object.hasOwn(UPGRADES, key) ? UPGRADES[key] : null;
  if (!item || pilot.equipment.includes(key) || pilot.salvage < item.cost) return false;
  if (item.needs && !pilot.equipment.includes(item.needs)) return false;
  pilot.salvage -= item.cost;
  pilot.equipment.push(key);
  return true;
}

export function beginRun(pilot, id, mode, stage, now = Date.now(), seed = '') {
  if (mode !== 'arcade' && mode !== 'endless') return null;
  if (!id || Object.hasOwn(pilot.active, id) || Object.hasOwn(pilot.receipts, id)) return null;
  if (mode === 'arcade' && !hasStage(pilot, stage)) return null;
  for (const [key, run] of Object.entries(pilot.active)) {
    if (now - run.started > WEEK) delete pilot.active[key];
  }
  const assistance = { ...pilot.settings };
  delete assistance.trainingDone;
  delete assistance.haptics;
  const run = {
    id, mode, stage: mode === 'arcade' ? stage : null, started: now, rules: RULES_VERSION, rewardVersion: REWARD_VERSION,
    ship: pilot.ship, equipment: [...pilot.equipment], special: hasSpecial(pilot, pilot.special) ? pilot.special : 'ghost',
    assistance, seed: validFlightSeed(seed) ? seed : undefined
  };
  pilot.active[id] = run;
  return run;
}

export function abandonRun(pilot, id) {
  delete pilot.active[id];
}

function loadoutKey(stage, ship, special, equipment) {
  if ((stage !== null && !stageById(stage)) || !Object.hasOwn(SHIPS, ship) || !Object.hasOwn(SPECIALS, special) || !Array.isArray(equipment)) return null;
  const installed = new Set(equipment);
  const valid = upgrades.filter((key) => installed.has(key));
  if (installed.size !== valid.length || valid.some((key) => UPGRADES[key].needs && !installed.has(UPGRADES[key].needs))) return null;
  return `${RULES_VERSION}/${stage ?? 'endless'}/${ship}/${special}/${valid.join(',') || 'stock'}`;
}

export function loadoutBest(pilot, stage) {
  const special = hasSpecial(pilot, pilot.special) ? pilot.special : 'ghost';
  const key = loadoutKey(stage, pilot.ship, special, pilot.equipment);
  return key ? pilot.records.loadouts?.[key] ?? null : null;
}

function improvesRecord(record, previous) {
  if (!previous) return true;
  if (record.mode === 'endless') {
    return record.duration > previous.duration || (record.duration === previous.duration && record.score > previous.score);
  }
  return record.status === previous.status ? record.score > previous.score : record.status === 'clear';
}

function settleLoadout(pilot, record) {
  if (record.rules !== RULES_VERSION) return null;
  if (record.status === 'defeat' && (record.mode === 'endless' ? record.duration === 0 : record.score === 0)) return null;
  const key = loadoutKey(record.stage, record.ship, record.special, record.equipment);
  if (!key) return null;
  const records = pilot.records.loadouts ??= {};
  const previous = records[key] ?? null;
  const improved = improvesRecord(record, previous);
  if (improved) {
    const { score, duration, status } = record;
    records[key] = { score, duration, status };
    const keys = Object.keys(records);
    if (keys.length > loadoutLimit) {
      const older = keys.filter((id) => !id.startsWith(`${RULES_VERSION}/`));
      for (const id of older.slice(0, keys.length - loadoutLimit)) delete records[id];
    }
  }
  return { improved, previous };
}

function previousDefeatAward(stage, record, movement) {
  if (record.duration < 24 || record.kills < 5 || movement < 54) return 0;
  const progress = Math.min(1, (record.duration - 18) / (stage.bossAt - 18));
  const earned = Math.floor(.65 * stage.defeatCap * progress ** 1.35);
  const rateLimit = Math.floor(.8 * stage.repeat * record.duration / (stage.bossAt + 55));
  return Math.max(1, Math.min(earned, Math.floor(record.kills / 3), rateLimit));
}

function defeatAward(stage, record, movement, repeatAward) {
  if (record.duration < 24 || record.kills < 5 || movement < 100 + 3 * record.duration) return 0;
  const rateCap = Math.floor(.92 * repeatAward * record.duration / (stage.bossAt + 55));
  return Math.min(rateCap, Math.floor(1.35 * record.kills), Math.floor(.65 * repeatAward));
}

export function settleRun(pilot, id, terminal) {
  if (Object.hasOwn(pilot.receipts, id)) return pilot.receipts[id];
  if (!Object.hasOwn(pilot.active, id)) return null;
  const run = pilot.active[id];
  if (!['clear', 'defeat'].includes(terminal.status) || (run.mode === 'endless' && terminal.status !== 'defeat')) return null;
  const stage = stageById(run.stage);
  if (run.mode === 'arcade' && !stage) return null;

  const record = {
    mode: run.mode, stage: run.stage, ship: run.ship, rules: run.rules, equipment: run.equipment, special: run.special ?? 'ghost',
    assistance: run.assistance, score: number(terminal.score), duration: number(terminal.duration),
    kills: number(terminal.kills), breaks: number(terminal.breaks), status: terminal.status
  };
  const cleared = terminal.status === 'clear';
  const updatedRewards = run.rewardVersion === REWARD_VERSION;
  const repeatAward = stage && (updatedRewards ? Math.round(.8 * stage.first) : stage.repeat);
  let award = 0;
  let first = false;
  let newShip = null;
  let newSpecial = null;
  let newStage = null;
  if (stage && cleared) {
    first = !pilot.clears[stage.id];
    pilot.clears[stage.id] = number(pilot.clears[stage.id]) + 1;
    award = first ? stage.first : repeatAward;
    if (first) {
      newShip = Object.keys(SHIPS).find((key) => SHIPS[key].clearance === stage.id) ?? null;
      newSpecial = Object.keys(SPECIALS).find((key) => SPECIALS[key].clearance === stage.id) ?? null;
      newStage = stage.id < STAGES.length ? stage.id + 1 : null;
    }
  } else if (stage) {
    const movement = number(terminal.movement);
    award = updatedRewards ? defeatAward(stage, record, movement, repeatAward) : previousDefeatAward(stage, record, movement);
  }

  const best = improvesRecord(record, stage ? pilot.records.arcade[stage.id] : pilot.records.endless);
  if (best && stage) pilot.records.arcade[stage.id] = record;
  if (best && !stage) pilot.records.endless = record;
  const loadout = settleLoadout(pilot, record);
  pilot.salvage += award;
  delete pilot.active[id];
  pilot.mastery ??= {};
  const masteryKey = run.rules === 'arcade-1' ? stage?.id : stage?.mastery?.key ?? stage?.id;
  const masteryMet = cleared && Boolean(stage?.mastery) && terminal.mastery === true;
  const mastery = masteryMet && !pilot.mastery[masteryKey];
  if (mastery) pilot.mastery[masteryKey] = true;
  const receipt = { ...record, award, first, best, newStage, newShip, newSpecial, mastery, masteryMet, loadout };
  pilot.receipts[id] = receipt;
  const recent = Object.keys(pilot.receipts);
  for (const old of recent.slice(0, -20)) delete pilot.receipts[old];
  return receipt;
}

export class PilotStore {
  constructor(indexedDb, preferences) {
    this.indexedDb = indexedDb;
    this.preferences = preferences;
    this.session = newPilot(preferences);
    this.db = null;
    this.temporary = false;
  }

  async open() {
    this.db = await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => finish(reject, Error('Opening device storage timed out')), 2500);
      function finish(notify, value) {
        if (settled) return false;
        settled = true;
        clearTimeout(timeout);
        notify(value);
        return true;
      }
      let request;
      try { request = this.indexedDb.open('stellar-rebels', 1); }
      catch (error) { finish(reject, error); return; }
      request.onupgradeneeded = () => request.result.createObjectStore('pilot');
      request.onsuccess = () => { if (!finish(resolve, request.result)) request.result.close(); };
      request.onerror = () => finish(reject, request.error);
      request.onblocked = () => finish(reject, Error('Device storage is blocked'));
    });
    this.db.onversionchange = () => { this.db.close(); this.db = null; };
    const previousTemporary = this.temporary;
    this.temporary = false;
    try {
      // Probe writable storage without replacing an existing save.
      return (await this.change(() => undefined, previousTemporary ? this.session : null)).pilot;
    } catch (error) {
      this.db?.close();
      this.db = null;
      this.temporary = previousTemporary;
      throw error;
    }
  }

  useTemporary() {
    this.temporary = true;
    return this.session;
  }

  load() {
    return this.transact(null).then(({ pilot }) => pilot);
  }

  change(operation, newSave = null) {
    return this.transact(operation, newSave);
  }

  async transact(operation, newSave = null) {
    if (this.temporary) {
      const draft = structuredClone(this.session);
      const result = operation?.(draft);
      if (operation) this.session = draft;
      return { pilot: draft, result };
    }
    if (!this.db) throw Error('Device storage is unavailable');
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('pilot', operation ? 'readwrite' : 'readonly');
      const store = tx.objectStore('pilot');
      const read = store.get('profile');
      let reply;
      let failure;
      tx.oncomplete = () => resolve(reply);
      tx.onabort = () => reject(failure ?? tx.error ?? Error('The save could not be written'));
      read.onsuccess = () => {
        try {
          const pilot = read.result ?? newSave ?? newPilot(this.preferences);
          if (pilot.schema !== SCHEMA) throw Error('This device save requires a different game version');
          if (!Object.hasOwn(pilot.settings ?? {}, 'trainingDone')) pilot.settings = { ...DEFAULT_SETTINGS, ...pilot.settings };
          if (!hasSpecial(pilot, pilot.special)) pilot.special = 'ghost';
          const result = operation?.(pilot);
          if (operation) store.put(pilot, 'profile');
          reply = { pilot, result };
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  }
}
