import { RULES_VERSION, SHIPS, SIDE_OPERATIONS, SPECIALS, STAGES, stageById } from './catalog.mjs';
import { LEGACY_UPGRADES, MAX_TIER, UPGRADES, normalizeTiers, pilotRank, tierBenefit, tierCost, tierKey, validTiers } from './progression.mjs';
import { validFlightSeed } from './seed.mjs';

const WEEK = 7 * 24 * 3600 * 1000;
const SCHEMA = 2;
const currentLoadoutLimit = 1024;
export { pilotRank };
export const DEFAULT_SETTINGS = { music: true, effects: true, reduced: false, contrast: false, steering: 'drag', sensitivity: 'standard', trainingDone: false, skipStory: false };
export const TOUCH_CONTROL_RANGES = {
  stickSize: { min: 60, max: 112, initial: 76 },
  specialSize: { min: 48, max: 84, initial: 58 },
  specialHorizontal: { min: 0, max: 100, initial: 100 },
  specialVertical: { min: 0, max: 100, initial: 0 }
};

export function touchControlLayout(preferences) {
  return Object.fromEntries(Object.entries(TOUCH_CONTROL_RANGES).map(([key, { min, max, initial }]) => {
    const value = preferences?.[key];
    return [key, Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : initial];
  }));
}

export function normalizeCallSign(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  return name === '' || /^[\p{L}\p{N}][\p{L}\p{N}\p{M} -]{0,15}$/u.test(name) ? name : null;
}

function number(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value)))) : 0;
}

export function newPilot(preferences) {
  return {
    schema: SCHEMA, callSign: '', salvage: 0, lifetimeXp: 0, clears: {}, mastery: {}, veteranClears: {}, veteranMastery: {},
    sideClears: {}, sideMastery: {},
    tiers: normalizeTiers(), storySeen: {}, ship: 'kestrel', special: 'ghost',
    records: { arcade: {}, veteran: {}, side: {}, endless: null }, active: {}, receipts: {},
    settings: { ...DEFAULT_SETTINGS, ...preferences }
  };
}

export function migratePilot(saved, preferences) {
  if (saved == null) return newPilot(preferences);
  if (saved.schema === SCHEMA) {
    if (saved.sideClears && saved.sideMastery && saved.records?.side) return saved;
    return { ...saved, sideClears: saved.sideClears ?? {}, sideMastery: saved.sideMastery ?? {},
      records: { ...saved.records, side: saved.records?.side ?? {} } };
  }
  if (saved.schema !== 1) throw Error('This device save requires a different game version');

  const pilot = newPilot(preferences);
  const cleared = { ...saved.clears };
  const equipment = Array.isArray(saved.equipment) ? saved.equipment.filter((key) => Object.hasOwn(LEGACY_UPGRADES, key)) : [];
  const oldRecords = saved.records ?? {};
  pilot.callSign = normalizeCallSign(saved.callSign) ?? '';
  pilot.salvage = number(number(saved.salvage) + (equipment.includes('hull') ? LEGACY_UPGRADES.hull.cost : 0));
  const hasRails = equipment.includes('rails');
  pilot.tiers = normalizeTiers({ damage: equipment.includes('cells') ? (hasRails ? 12 : 6) : hasRails ? 5 : 0,
    rate: equipment.includes('chamber') ? 9 : 0 });
  pilot.legacy = { equipment, clears: cleared, mastery: { ...saved.mastery },
    endlessQualified: Boolean(oldRecords.endless || Object.values(oldRecords.history ?? {}).some((record) => record?.mode === 'endless')) };
  // The old Crown clear remains in career history. Clear the new flagship to earn the new ending.
  pilot.clears = Object.fromEntries(Object.entries(cleared).filter(([id, count]) => /^[1-5]$/.test(id) && number(count) > 0)
    .map(([id, count]) => [id, number(count)]));
  const legacyClears = Object.entries(cleared).filter(([id, count]) => /^[1-6]$/.test(id) && number(count) > 0).length;
  const legacyMasteries = Object.values(pilot.legacy.mastery).filter((earned) => earned === true).length;
  pilot.lifetimeXp = Math.max(number(saved.lifetimeXp), legacyClears * 120 + legacyMasteries * 95);
  pilot.settings = { ...pilot.settings, ...saved.settings };
  pilot.receipts = { ...saved.receipts };
  pilot.records.history = { ...oldRecords.history };
  pilot.records.loadouts = { ...oldRecords.loadouts };
  for (const [id, record] of Object.entries(oldRecords.arcade ?? {})) {
    if (record) archiveCareerRecord(pilot.records, careerRecordKey(record, id), record, 'arcade', Number(id));
  }
  if (oldRecords.endless) {
    archiveCareerRecord(pilot.records, careerRecordKey(oldRecords.endless, 'endless'), oldRecords.endless, 'endless', null);
  }
  if (hasShip(pilot, saved.ship)) pilot.ship = saved.ship;
  if (hasSpecial(pilot, saved.special)) pilot.special = saved.special;
  return pilot;
}

