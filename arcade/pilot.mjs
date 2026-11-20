import { RULES_VERSION, SHIPS, STAGES, UPGRADES, stageById } from './catalog.mjs';
import { validFlightSeed } from './seed.mjs';

const WEEK = 7 * 24 * 3600 * 1000;
const SCHEMA = 1;
export const DEFAULT_SETTINGS = { music: true, effects: true, reduced: false, contrast: false, sensitivity: 'standard' };

function number(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

export function newPilot(preferences) {
  return {
    schema: SCHEMA, salvage: 0, clears: {}, mastery: {}, equipment: [], ship: 'kestrel',
    records: { arcade: {}, endless: null }, active: {}, receipts: {},
    settings: { ...DEFAULT_SETTINGS, ...preferences }
  };
}

export function legacyArchive(storage) {
  const parse = (key) => {
    try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
  };
  const legacy = parse('star_strike_rush_meta_v1');
  const preferences = parse('star_strike_rush_settings_v1');
  const glory = number(legacy?.totalGlory ?? legacy?.glory ?? 0);
  let visible = false;
  try { visible = storage?.getItem('star_strike_rush_meta_v1') != null || storage?.getItem('star_strike_rush_high_score_v1') != null; } catch {}
  const settings = {};
  if (typeof preferences?.musicEnabled === 'boolean') settings.music = preferences.musicEnabled;
  if (typeof preferences?.effectsEnabled === 'boolean') settings.effects = preferences.effectsEnabled;
  return {
    visible, glory, prestige: Math.floor(glory / 300000), settings,
    score: Math.max(number(legacy?.lifetime?.bestScore), number(legacy?.highScore), number(parse('star_strike_rush_high_score_v1')))
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
  const run = {
    id, mode, stage: mode === 'arcade' ? stage : null, started: now, rules: RULES_VERSION,
    ship: pilot.ship, equipment: [...pilot.equipment], assistance: { ...pilot.settings }, seed: validFlightSeed(seed) ? seed : undefined
  };
  pilot.active[id] = run;
  return run;
}

export function abandonRun(pilot, id) {
  delete pilot.active[id];
}

function defeatAward(stage, record, movement) {
  if (record.duration < 24 || record.kills < 5 || movement < 54) return 0;
  const progress = Math.min(1, (record.duration - 18) / (stage.bossAt - 18));
  const earned = Math.floor(.65 * stage.defeatCap * progress ** 1.35);
  const rateLimit = Math.floor(.8 * stage.repeat * record.duration / (stage.bossAt + 55));
  return Math.max(1, Math.min(earned, Math.floor(record.kills / 3), rateLimit));
}

export function settleRun(pilot, id, terminal) {
  if (Object.hasOwn(pilot.receipts, id)) return pilot.receipts[id];
  if (!Object.hasOwn(pilot.active, id)) return null;
  const run = pilot.active[id];
  if (!['clear', 'defeat'].includes(terminal.status) || (run.mode === 'endless' && terminal.status !== 'defeat')) return null;
  const stage = stageById(run.stage);
  if (run.mode === 'arcade' && !stage) return null;

  const record = {
    mode: run.mode, stage: run.stage, ship: run.ship, rules: run.rules, equipment: run.equipment,
    assistance: run.assistance, score: number(terminal.score), duration: number(terminal.duration),
    kills: number(terminal.kills), breaks: number(terminal.breaks), status: terminal.status
  };
  const cleared = terminal.status === 'clear';
  let award = 0;
  let first = false;
  let newShip = null;
  let newStage = null;
  let best = false;
  if (stage && cleared) {
    first = !pilot.clears[stage.id];
    pilot.clears[stage.id] = number(pilot.clears[stage.id]) + 1;
    award = first ? stage.first : stage.repeat;
    if (first) {
      newShip = Object.keys(SHIPS).find((key) => SHIPS[key].clearance === stage.id) ?? null;
      newStage = stage.id < STAGES.length ? stage.id + 1 : null;
    }
  } else if (stage) {
    award = defeatAward(stage, record, number(terminal.movement));
  }

  if (stage) {
    const old = pilot.records.arcade[stage.id];
    best = !old || (cleared && old.status !== 'clear') || (old.status === record.status && record.score > old.score);
    if (best) pilot.records.arcade[stage.id] = record;
  } else {
    const old = pilot.records.endless;
    best = !old || record.duration > old.duration || (record.duration === old.duration && record.score > old.score);
    if (best) pilot.records.endless = record;
  }
  pilot.salvage += award;
  delete pilot.active[id];
  pilot.mastery ??= {};
  const masteryKey = run.rules === 'arcade-1' ? stage?.id : stage?.mastery?.key ?? stage?.id;
  const mastery = cleared && Boolean(stage?.mastery) && terminal.mastery === true && !pilot.mastery[masteryKey];
  if (mastery) pilot.mastery[masteryKey] = true;
  const receipt = { ...record, award, first, best, newStage, newShip, mastery };
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