function clearsFor(pilot, variant) {
  return variant === 'veteran' ? pilot.veteranClears : pilot.clears;
}

export function nextMission(pilot, variant = 'standard') {
  const clears = clearsFor(pilot, variant);
  return STAGES.find(({ id }) => !clears[id]) ?? null;
}

export function campaignComplete(pilot, variant = 'standard') {
  return nextMission(pilot, variant) === null;
}

export function hasEndless(pilot) {
  return pilot.legacy?.endlessQualified === true || campaignComplete(pilot);
}

export function hasVeteran(pilot) {
  return campaignComplete(pilot);
}

export function hasStage(pilot, id, variant = 'standard') {
  const stage = stageById(id, variant);
  if (!stage || (variant === 'veteran' && !hasVeteran(pilot))) return false;
  if (stage.side) return variant === 'standard' && Boolean(pilot.clears[STAGES[stage.requires - 1]?.id]);
  return Boolean(clearsFor(pilot, variant)[id]) || nextMission(pilot, variant)?.id === id;
}

export function completionCounts(pilot) {
  const main = STAGES.filter(({ id }) => pilot.clears[id]).length;
  const side = SIDE_OPERATIONS.filter(({ id }) => pilot.sideClears[id]).length;
  return { main, side, total: main + side, mainLimit: STAGES.length, sideLimit: SIDE_OPERATIONS.length,
    totalLimit: STAGES.length + SIDE_OPERATIONS.length };
}

export function hasShip(pilot, key) {
  if (!Object.hasOwn(SHIPS, key)) return false;
  const { clearance } = SHIPS[key];
  // Stage 4 clears also count for Gunships earned on previous versions.
  return clearance === 0 || Boolean(pilot.clears[clearance] || (key === 'bastion' && pilot.clears[4]));
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

export function upgradeStatus(pilot, key) {
  if (!Object.hasOwn(UPGRADES, key)) return null;
  const tier = pilot.tiers[key];
  const limit = Math.max(tier, Math.min(MAX_TIER, nextMission(pilot)?.number ?? MAX_TIER));
  const nextCost = tier < MAX_TIER ? tierCost(tier + 1) : null;
  return { tier, limit, nextCost, installedBenefit: tierBenefit(key, tier),
    nextBenefit: tier < MAX_TIER ? tierBenefit(key, 1) : null,
    affordable: nextCost !== null && pilot.salvage >= nextCost, available: tier < limit };
}

export function canInstall(pilot, key) {
  const status = upgradeStatus(pilot, key);
  return Boolean(status?.available && status.affordable);
}

export function install(pilot, key) {
  const status = upgradeStatus(pilot, key);
  if (!status?.available || !status.affordable) return false;
  pilot.salvage -= status.nextCost;
  pilot.tiers[key] += 1;
  return true;
}

export function beginRun(pilot, id, mode, stage, now = Date.now(), seed = '', variant = 'standard') {
  if (mode !== 'arcade' && mode !== 'endless') return null;
  if (typeof id !== 'string' || !id || Object.hasOwn(Object.prototype, id) || Object.hasOwn(pilot.active, id) || Object.hasOwn(pilot.receipts, id)) return null;
  if (variant !== 'standard' && variant !== 'veteran') return null;
  if (mode === 'arcade' ? !hasStage(pilot, stage, variant) : variant !== 'standard' || !hasEndless(pilot)) return null;
  for (const [key, run] of Object.entries(pilot.active)) {
    if (now - run.started > WEEK) delete pilot.active[key];
  }
  const assistance = { ...pilot.settings };
  delete assistance.trainingDone;
  delete assistance.haptics;
  delete assistance.skipStory;
  for (const key of Object.keys(TOUCH_CONTROL_RANGES)) delete assistance[key];
  const run = {
    id, mode, variant, stage: mode === 'arcade' ? stage : null, started: now, rules: RULES_VERSION,
    side: mode === 'arcade' && stageById(stage, variant).side === true,
    ship: pilot.ship, tiers: normalizeTiers(pilot.tiers), equipment: [], special: hasSpecial(pilot, pilot.special) ? pilot.special : 'ghost',
    assistance, seed: validFlightSeed(seed) ? seed : undefined
  };
  pilot.active[id] = run;
  return run;
}

export function abandonRun(pilot, id) {
  delete pilot.active[id];
}

function loadoutKey(stage, variant, ship, special, tiers) {
  if ((stage !== null && !stageById(stage, variant)) || !Object.hasOwn(SHIPS, ship) || !Object.hasOwn(SPECIALS, special) || !validTiers(tiers)) return null;
  return `${RULES_VERSION}/${variant}/${stage ?? 'endless'}/${ship}/${special}/${tierKey(tiers)}`;
}

export function loadoutBest(pilot, stage, variant = 'standard') {
  const special = hasSpecial(pilot, pilot.special) ? pilot.special : 'ghost';
  const key = loadoutKey(stage, variant, pilot.ship, special, pilot.tiers);
  return key ? pilot.records.loadouts?.[key] ?? null : null;
}

function improvesRecord(record, previous) {
  if (!previous) return true;
  if (record.mode === 'endless') {
    return record.duration > previous.duration || (record.duration === previous.duration && record.score > previous.score);
  }
  return record.status === previous.status ? record.score > previous.score : record.status === 'clear';
}

function careerRecordKey(record, route) {
  const rules = typeof record.rules === 'string' && /^arcade-\d+$/.test(record.rules) ? record.rules : 'legacy';
  return `${rules}/${route}`;
}

function archiveCareerRecord(records, key, record, mode, stage) {
  const history = records.history ??= {};
  const entry = { ...record, mode, stage };
  if (improvesRecord(entry, history[key])) history[key] = entry;
}

function settleCareer(pilot, record, stage) {
  const records = pilot.records;
  const stageRecords = record.side ? records.side : record.variant === 'veteran' ? records.veteran : records.arcade;
  const route = record.variant === 'veteran' ? `veteran/${stage.id}` : stage?.id ?? 'endless';
  const previous = stage ? stageRecords[stage.id] : records.endless;
  const key = careerRecordKey(record, route);
  const previousKey = previous && careerRecordKey(previous, route);
  const best = improvesRecord(record, previous);
  if (best) {
    if (previous && previousKey !== key) archiveCareerRecord(records, previousKey, previous, record.mode, record.stage);
    if (stage) stageRecords[stage.id] = record;
    else records.endless = record;
    if (records.history) delete records.history[key];
  } else if (previousKey !== key) {
    archiveCareerRecord(records, key, record, record.mode, record.stage);
  }
  return best;
}

function settleLoadout(pilot, record) {
  if (record.rules !== RULES_VERSION) return null;
  if (record.status === 'defeat' && (record.mode === 'endless' ? record.duration === 0 : record.score === 0)) return null;
  const key = loadoutKey(record.stage, record.variant, record.ship, record.special, record.tiers);
  if (!key) return null;
  const records = pilot.records.loadouts ??= {};
  const previous = records[key] ?? null;
  const improved = improvesRecord(record, previous);
  if (improved) {
    const { score, duration, status } = record;
    delete records[key];
    records[key] = { score, duration, status };
    const keys = Object.keys(records).filter((id) => id.startsWith(`${RULES_VERSION}/`));
    for (const id of keys.slice(0, -currentLoadoutLimit)) delete records[id];
  }
  return { improved, previous };
}

function meaningfulFlight(record, terminal) {
  return record.status === 'clear' || (record.duration >= 24 && record.kills >= 5 && number(terminal.movement) >= 100 + 3 * record.duration);
}

function defeatAward(stage, record, repeatAward) {
  const rateCap = Math.floor(.82 * repeatAward * record.duration / (stage.bossAt + 30));
  const cap = Math.min(stage.defeatCap ?? Infinity, Math.floor(.6 * repeatAward));
  return Math.min(rateCap, Math.floor(1.35 * record.kills), cap);
}

function experienceAward(stage, record, terminal, first, mastery, played) {
  if (!played) return 0;
  let combat = Math.min(240, record.kills * 2) + Math.min(40, record.breaks * 4) + Math.min(165, Math.floor(record.duration * .3));
  if (record.status !== 'clear' && stage) {
    const progress = Math.min(1, record.duration / stage.bossAt);
    combat = Math.floor(combat * (.45 + .35 * progress));
  }
  if (!stage) return combat + Math.min(240, Math.floor(record.duration / 90) * 14 + number(terminal.bossesDefeated) * 24);
  if (stage.side) {
    const finish = record.status === 'clear' ? 45 + 3 * stage.requires : 0;
    return combat + finish + (first ? 70 + 4 * stage.requires : 0) + (mastery ? 95 : 0);
  }
  const finish = record.status === 'clear' ? 70 + 3 * stage.number : 0;
  const discovery = first ? 100 + 6 * stage.number : 0;
  return Math.round((combat + finish + discovery + (mastery ? 95 : 0)) * (record.variant === 'veteran' ? 1.3 : 1));
}

export function settleRun(pilot, id, terminal) {
  if (Object.hasOwn(pilot.receipts, id)) return pilot.receipts[id];
  if (!Object.hasOwn(pilot.active, id)) return null;
  const run = pilot.active[id];
  if (run.rules !== RULES_VERSION || !['clear', 'defeat'].includes(terminal?.status) ||
      (run.mode === 'endless' && terminal.status !== 'defeat')) return null;
  const stage = stageById(run.stage, run.variant);
  if (run.mode === 'arcade' && !stage) return null;
  const side = stage?.side === true;

  const record = {
    mode: run.mode, variant: run.variant, stage: run.stage, side, ship: run.ship, rules: run.rules,
    tiers: { ...run.tiers }, equipment: [], special: run.special ?? 'ghost',
    assistance: run.assistance, score: number(terminal.score), duration: number(terminal.duration),
    kills: number(terminal.kills), breaks: number(terminal.breaks), status: terminal.status
  };
  const cleared = terminal.status === 'clear';
  const veteran = run.variant === 'veteran';
  const repeatAward = stage && Math.round((side ? .55 : .62) * stage.first);
  const played = meaningfulFlight(record, terminal);
  let award = 0;
  let first = false;
  let newShip = null;
  let newSpecial = null;
  let newStage = null;
  let newOperations = [];
  let campaignWon = false;
  if (stage && cleared) {
    const clears = side ? pilot.sideClears : clearsFor(pilot, run.variant);
    first = !clears[stage.id];
    if (first && !side && !veteran) newShip = Object.keys(SHIPS).find((key) => SHIPS[key].clearance === stage.id && !hasShip(pilot, key)) ?? null;
    clears[stage.id] = number(number(clears[stage.id]) + 1);
    award = first ? Math.round(stage.first * (veteran ? .85 : 1)) : repeatAward;
    if (first && !side) {
      if (!veteran) {
        newSpecial = Object.keys(SPECIALS).find((key) => SPECIALS[key].clearance === stage.id) ?? null;
        newOperations = SIDE_OPERATIONS.filter(({ requires }) => requires === stage.number).map(({ id }) => id);
      }
      newStage = nextMission(pilot, run.variant)?.id ?? null;
      campaignWon = newStage === null;
    }
  } else if (stage && played) {
    award = defeatAward(stage, record, repeatAward);
  }

  const best = played && settleCareer(pilot, record, stage);
  const loadout = played ? settleLoadout(pilot, record) : null;
  pilot.salvage = number(pilot.salvage + award);
  delete pilot.active[id];
  const accomplishments = side ? pilot.sideMastery : veteran ? pilot.veteranMastery : pilot.mastery;
  const masteryKey = stage?.mastery?.key ?? stage?.id;
  const masteryMet = cleared && Boolean(stage?.mastery) && terminal.mastery === true;
  const mastery = masteryMet && !accomplishments[masteryKey];
  if (mastery) accomplishments[masteryKey] = true;
  const xpAward = experienceAward(stage, record, terminal, first, mastery, played);
  const priorRank = pilotRank(pilot.lifetimeXp);
  pilot.lifetimeXp = number(pilot.lifetimeXp + xpAward);
  const rank = pilotRank(pilot.lifetimeXp);
  const rankUp = rank.level > priorRank.level ? rank.name : null;
  const receipt = { id, ...record, award, xpAward, rankUp, first, best, newStage, newShip, newSpecial, newOperations, mastery, masteryMet, loadout, campaignWon };
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
          const pilot = migratePilot(read.result ?? newSave, this.preferences);
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
