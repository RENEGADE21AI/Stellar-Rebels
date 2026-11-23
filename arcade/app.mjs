import { ACTS, FIXED_TICK, FREE_MISSIONS, HEIGHT, PICKUPS, RULES_VERSION, SHIPS, SIDE_OPERATIONS, SPECIALS, STAGES, UPGRADES, WIDTH, nextStage, stageById } from './catalog.mjs';
import { Flight } from './flight.mjs';
import { FlightScene, loadSprite, spriteUrl } from './scene.mjs';
import { FlightAudio } from './audio.mjs';
import { PilotStore, TOUCH_CONTROL_RANGES, abandonRun, beginRun, canInstall, completionCounts, equip, equipSpecial, hasEndless, hasShip, hasSpecial, hasStage, hasVeteran, install, loadoutBest, nextMission, normalizeCallSign, pilotRank, settleRun, touchControlLayout, upgradeStatus } from './pilot.mjs';
import { captureReplay } from './replay.mjs';
import { otherRealm, realmLabel } from './wraith.mjs';
import { mountTitlePatrol } from './title-patrol.mjs';
import { advanceTraining, startTraining } from './training.mjs';
import { createGoogleAccount, googleSignInAvailable, pendingGoogleReturn } from './account.mjs';
import { helpPages } from './help-content.mjs';
import { STORY_BEATS, storyBeatFor } from './story.mjs';
import { createPacingRecorder } from './pacing.mjs';

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const sky = $('sky');
const field = $('flight');
const stick = $('flight-stick');
const modal = $('flight-modal');
const nativeFlight = document.documentElement.dataset.nativeFlight === 'true';
const firstPaidMission = FREE_MISSIONS + 1;
const callSignWords = ['NOVA', 'COMET', 'FALCON', 'RAVEN', 'STRIKER', 'PIPER', 'KITE', 'ARROW', 'MERLIN', 'SWIFT', 'HARRIER', 'LARK', 'KODIAK', 'RANGER', 'SPARROW', 'HORIZON'];
const nativeCommerce = nativeFlight ? window.stellarCommerce : null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const coarseTouch = matchMedia('(hover: none) and (pointer: coarse)');
const placeTouchControls = () => field.toggleAttribute('data-touch-controls', nativeFlight || coarseTouch.matches);
placeTouchControls();
coarseTouch.addEventListener('change', placeTouchControls);
const hapticAvailable = nativeFlight || (typeof navigator.vibrate === 'function' && navigator.maxTouchPoints > 0);
const store = new PilotStore(globalThis.indexedDB);
const audio = new FlightAudio();
const clock = globalThis.createFixedStepClock();
const renderer = new FlightScene(sky);
const pacing = createPacingRecorder(location);
if (pacing) window.stellarPacing = () => pacing.snapshot();
const state = {
  pilot: null, view: 'home', mode: 'menu', hangarTab: 'ships', inspected: 'kestrel', hangarBack: 'home',
  helpBack: 'home', campaignVariant: 'standard', story: null, callSign: null, upgrade: null, flight: null, pending: null, last: null, busy: null, launch: null,
  legalFrom: null, policyFrom: null, rating: { available:null, message:'' },
  commerce: { owned:false, price:'', ready:false }, commerceWork: null, commerceScreen: null,
  pointer: null, keys: new Set(), input: 'touch', support: '', pack: 'waiting', packCheck: 0, installed: false, resumeAt: 0, finishAt: 0
};
const motionLimited = (preferences = state.pilot.settings) => reduced.matches || preferences.reduced;
const appearance = (preferences) => motionLimited(preferences) === preferences.reduced
  ? preferences : { ...preferences, reduced: true };
const usesFloatingStick = (preferences = state.pilot.settings) => preferences.steering === 'stick';
let accountState = { phase:'connecting', notice:'Checking account…' };
const googleAccount = createGoogleAccount((next) => {
  accountState = next;
  if (state.view === 'account') paintAccount();
});

const icons = {
  next: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m15 5-7 7 7 7"/>',
  play: '<path fill="currentColor" stroke="none" d="M7 4.6 19 12 7 19.4z"/>',
  pause: '<path stroke-width="3" d="M8.2 5v14m7.6-14v14"/>',
  stages: '<circle cx="5" cy="18" r="1.5"/><circle cx="12" cy="11" r="1.5"/><circle cx="19" cy="5" r="1.5"/><path d="m6 17 5-5m2-2 5-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  score: '<path d="M7 3h10v5c0 4-2 7-5 7S7 12 7 8zM3 5h4v5c-3 0-4-2-4-5zm18 0h-4v5c3 0 4-2 4-5zM12 15v5m-4 1h8"/>',
  ship: '<path d="m12 3 3.5 9 5 4.6V20l-5-2-3.5 3-3.5-3L3.5 20v-3.4l5-4.6L12 3Z"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16M9 4v4m7 2v4m-7 2v4"/>',
  more: '<path stroke-width="2.8" stroke-linecap="round" d="M5 12h.01m6.99 0h.01m6.99 0h.01"/>',
  account: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>',
  salvage: '<path d="M5.5 4h13l4 8-4 8h-13l-4-8zM5.5 4 9 12l-3.5 8m13-16L15 12l3.5 8M9 12h6"/>',
  barrier: '<path d="M12 3 20 6v5c0 4-3 8-8 10-5-2-8-6-8-10V6zM12 7v9"/>',
  overdrive: '<path d="m13 3-8 11h6l-1 7 9-12h-6z"/>',
  repair: '<path d="M12 4v16M4 12h16" stroke-width="3"/>',
  power: '<path d="m3 16 4-8 4 8m2 0 4-8 4 8"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  endless: '<path d="M9 10c-1.7-2.2-5.8-3.3-7 .3-1.2 3.4 2.4 6.6 5.6 3.9l8.9-6.6c3.2-2.7 6.8.5 5.6 3.9-1.1 3.6-5.3 2.5-7 .3"/>',
  arrowout: '<path d="M12 4h8v8m0-8-9 9m7 2v5H4V6h5"/>',
  edit: '<path d="m15 5 4 4M5 15l-1 5 5-1L20 8l-4-4Z"/>',
  book: '<path d="M4 5h6l2 2 2-2h6v13h-6l-2 2-2-2H4zM12 7v13"/>',
  reroll: '<path d="M20 4v6h-6M4 20v-6h6M4 9a8 8 0 0 1 14-3l2 4m0 5a8 8 0 0 1-14 3l-2-4"/>'
};
const icon = (name, cls = '') => `<svg aria-hidden="true" viewBox="0 0 24 24" class="icon ${cls}">${icons[name] ?? ''}</svg>`;
const format = new Intl.NumberFormat();
const num = (value) => format.format(value);
const percent = new Intl.NumberFormat(undefined, { style:'percent', maximumFractionDigits:2 });
const time = (value) => {
  const t = Math.max(0, Math.floor(value));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const media = (name) => new URL(`./media/${name}`, import.meta.url).href;
const chapter = (id) => String(id).padStart(2, '0');

function action(label, method, style = 'quiet', glyph = 'next', attributes = '') {
  return `<button type="button" class="${style}" data-action="${method}" ${attributes}><span>${label}</span>${glyph ? icon(glyph) : ''}</button>`;
}

function saveNotice() {
  return store.temporary ? `<aside class="notice save-notice"><span role="status">Progress is temporary until device saving returns.</span>
    <button class="toggle" data-action="recover">Retry storage</button></aside>` : '';
}

function screen(title, back, content, end = '') {
  return `<article class="screen"><header class="screen-header"><div class="topline">
    <button type="button" class="back" data-action="view:${back}">${icon('back')} Back</button>${end}</div>
    <h1 tabindex="-1">${title}</h1></header>${saveNotice()}${content}</article>`;
}

function wallet() {
  return `<span class="balance">${icon('salvage')} ${num(state.pilot.salvage)} Salvage</span>`;
}

function playMission() {
  const next = nextMission(state.pilot);
  if (next && !requiresPurchase(next.id)) return next;
  if (next && requiresPurchase(next.id)) return STAGES[FREE_MISSIONS - 1];
  return STAGES.at(-1);
}

function home() {
  const callSign = normalizeCallSign(state.pilot.callSign);
  const ship = SHIPS[state.pilot.ship].name;
  const mission = playMission();
  const upgradeAvailable = Object.keys(UPGRADES).some((key) => canInstall(state.pilot, key));
  const replay = Boolean(state.pilot.clears[mission.id]);
  return `<article class="title-screen"><h1 tabindex="-1" class="brand-lockup"><img src="${media('brand/title-wordmark.png')}" alt="Stellar Rebels" width="768" height="310"></h1>
    <canvas class="title-patrol" aria-hidden="true"></canvas>
    <button type="button" class="title-ship" data-action="hangar:home" aria-label="Open Hangar for ${ship}"></button>
    <div class="title-actions">${saveNotice()}
      <div class="title-mission"><span id="title-mission-label"><small>${replay ? 'Replay' : `Mission ${chapter(mission.number)}`}</small><strong>${mission.name}</strong></span>
        <button type="button" class="title-salvage" data-action="shop:home" aria-label="${num(state.pilot.salvage)} Salvage. Open upgrades.">${icon('salvage')} ${num(state.pilot.salvage)}</button>
      </div>
      ${action('Play', 'fly:next', 'primary', 'play', 'aria-describedby="title-mission-label"')}
      <div class="title-pilot">
        <button type="button" class="title-id" data-action="view:callSign" aria-label="Edit call sign" aria-describedby="title-call-sign">
          <span><small>Call sign</small><strong id="title-call-sign">${callSign || 'Set call sign'}</strong></span>${icon('edit')}
        </button>
        <button type="button" class="title-equipped" data-action="hangar:home" aria-label="Change ship. ${ship} equipped"><small>Equipped</small><strong>${ship}</strong></button>
      </div>
      <nav class="home-links" aria-label="Game options">
        <button class="home-link" data-action="campaign:standard">${icon('stages')} Campaign</button>
        <button class="home-link" data-action="hangar:home">${icon('ship')} Hangar</button>
        <button class="home-link" data-action="shop:home" ${upgradeAvailable ? 'aria-describedby="hangar-upgrade-notice"' : ''}>${icon('power')} Upgrades
          ${upgradeAvailable ? '<span class="hangar-upgrade-badge" aria-hidden="true">!</span>' : ''}</button>
        <button class="home-link" data-action="view:more">${icon('more')} More</button>
      </nav>${upgradeAvailable ? '<span id="hangar-upgrade-notice" class="visually-hidden">Upgrade available to install.</span>' : ''}
      ${action('Help & Legal', 'legal', 'title-help', '')}</div></article>`;
}

function moreView() {
  return screen('More', 'home', `<nav class="more-links" aria-label="More game options">
    ${action('Settings', 'view:settings', 'quiet', 'settings')}
    ${action('Records', 'view:records', 'quiet', 'score')}
    ${action('Account', 'view:account', 'quiet', 'account')}
    ${action('Practice', 'help:more', 'quiet', 'play')}
  </nav>`);
}

function suggestCallSign(previous) {
  const word = callSignWords[Math.floor(Math.random() * callSignWords.length)];
  const value = `${word}-${1 + Math.floor(Math.random() * 24)}`;
  return value === previous ? `${word}-25` : value;
}

function openCallSign(from, launch = null) {
  state.callSign = { from, launch, suggestion:suggestCallSign() };
  show('callSign');
}

function callSignView() {
  const { from, launch, suggestion } = state.callSign;
  const callSign = normalizeCallSign(state.pilot.callSign) || suggestion;
  return screen('Call sign', from, `<form class="call-sign-form" id="call-sign-form">
    <label for="call-sign">Pilot call sign</label>
    <div class="call-sign-entry">
      <input id="call-sign" name="callSign" value="${callSign}" maxlength="16"
        autocapitalize="characters" autocomplete="off" spellcheck="false" aria-describedby="call-sign-hint call-sign-error">
      ${action('Reroll', 'reroll-call-sign', 'quiet', 'reroll')}
    </div>
    <p class="subtle" id="call-sign-hint">Up to 16 letters, numbers, spaces or hyphens.</p>
    <p class="notice" id="call-sign-error" role="status" hidden></p>
    <button class="primary" type="submit">${launch ? 'Confirm & continue' : 'Save call sign'} ${icon('check')}</button>
  </form>`);
}

function requiresPurchase(id) {
  return nativeFlight && isPaidMission(stageById(id)) && !state.commerce.owned;
}

function isPaidMission(mission) {
  return mission?.side ? mission.act > 1 : mission?.number >= firstPaidMission;
}

function tierTotal(tiers) {
  return Object.values(tiers ?? {}).reduce((sum, tier) => sum + tier, 0);
}

function loadoutContext(pilot) {
  const special = SPECIALS[pilot.special]?.name ?? SPECIALS.ghost.name;
  const mods = tierTotal(pilot.tiers);
  return `${special} · ${mods ? `${mods} upgrade tier${mods === 1 ? '' : 's'}` : 'Stock'}`;
}

function stages() {
  const { pilot, campaignVariant:variant } = state;
  const veteran = variant === 'veteran';
  const clears = veteran ? pilot.veteranClears : pilot.clears;
  const mastery = veteran ? pilot.veteranMastery : pilot.mastery;
  const next = nextMission(pilot, variant);
  const missions = ACTS.map(({id, name}) => {
    const rows = STAGES.filter((stage) => stage.act === id).map((mission) =>
      missionRow(mission, clears, mastery, variant, next?.id)).join('');
    const operations = SIDE_OPERATIONS.filter((mission) => mission.act === id);
    return `<section class="campaign-act" aria-labelledby="act-${id}"><header><small>Act ${['I','II','III'][id - 1]}</small><h2 id="act-${id}">${name}</h2></header>
      <ol class="stage-list" start="${(id - 1) * 5 + 1}">${rows}</ol>
      ${veteran ? '' : operationList(operations)}</section>`;
  }).join('');
  const survival = loadoutBest(pilot, null);
  const veteranReady = hasVeteran(pilot) && !requiresPurchase(STAGES.at(-1).id);
  const endlessReady = hasEndless(pilot) && (!requiresPurchase(STAGES.at(-1).id) || pilot.legacy?.endlessQualified === true);
  const context = veteran ? 'More demanding formations and attack patterns.' : 'Complete Standard to unlock Veteran and Endless.';
  const storyAction = STORY_BEATS.some(storyAvailable) ? action('Story log', 'view:storyLog', 'quiet', 'book') : '';
  return screen(veteran ? 'Veteran Campaign' : 'Campaign', 'home', `
    <div class="campaign-options" role="group" aria-label="Campaign activities">
      ${action('Practice', 'help:stages', 'quiet', 'play')}
      ${storyAction}
    </div>
    ${veteranReady ? `<div class="campaign-options" role="group" aria-label="Campaign difficulty">
      ${action('Standard', 'campaign:standard', 'hangar-tab', '', `aria-pressed="${!veteran}"`)}
      ${action('Veteran', 'campaign:veteran', 'hangar-tab', '', `aria-pressed="${veteran}"`)}
    </div>` : ''}
    <div class="cardline"><div class="stage-loadout"><strong>${SHIPS[pilot.ship].name}</strong><small>${loadoutContext(pilot)}</small></div><button data-action="hangar:stages">Change ship ${icon('next')}</button></div>
    ${missions}
    <div class="campaign-postgame"><div class="endless-entry">${action('Endless', 'fly:endless', 'quiet', endlessReady ? 'endless' : 'lock', `aria-describedby="endless-note" ${endlessReady ? '' : 'disabled'}`)}
    <small id="endless-note">${endlessReady ? survival ? `${time(survival.duration)} loadout best` : 'Survival record' : 'Unlocks after the Standard campaign'}</small></div>
    ${!veteranReady || veteran ? `<p class="subtle">${context}</p>` : ''}</div>`, wallet());
}

function missionRow(mission, clears, mastery, variant, next) {
  const pilot = state.pilot;
  const paid = requiresPurchase(mission.id);
  const playable = hasStage(pilot, mission.id, variant);
  const clear = Boolean(clears[mission.id]);
  const mastered = Boolean(mastery?.[mission.mastery?.key ?? mission.id]);
  const record = playable && !paid ? loadoutBest(pilot, mission.id, variant) : null;
  const prerequisite = mission.side ? STAGES[mission.requires - 1]?.name : STAGES[mission.number - 2]?.name;
  const note = clear ? `Cleared${mastered ? ' · Mastered' : ''}${record?.status === 'clear' ? ` · ${num(record.score)} best` : ''}`
    : playable ? mission.objective ?? mission.region : `Clear ${prerequisite ?? 'the previous mission'}`;
  const tag = paid ? `${icon('lock')} Full game` : playable ? clear ? `${icon('check')} Replay` : 'Launch' : `${icon('lock')} Locked`;
  const fly = variant === 'veteran' ? 'fly-veteran' : 'fly';
  return `<li><button class="stage ${paid ? 'stage-purchase' : mission.id === next ? 'next' : ''}" style="--stage-color:${mission.accent}"
    data-action="${fly}:${mission.id}" ${playable || (paid && !mission.side) ? '' : 'disabled'}>
    <span class="stage-num">${mission.side ? mission.code : chapter(mission.number)}</span>
    <span><span class="stage-name">${mission.name}</span><span class="stage-note">${note}</span></span>
    <span class="stage-tag">${tag}</span></button></li>`;
}

function operationList(operations) {
  const { pilot, pending } = state;
  const available = operations.filter((mission) =>
    hasStage(pilot, mission.id) && !requiresPurchase(mission.id) && !pilot.sideClears[mission.id]).length;
  const clears = operations.filter((mission) => pilot.sideClears[mission.id]).length;
  const activity = available ? `${available} available` : `${clears}/${operations.length} cleared`;
  const last = stageById(pending?.run.stage);
  const showOperations = operations.some((mission) => last?.side && last.id === mission.id);
  return `<details class="side-operations" ${showOperations ? 'open' : ''}><summary><span>Side Operations</span><small>${activity}</small></summary>
    <ul class="stage-list" aria-label="Optional operations">
      ${operations.map((mission) => missionRow(mission, pilot.sideClears, pilot.sideMastery, 'standard', null)).join('')}
    </ul></details>`;
}

function hangar() {
  const { pilot } = state;
  const tabs = `<div class="dock-tabs" role="group" aria-label="Hangar sections">
    ${[['ships', 'Ship bay'], ['upgrades', 'Upgrades'], ['specials', 'Specials']].map(([key, name]) =>
      action(name, `tab:${key}`, 'hangar-tab', '', `aria-pressed="${state.hangarTab === key}"`)).join('')}</div>`;
  if (state.hangarTab === 'specials') {
    const choices = Object.entries(SPECIALS).map(([key, special]) => {
      const equipped = pilot.special === key;
      const choose = hasSpecial(pilot, key)
        ? action(equipped ? 'Equipped' : 'Equip', `special:${key}`, 'quiet', equipped ? 'check' : '', `aria-label="Equip ${special.name}" aria-pressed="${equipped}"`)
        : `<p class="special-lock">${icon('lock')} Clear ${stageById(special.clearance).name} to unlock.</p>`;
      return `<section class="info special-choice"><div class="special-heading"><h2>${special.name}</h2>
        <span class="caption">${special.cost} energy</span></div><p class="subtle">${special.description}</p>${choose}</section>`;
    }).join('');
    return screen('Hangar', state.hangarBack, tabs + `<div class="special-options">${choices}</div>`, wallet());
  }
  const craft = SHIPS[state.inspected];
  const owned = hasShip(pilot, state.inspected);
  const active = pilot.ship === state.inspected;
  if (state.hangarTab === 'upgrades') return screen('Upgrades', state.hangarBack, tabs + shopTracks(), wallet());
  const selection = Object.entries(SHIPS).map(([key, ship]) => {
    const copy = key === pilot.ship ? 'Equipped' : hasShip(pilot, key) ? ship.role : `Clear ${chapter(stageById(ship.clearance).number)}`;
    return `<button class="craft-choice" data-action="inspect:${key}" aria-pressed="${key === state.inspected}">${ship.name}<small>${copy}</small></button>`;
  }).join('');
  const bay = `<div class="turntable"><span class="pad"></span><img class="craft-art" src="${spriteUrl(state.inspected)}" alt="${craft.name}" width="240" height="240"></div>
    <div class="ship-identity"><h2>${craft.name}</h2>${craft.name === craft.role ? '' : `<span class="caption">${craft.role}</span>`}</div><p class="subtle">${craft.description}</p>
    <p class="subtle crew-note">Three-person strikecraft configuration.</p>
    <div class="craft-specs"><span>${craft.hull} hull</span><span>${craft.speed >= 370 ? 'Agile' : craft.speed < 280 ? 'Heavy' : 'Balanced'} handling</span></div>
    <div class="craft-grid" role="group" aria-label="Available ships">${selection}</div>
    ${owned ? action(active ? 'Equipped' : `Equip ${craft.name}`, `equip:${state.inspected}`, active ? 'quiet' : 'primary', active ? 'check' : 'next', active ? 'disabled' : '') : `<div class="notice">Clear ${stageById(craft.clearance)?.name ?? `stage ${craft.clearance}`} to unlock ${craft.name}.</div>`}`;
  return screen('Hangar', state.hangarBack, tabs + bay, wallet());
}

function upgradeText(key, benefit) {
  const names = { damage:'shot damage', rate:'fire rate', thrusters:'maximum speed', energy:'energy regeneration' };
  return `+${percent.format(benefit)} ${names[key]}`;
}

function shopTracks() {
  return `<div class="shop-list">${Object.entries(UPGRADES).map(([key, item]) => {
    const { tier, limit, nextCost, nextBenefit, affordable, available } = upgradeStatus(state.pilot, key);
    const cost = nextCost === null ? 'Complete' : `${num(nextCost)} Salvage`;
    return `<button class="shop-card" data-action="upgrade:${key}">${icon(item.icon ?? 'power', 'icon-large')}<span>
      <strong>${item.name}</strong><small>Tier ${tier}/15 · Unlocked to ${limit}</small>
      ${nextBenefit === null ? '' : `<small>Next tier ${upgradeText(key, nextBenefit)}</small>`}
      <span class="tier-bar" aria-hidden="true" style="--tier:${tier / 15};--unlocked-tier:${limit / 15}"></span></span>
      <span class="price" data-affordable="${affordable}">${cost}${nextCost !== null && !available ? '<small>Locked</small>' : ''}</span></button>`;
  }).join('')}</div>`;
}

function upgradeView() {
  const key = state.upgrade;
  const target = UPGRADES[key];
  const p = state.pilot;
  const { tier, limit, nextCost, installedBenefit, nextBenefit, affordable, available } = upgradeStatus(p, key);
  const finished = nextCost === null;
  const condition = finished ? 'All tiers installed.' : !available ? `Clear Mission ${limit} to open Tier ${tier + 1}.`
    : !affordable ? `Earn ${num(nextCost - p.salvage)} more Salvage.` : `${num(p.salvage - nextCost)} Salvage left after installation.`;
  return screen(target.name, 'hangar', `<div class="notice"><strong>Tier ${tier}/15</strong>
      <p>${tier ? upgradeText(key, installedBenefit) : 'Stock configuration'}. Unlocked to Tier ${limit}.</p>
      ${finished ? '' : `<p>Tier ${tier + 1} adds ${upgradeText(key, nextBenefit)}.</p>`}<p>${condition}</p></div>
    ${action(finished ? 'Complete' : `Install Tier ${tier + 1} · ${num(nextCost)} Salvage`, 'install', 'primary', 'check', canInstall(p, key) ? '' : 'disabled')}`, wallet());
}

function recordLine(title, copy, value) {
  return `<div class="record"><div><strong>${title}</strong><small>${copy}</small></div><span>${value}</span></div>`;
}

function recordVersion(record) {
  return Number(/^arcade-(\d+)$/.exec(record.rules)?.[1] ?? 0);
}

function recordContext(record) {
  const assistance = [];
  if (record.assistance?.reduced) assistance.push('Reduced motion');
  if (record.assistance?.contrast) assistance.push('High contrast');
  if (['gentle', 'direct'].includes(record.assistance?.sensitivity)) assistance.push(`${record.assistance.sensitivity} drag`);
  const names = { rails:'Calibrated Rails', chamber:'Cycling Chamber', cells:'Resonant Cells', hull:'Ablative Hull' };
  const current = Object.keys(UPGRADES).flatMap((key) => record.tiers?.[key] ? [`${UPGRADES[key].name} ${record.tiers[key]}`] : []);
  const legacy = (record.equipment ?? []).flatMap((key) => names[key] ? [names[key]] : []);
  const mods = [...current, ...legacy].join(', ') || 'Stock';
  const notes = [SHIPS[record.ship]?.name ?? 'Fighter', SPECIALS[record.special]?.name ?? SPECIALS.ghost.name, mods, ...assistance];
  if (record.stage === 5 && record.rules === 'arcade-1') notes.push('Original route · Gravity Platform');
  const version = recordVersion(record);
  notes.push(record.rules === RULES_VERSION ? 'Current rules' : version ? `Earlier rules ${version}` : 'Earlier rules');
  return notes.join(' · ');
}

function recordStageName(stage, record) {
  if (record.rules === RULES_VERSION) return stage.name;
  const legacyNames = { 1:'Vesper Orbit', 2:'Asteroid Belt', 3:'Relay Station', 4:'Red Sun',
    5:record.rules === 'arcade-1' ? 'Gravity Platform' : 'Outer Orbit', 6:'The Flagship' };
  return legacyNames[stage.id] ?? stage.name;
}

function records() {
  const { pilot } = state;
  const { arcade, veteran = {}, side = {}, endless, history = {} } = pilot.records;
  const counts = completionCounts(pilot);
  const rank = pilotRank(pilot.lifetimeXp);
  const profile = `<section class="pilot-summary" aria-labelledby="pilot-record-name">
    <div class="profile-caption"><span class="caption">Pilot profile</span>${action('Edit call sign', 'view:callSign', 'profile-edit', 'edit')}</div>
    <h2 id="pilot-record-name">${normalizeCallSign(pilot.callSign) || 'Pilot'}</h2><p class="pilot-rank">${rank.name}</p>
    <dl class="profile-stats"><div><dt>Lifetime XP</dt><dd>${num(pilot.lifetimeXp)}</dd></div>
      <div><dt>Main campaign</dt><dd>${counts.main} / ${counts.mainLimit}</dd></div>
      <div><dt>Side Operations</dt><dd>${counts.side} / ${counts.sideLimit}</dd></div>
      <div><dt>Total cleared</dt><dd>${counts.total} / ${counts.totalLimit}</dd></div></dl>
    ${rank.nextXp ? `<p class="subtle">${num(rank.nextXp - pilot.lifetimeXp)} XP to next rank</p>` : ''}
  </section>`;
  const rows = ['standard', 'veteran'].flatMap((variant) => (variant === 'standard' ? [...STAGES, ...SIDE_OPERATIONS] : STAGES).map((s) => {
    const best = loadoutBest(pilot, s.id, variant);
    if (!best) return '';
    return recordLine(s.name, `${variant === 'veteran' ? 'Veteran · ' : s.side ? 'Side Operation · ' : ''}${best.status === 'clear' ? 'Clear' : 'Best attempt'} · ${time(best.duration)}`, num(best.score));
  })).join('');
  const bestSurvival = loadoutBest(pilot, null);
  const survival = bestSurvival ? recordLine('Endless survival', `${num(bestSurvival.score)} points`, time(bestSurvival.duration)) : '';
  const archived = Object.values(history);
  const careerRows = [...STAGES, ...SIDE_OPERATIONS].flatMap((s) => [arcade[s.id], veteran[s.id], side[s.id], ...archived.filter((r) => r.mode === 'arcade' && r.stage === s.id)]
    .filter(Boolean).sort((a, b) => recordVersion(b) - recordVersion(a))
    .map((r) => recordLine(recordStageName(s, r), `${r.variant === 'veteran' ? 'Veteran · ' : s.side ? 'Side Operation · ' : ''}${r.status === 'clear' ? 'Cleared' : 'Best attempt'} · ${time(r.duration)} · ${recordContext(r)}`, num(r.score)))).join('');
  const careerSurvival = [endless, ...archived.filter((r) => r.mode === 'endless')].filter(Boolean)
    .sort((a, b) => recordVersion(b) - recordVersion(a))
    .map((r) => recordLine('Endless survival', `${num(r.score)} points · ${recordContext(r)}`, time(r.duration))).join('');
  const career = careerRows || careerSurvival ? `<details class="career-records" ${rows || survival ? '' : 'open'}><summary>Career records</summary>
    <div class="career-list">${careerRows}${careerSurvival}</div></details>` : '';
  const earned = [...STAGES, ...SIDE_OPERATIONS].flatMap((s) => {
    if (!s.mastery) return [];
    const key = s.mastery.key ?? s.id;
    return [(s.side ? pilot.sideMastery : pilot.mastery)?.[key] ? s.mastery.name : '', !s.side && pilot.veteranMastery?.[key] ? `${s.mastery.name} · Veteran` : ''].filter(Boolean);
  });
  const legacy = Object.keys(pilot.legacy?.mastery ?? {}).filter((key) => pilot.legacy.mastery[key]).length;
  const mastery = earned.length || legacy ? `<section class="record-heading" aria-labelledby="record-mastery">
    <h2 id="record-mastery">Mastery</h2><ul class="mastery-list">${earned.map((name) => `<li>${name}</li>`).join('')}
    ${legacy ? `<li>${num(legacy)} earned on the original campaign</li>` : ''}</ul></section>` : '';
  return screen('Records', 'more', `${profile}<div class="record-heading"><h2>Current loadout</h2><p class="subtle">${SHIPS[pilot.ship].name} · ${loadoutContext(pilot)} · Current rules</p></div>
    ${rows || survival ? rows + survival : '<p class="subtle">Fly with this loadout to set a record.</p>'}${mastery}${career}`);
}

const settings = {
  music: ['Music', 'Hangar and flight tracks'], effects: ['Sound effects', 'Weapons, hits, pickups and warnings'],
  haptics: ['Vibration', 'Short pulses for hits and abilities'],
  reduced: ['Reduced motion', 'Steady camera and fewer flashes'], contrast: ['High contrast hazards', 'Brighter projectile centers and warning outlines'],
  skipStory: ['Skip story', 'Skip automatic story scenes. Replay them through Campaign.']
};

const controlLabels = {
  stickSize: 'Joystick size',
  specialSize: 'Ability button size',
  specialHorizontal: 'Ability button horizontal position',
  specialVertical: 'Ability button height'
};

function controlStyles({ stickSize, specialSize, specialHorizontal, specialVertical }) {
  return {
    '--stick-size': `${stickSize}px`,
    '--special-size': `${specialSize}px`,
    '--special-inline': specialHorizontal / 100,
    '--special-rise': specialVertical / 100
  };
}

function applyControlStyles(element, layout) {
  for (const [name, value] of Object.entries(controlStyles(layout))) element.style.setProperty(name, value);
}

function touchSettings(preferences) {
  const layout = touchControlLayout(preferences);
  const steering = usesFloatingStick(preferences) ? 'stick' : 'drag';
  const preview = Object.entries(controlStyles(layout)).map(([key, value]) => `${key}:${value}`).join(';');
  const ranges = Object.entries(TOUCH_CONTROL_RANGES).map(([key, { min, max }]) => `
    <label class="control-range" for="${key}"><span>${controlLabels[key]}</span>
      <input id="${key}" type="range" min="${min}" max="${max}" value="${layout[key]}" ${key === 'stickSize' && steering === 'drag' ? 'disabled' : ''}></label>`).join('');
  return `<section class="touch-settings" aria-label="Touch controls">
    <div class="setting"><div><strong>Touch steering</strong><small>Choose how the ship follows your touch</small></div>
      <select class="toggle" id="steering" aria-label="Touch steering">
        <option value="drag">Finger drag</option><option value="stick" ${steering === 'stick' ? 'selected' : ''}>Floating joystick</option></select></div>
    <div class="setting" data-drag-sensitivity ${steering === 'stick' ? 'hidden' : ''}><div><strong>Drag sensitivity</strong><small>Changes how far the ship follows a swipe</small></div>
      <select class="toggle" id="sensitivity" aria-label="Drag sensitivity" ${steering === 'stick' ? 'disabled' : ''}>
        ${['Gentle', 'Standard', 'Direct'].map((label) => {
          const value = label.toLowerCase();
          return `<option value="${value}" ${preferences.sensitivity === value ? 'selected' : ''}>${label}</option>`;
        }).join('')}</select></div>
    <div class="controls-preview" data-steering="${steering}" style="${preview}" aria-hidden="true">
      <span class="preview-stick" ${steering === 'drag' ? 'hidden' : ''}></span><span class="preview-special">Ability</span></div>
    <div class="control-adjustments">${ranges}</div></section>`;
}

function previewTouchSettings(group) {
  const steering = group.querySelector('#steering').value;
  const preview = group.querySelector('.controls-preview');
  preview.dataset.steering = steering;
  preview.querySelector('.preview-stick').hidden = steering === 'drag';
  group.querySelector('#stickSize').disabled = steering === 'drag';
  group.querySelector('[data-drag-sensitivity]').hidden = steering === 'stick';
  group.querySelector('#sensitivity').disabled = steering === 'stick';
  const layout = Object.fromEntries(Object.keys(TOUCH_CONTROL_RANGES).map((key) => [key, group.querySelector(`#${key}`).valueAsNumber]));
  applyControlStyles(preview, layout);
}

function settingsView() {
  const prefs = appearance(state.pilot.settings);
  const switches = Object.entries(settings).filter(([key]) => key !== 'haptics' || hapticAvailable).map(([key, [label, copy]]) => {
    const systemMotion = key === 'reduced' && reduced.matches;
    const on = key === 'haptics' ? prefs.haptics !== false : prefs[key];
    return `<div class="setting"><span><strong>${label}</strong><small>${systemMotion ? 'On in your device settings' : copy}</small></span>
      <button class="toggle" data-action="toggle:${key}" aria-label="${label}" aria-pressed="${on}" ${systemMotion ? 'disabled' : ''}>${on ? 'On' : 'Off'}</button></div>`;
  }).join('');
  return screen('Settings', 'more', `<nav class="settings-shortcuts" aria-label="Help and purchases">
    ${action('Help & Legal', 'legal', 'quiet', '')}
    ${nativeFlight ? action('Full Game Unlock', 'commerce:show', 'quiet', '') : ''}</nav>
    ${switches}${touchSettings(prefs)}
    <div class="notice" id="pack-status" role="status">${packCopy()}</div>${state.installed ? '' : '<p class="subtle">Install from your browser menu or Add to Home Screen in Safari.</p>'}
    ${action('Edit call sign', 'view:callSign', 'quiet', 'edit')}
    ${action('Practice', 'help:settings', 'quiet')}${state.support ? `<p class="notice">${state.support}</p>` : ''}`);
}

function legalHub() {
  return screen('Help & Legal', state.legalFrom.view, `<nav class="legal-links" aria-label="Help and legal information">
    ${action('Privacy Policy', 'policy:privacy')}${action('Terms of Use', 'policy:terms')}${action('Support', 'policy:support')}
    ${nativeFlight ? action('Purchases & Restore', 'commerce:show') : ''}
  </nav>${nativeFlight ? `<div class="rating-entry">
    ${action('Rate the App', 'rate-app', 'quiet', 'arrowout', 'id="rate-app" aria-describedby="rating-status" disabled')}
    <p class="subtle" id="rating-status" role="status"></p>
  </div>` : ''}`);
}

function escapePolicy(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function policyParagraph({ text, email, link, linkText }) {
  const contact = email ? ` <span class="policy-address">${escapePolicy(email)}</span>` : '';
  let reference = '';
  if (link && /^https:\/\//.test(link)) {
    reference = nativeFlight ? ` <span class="policy-address">${escapePolicy(link)}</span>`
      : ` <a class="policy-address" href="${escapePolicy(link)}" target="_blank" rel="noopener noreferrer">${escapePolicy(linkText ?? link)}</a>`;
  }
  return `<p class="subtle">${escapePolicy(text)}${contact}${reference}</p>`;
}

function policyPage(name) {
  const page = helpPages[name];
  const platformSections = nativeFlight ? page.nativeSections : page.webSections;
  const sections = [...(platformSections ?? []), ...page.sections];
  const blocks = sections.map(({ heading, paragraphs }) => `<section class="info policy-section">
    <h2>${escapePolicy(heading)}</h2>${paragraphs.map(policyParagraph).join('')}
  </section>`).join('');
  return screen(escapePolicy(page.title), state.policyFrom.view,
    `${page.updated ? `<p class="caption">${escapePolicy(page.updated)}</p>` : ''}${page.intro ? `<p class="subtle">${escapePolicy(page.intro)}</p>` : ''}${blocks}`);
}

function paintRating() {
  const button = $('rate-app');
  if (!button) return;
  const { available, message } = state.rating;
  button.disabled = available !== true;
  $('rating-status').textContent = message || (available === null ? 'Checking store availability…'
    : available ? '' : 'Rating becomes available when the store listing opens.');
}

async function refreshRating() {
  const status = await nativeCommerce?.('rating-status').catch(() => null);
  state.rating.available = status?.available === true;
  paintRating();
}

async function rateApp() {
  const response = await nativeCommerce?.('rate-app').catch(() => null);
  if (response?.result === 'opened') state.rating.message = '';
  else if (response?.result === 'unavailable') {
    state.rating.available = false;
    state.rating.message = '';
  } else state.rating.message = 'Could not open the store. Try again when you are connected.';
  paintRating();
}

function accountView() {
  if (!googleSignInAvailable) {
    return screen('Account', 'more', `<div class="info account-panel">
      <strong>Guest pilot</strong>
      <p class="subtle">${nativeFlight ? 'Google sign-in is available in the browser. Your app progress stays on this device.' : 'Open the online game to sign in with Google. You can keep playing as a guest here.'}</p>
      ${nativeFlight ? action('Open browser account', 'account:browser', 'quiet', 'arrowout') + '<p id="account-browser-status" class="subtle" role="status" hidden></p>' : ''}
    </div>`);
  }
  return screen('Account', 'more', `<div class="info account-panel">
    <p class="subtle">Sign-in is optional. Scores, Salvage and upgrades stay in this browser.</p>
    <p id="account-status" class="subtle" role="status" tabindex="-1"></p>
    <button type="button" class="google-sign-in" data-action="account:sign-in" aria-label="Sign in with Google" hidden>
      <img src="${media('brand/google-sign-in.png')}" width="180" height="40" alt="">
    </button>
    ${action('Sign out', 'account:sign-out', 'quiet', '', 'hidden')}
    ${action('Retry connection', 'account:retry', 'quiet', '', 'hidden')}
  </div>`);
}

function paintAccount() {
  const status = $('account-status');
  if (!status) return;
  status.textContent = accountState.notice;
  for (const [command, phase] of [['sign-in', 'guest'], ['sign-out', 'connected'], ['retry', 'retry']]) {
    const button = menu.querySelector(`[data-action="account:${command}"]`);
    const hide = accountState.phase !== phase;
    if (hide && document.activeElement === button) status.focus({ preventScroll: true });
    button.hidden = hide;
  }
  menu.querySelector('.back').disabled = accountState.phase === 'signing-in';
}

function helpView() {
  const equipped = SPECIALS[state.pilot.special] ?? SPECIALS.ghost;
  const rows = [
    ['Steering', state.pilot.settings.steering === 'stick'
      ? 'Touch anywhere on the playfield and hold away from the center of the stick to move. Arrow keys and WASD also steer.'
      : 'Drag anywhere on the playfield. Lift and touch again to reanchor. Try Floating joystick in Settings. Arrow keys and WASD also steer.'],
    ['Line up your shots', 'Weapons fire automatically. Aim by placing your ship beneath the target.'],
    ['Energy', 'Start each flight with full energy. It recharges over time when you aren’t phasing. Hits and kills charge it faster.'],
    ['Specials', 'Equip a Special in the Hangar. Tap its button or press Space. Ghost Shift phases through physical fire for 0.58 seconds. Ion Burst clears nearby physical shots. Afterburner boosts speed. Overcharge boosts damage.'],
    ['Wraith realms', 'Tap Hop or press Space to change realms. Match the Wraith’s realm and shoot its marked core. Solid rounds hit physical ships. Hollow diamonds hit ghost ships.'],
    ['Read the warning', 'Leave striped beam lanes. Fly through the opening between the rocks.'],
    ['Watch the edges', 'Some surviving fighters circle up the side and return in a different lane. They keep any damage you dealt.'],
    ['Break the modules', 'Shoot hardpoints framed by corner brackets. A crossed-out module is offline.'],
    ['Break a formation', 'Target the bracketed command relay. Stop its volley and hit the exposed wing before it recovers.'],
    ['Expose shielded escorts', 'Follow the solid blue links to the Command Ship. Destroy it to drop the escorts’ shields.'],
    ['Supplies', 'Destroy marked enemies to release their supplies.'],
    ...Object.values(PICKUPS).map((drop) => [drop.name, drop.hint])
  ];
  return screen('Practice', state.helpBack, action('Flight basics', 'practice:basics', 'primary', 'play') +
    action(`${equipped.name} drill`, 'practice:special', 'quiet', 'play') +
    rows.map(([title, text]) => `<div class="info"><strong>${title}</strong><p class="subtle">${text}</p></div>`).join(''));
}

function resultComparison(receipt) {
  if (!receipt?.loadout) return '';
  const { previous, improved } = receipt.loadout;
  const endless = receipt.mode === 'endless';
  if (!previous) return endless ? 'First survival result' : receipt.status === 'clear' ? 'First clear with this loadout' : '';

  if (endless && receipt.duration !== previous.duration) {
    const difference = Math.abs(receipt.duration - previous.duration);
    const span = `${num(difference)} second${difference === 1 ? '' : 's'}`;
    return improved ? `New survival best · ${span} longer` : `${span} short of your survival best`;
  }
  if (receipt.status !== previous.status) {
    return receipt.status === 'clear' ? 'First clear with this loadout' : `Loadout best on a clear · ${num(previous.score)} points`;
  }
  const difference = receipt.score - previous.score;
  const points = `${num(Math.abs(difference))} point${Math.abs(difference) === 1 ? '' : 's'}`;
  if (endless) {
    if (!difference) return 'Matched your survival best';
    return improved ? `Same survival time · +${points}` : `Same survival time · ${points} short`;
  }
  const best = receipt.status === 'clear' ? 'loadout best' : 'best attempt';
  if (!difference) return `Matched your ${best}`;
  return improved ? `New ${best} · +${points}` : `${points} short of your ${best}`;
}

function results() {
  const p = state.pending;
  const report = p.receipt ?? p.terminal;
  const clear = report.status === 'clear';
  const isEndless = p.run.mode === 'endless';
  const variant = p.run.variant ?? 'standard';
  const veteran = variant === 'veteran';
  const stage = stageById(p.run.stage, variant);
  const finale = clear && stage?.number === STAGES.length;
  const relayCleared = clear && stage?.number === FREE_MISSIONS;
  const side = stage?.side === true;
  const next = p.receipt && clear && stage && !side && nextStage(stage.id);
  const preview = next && requiresPurchase(next.id);
  const firstUnlockOffer = preview && p.receipt.first && !store.temporary;
  const objectiveMissed = !clear && p.terminal.damageCause?.startsWith('objective-');
  let title = clear ? 'Mission clear' : 'Flight lost';
  if (finale) title = veteran ? 'Veteran complete' : 'Fleet defeated';
  else if (relayCleared) title = 'Relay offline';
  else if (isEndless) title = 'Run complete';
  else if (side) title = clear ? 'Operation clear' : objectiveMissed ? 'Objective missed' : 'Operation lost';
  const repeat = isEndless ? 'Fly again' : clear ? side ? 'Replay operation' : 'Replay mission' : 'Retry';
  const fly = veteran ? 'fly-veteran' : 'fly';
  const retry = `${fly}:${isEndless ? 'endless' : stage.id}`;
  const progression = p.receipt?.award ? `<span class="result-reward">${icon('salvage')} +${num(p.receipt.award)} Salvage ${store.temporary ? 'this session' : 'banked'}</span>` : '';
  const xp = p.receipt?.xpAward ? `<span class="result-xp">+${num(p.receipt.xpAward)} XP</span>` : '';
  const unlocked = [
    p.receipt?.newStage && !requiresPurchase(p.receipt.newStage) ? `${stageById(p.receipt.newStage).name} unlocked` : null,
    p.receipt?.newSpecial ? `${SPECIALS[p.receipt.newSpecial].name} unlocked` : null,
    p.receipt?.rankUp ? `Rank earned · ${p.receipt.rankUp}` : null,
    p.receipt?.campaignWon && !veteran ? 'Veteran Campaign and Endless unlocked' : null,
    ...((p.receipt?.newOperations ?? []).filter((id) => !requiresPurchase(id)).map((id) => `Side Operation unlocked · ${stageById(id).name}`))
  ].filter(Boolean);
  const ship = p.receipt?.newShip ? action(`${SHIPS[p.receipt.newShip].name} unlocked`, `unlocked:${p.receipt.newShip}`, 'quiet', 'ship') : '';
  const pendingCopy = p.discarded ? '<p class="result-warning" role="status">This flight was temporary. Your existing device save is active.</p>'
    : !p.receipt ? `<p class="result-warning" role="status">${p.error || 'Saving flight…'}</p>` : '';
  const buyable = p.receipt && clear && Object.keys(UPGRADES).some((key) => canInstall(state.pilot, key));
  const primary = p.discarded ? action('Return to Campaign', 'view:stages', 'primary')
    : !p.receipt ? (p.error ? action('Retry saving', 'settle', 'primary', 'check') : '')
    : next && !preview ? action('Next Mission', `${fly}:${next.id}`, 'primary', 'next', `aria-label="Next Mission · ${next.name}"`)
      : finale ? action('Return to Campaign', 'view:stages', 'primary') : action(repeat, retry, 'primary');
  const mastery = p.receipt && clear && stage?.mastery ? `<p class="subtle">${p.receipt.mastery ? `Mastery earned · ${stage.mastery.name}`
    : p.receipt.masteryMet ? `Mastery repeated · ${stage.mastery.name}` : ''}</p>` : '';
  const comparison = clear || p.receipt?.loadout?.improved ? resultComparison(p.receipt) : '';
  const secondary = [
    p.receipt && !finale ? action('Campaign', 'view:stages', 'quiet', '') : '',
    p.receipt || p.discarded ? action('Title Screen', 'view:home', 'quiet', '') : '',
    p.receipt && ((next && !preview) || finale) ? action(repeat, retry, 'quiet', '') : '',
    p.receipt ? action(buyable ? 'Upgrades' : 'Hangar', buyable ? 'shop:result' : 'hangar:result', 'quiet', '') : '',
    !p.receipt && p.error ? action('Leave unsaved', 'discard', 'quiet', '') : ''
  ].filter(Boolean);
  return `<article class="screen result-screen" data-outcome="${clear ? 'clear' : 'finished'}">
    <div class="result-card">
      ${saveNotice()}
      <header class="result-heading"><span class="caption">${finale ? 'Campaign complete' : isEndless ? 'Endless' : `${veteran ? 'Veteran · ' : ''}${stage.name}`}</span>
        <h1 tabindex="-1">${title}</h1>
        ${clear && !veteran && stage.resolution ? `<p class="subtle">${escapePolicy(stage.resolution)}</p>` : ''}
      </header>
      <section class="result-facts" aria-label="Flight stats">
        <div class="result-score"><span class="caption">Score</span><strong>${num(report.score)}</strong></div>
        <div><span class="caption">Flight time</span><strong>${time(report.duration)}</strong></div>
        <div><span class="caption">Targets</span><strong>${num(report.kills)}</strong></div>
      </section>
      ${progression || xp || mastery || comparison || unlocked.length || ship ? `<div class="result-earned">
        ${comparison ? `<p class="result-comparison">${comparison}</p>` : ''}
        ${mastery}${progression || xp ? `<p class="result-payout" aria-label="Flight rewards">${progression}${xp}</p>` : ''}
        ${unlocked.length ? `<ul class="result-unlocks">${unlocked.map((label) => `<li>${icon('check')}${label}</li>`).join('')}</ul>` : ''}
        ${ship}
      </div>` : ''}
      ${pendingCopy}${primary}
      ${secondary.length ? `<nav class="result-secondary" aria-label="After the flight">${secondary.join('')}</nav>` : ''}
      ${firstUnlockOffer ? action('See Full Game Unlock', 'commerce:preview', 'flat result-offer', 'lock') : ''}
    </div>
  </article>`;
}

const purchaseMessages = {
  purchased: 'Full Game Unlock confirmed.',
  restored: 'Full Game Unlock restored.',
  cancelled: 'Purchase cancelled.',
  pending: 'Payment is pending. Access unlocks once the store confirms it.',
  nothing: 'No eligible purchase was found for this store account.',
  unavailable: 'The store is unavailable right now. Try again in a moment.',
  failed: 'The store could not complete the request. Try again in a moment.'
};

function commerceView() {
  const { stage } = state.commerceScreen;
  const missions = ACTS.filter(({ id }) => id > 1).flatMap(({id}) =>
    [...STAGES, ...SIDE_OPERATIONS].filter((mission) => mission.act === id)).map((entry) => `<li class="commerce-mission${entry.id === stage ? ' commerce-destination' : ''}" data-environment="${entry.environment}">
    <span class="commerce-thumbnail" aria-hidden="true"></span>
    <span><small>${entry.side ? `Operation ${entry.code}` : `Mission ${entry.number}`}</small><strong>${entry.name}</strong></span>
  </li>`).join('');
  return `<article class="screen commerce-screen">
    <div class="commerce-hero" aria-hidden="true"></div>
    <div class="commerce-card">
      <header class="commerce-heading">
        <h1 tabindex="-1" id="commerce-heading">${state.commerce.owned ? 'Full Game Unlocked' : 'Unlock the Full Game'}</h1>
        <p>Continue into Acts II and III. Fly ten story missions and six optional operations, then face the Emperor.</p>
      </header>
      <div class="commerce-checkout">
        <p class="commerce-payment" id="commerce-payment">One-time purchase</p>
        <p class="commerce-status" id="commerce-status" role="status"></p>
        <button type="button" class="primary" id="commerce-primary" data-action="commerce:purchase" aria-describedby="commerce-price commerce-payment">
          <span>Unlock Full Game</span><strong id="commerce-price" hidden></strong>
        </button>
        <div class="commerce-secondary">
          ${action('Not Now', 'commerce:back', 'quiet', '', 'id="commerce-back"')}
          ${action('Restore Purchases', 'commerce:restore', 'quiet', '', 'id="commerce-restore"')}
        </div>
        <nav class="commerce-policies" aria-label="Purchase policies">
          ${action('Privacy Policy', 'policy:privacy', 'text-action', '')}${action('Terms of Use', 'policy:terms', 'text-action', '')}
        </nav>
      </div>
      <details class="commerce-route"><summary>See the missions and operations</summary>
        <ol class="commerce-missions" aria-label="Full game missions" start="${firstPaidMission}">${missions}</ol>
      </details>
    </div>
  </article>`;
}

function paintCommerce() {
  const { commerce, commerceWork, commerceScreen } = state;
  const busy = Boolean(commerceWork || commerce.busy);
  const { owned, pending } = commerce;
  const stage = stageById(commerceScreen.stage);
  const launchable = stage && hasStage(state.pilot, stage.id);
  const price = $('commerce-price');
  const primary = $('commerce-primary');
  const back = $('commerce-back');
  const restore = $('commerce-restore');
  $('commerce-heading').textContent = owned ? 'Full Game Unlocked' : 'Unlock the Full Game';
  price.textContent = commerce.price;
  price.hidden = owned || !commerce.price;
  $('commerce-payment').hidden = owned;
  primary.dataset.action = owned ? launchable ? `fly:${stage.id}` : 'view:stages' : 'commerce:purchase';
  primary.firstElementChild.textContent = owned ? launchable ? `Launch ${stage.name}` : 'Campaign' : 'Unlock Full Game';
  if (owned) {
    primary.removeAttribute('aria-label');
    primary.removeAttribute('aria-describedby');
  } else {
    primary.setAttribute('aria-label', 'Unlock Full Game');
    primary.setAttribute('aria-describedby', commerce.price ? 'commerce-price commerce-payment' : 'commerce-payment');
  }
  primary.disabled = busy || (!owned && (!commerce.available || pending));
  restore.hidden = owned;
  restore.disabled = busy || !commerce.restoreAvailable;
  back.firstElementChild.textContent = owned ? 'Back' : 'Not Now';

  const message = commerceWork === 'purchase' ? 'Opening the store…' : commerceWork === 'restore' ? 'Checking for a previous purchase…'
    : busy ? 'Waiting for the store…' : commerceScreen.message || (owned ? '' : pending ? purchaseMessages.pending
      : !commerce.ready ? 'Checking the store…' : commerce.available ? '' : 'The purchase price is unavailable right now.');
  $('commerce-status').textContent = message;
}

let commerceRevision = 0;
let latestCommerceRevision = -1;
function updateCommerce(snapshot) {
  if (typeof snapshot?.owned !== 'boolean') return;
  if (Number.isInteger(snapshot.revision)) {
    if (snapshot.revision < latestCommerceRevision) return;
    latestCommerceRevision = snapshot.revision;
  }
  const previous = state.commerce;
  const price = snapshot.available === true && typeof snapshot.price === 'string' ? snapshot.price.trim() : '';
  state.commerce = {
    owned:snapshot.owned, price, ready:true, pending:snapshot.pending === true, busy:snapshot.busy === true,
    available:Boolean(price), restoreAvailable:snapshot.restoreAvailable !== false && Boolean(nativeCommerce)
  };
  commerceRevision += 1;
  if (state.mode !== 'menu' || !state.pilot) return;
  if (state.view === 'commerce') {
    if (state.commerce.owned && previous.pending) state.commerceScreen.message = purchaseMessages.purchased;
    if (!state.commerce.owned && previous.owned) state.commerceScreen.message = '';
    paintCommerce();
  } else if (!state.launch && state.commerce.owned !== previous.owned && ['home', 'stages', 'result'].includes(state.view)) {
    if (!state.commerce.owned) state.campaignVariant = 'standard';
    const focus = document.activeElement?.dataset.action;
    const scroll = menu.scrollTop;
    show(state.view, false);
    menu.scrollTop = scroll;
    if (focus) menu.querySelector(`[data-action="${focus}"]`)?.focus({ preventScroll:true });
  }
}

async function refreshCommerce() {
  const revision = commerceRevision;
  const snapshot = await nativeCommerce?.('commerce-status').catch(() => null);
  if (Number.isInteger(snapshot?.revision) || revision === commerceRevision) {
    updateCommerce(snapshot ?? { owned:state.commerce.owned, pending:state.commerce.pending });
  }
}

function openCommerce(stage, control) {
  if (!nativeFlight) return;
  state.commerceScreen = { stage, from:state.view, scroll:menu.scrollTop, control, message:'' };
  show('commerce');
  void refreshCommerce();
}

function closeCommerce() {
  const { from, scroll, control } = state.commerceScreen;
  state.commerceScreen = null;
  returnToControl(from, control, scroll);
}

async function runCommerce(command) {
  if (!nativeCommerce || state.commerceWork || state.commerce.busy ||
      (command === 'purchase' ? state.commerce.owned || !state.commerce.available || state.commerce.pending : !state.commerce.restoreAvailable)) return;
  const screen = state.commerceScreen;
  state.commerceWork = command;
  screen.message = '';
  paintCommerce();
  try {
    const response = await nativeCommerce(`commerce-${command}`);
    updateCommerce(response);
    const result = response?.result;
    const confirmed = !['purchased', 'restored'].includes(result) || state.commerce.owned;
    screen.message = confirmed && Object.hasOwn(purchaseMessages, result) ? purchaseMessages[result] : purchaseMessages.failed;
    if (result === 'pending' && state.commerce.owned) screen.message = purchaseMessages.purchased;
  } catch {
    screen.message = purchaseMessages.unavailable;
  } finally {
    state.commerceWork = null;
    if (state.view === 'commerce') paintCommerce();
  }
}


function storyAvailable(beat) {
  const mission = STAGES[beat.mission - 1];
  return mission && !requiresPurchase(mission.id) && Boolean(state.pilot.storySeen?.[beat.id] || state.pilot.clears[mission.id]);
}

function storyLog() {
  const entries = STORY_BEATS.filter(storyAvailable).map((beat) =>
    action(escapePolicy(beat.title), `story-replay:${beat.id}`, 'quiet', 'book')).join('');
  return screen('Story log', 'stages', `<div class="story-log">${entries}</div>`);
}

function storyView() {
  const { beat, continuation } = state.story;
  const art = new URL(beat.art, import.meta.url).href;
  const showCrew = beat.id === 'departure' || beat.id === 'homecoming';
  return `<article class="story-screen" ${showCrew ? 'data-crew-scene' : ''} data-story="${beat.id}">
    <div class="story-art"><img src="${art}" alt="${escapePolicy(beat.alt)}" decoding="async"></div>
    <div class="story-caption">
      <h1 tabindex="-1">${escapePolicy(beat.title)}</h1>
      <p>${escapePolicy(beat.text)}</p>
      ${action(continuation ? 'Continue' : 'Back to story log', 'story-continue', 'primary', continuation ? 'next' : 'back')}
    </div>
    ${continuation ? action('Skip', 'story-continue', 'quiet story-skip', '') : ''}
  </article>`;
}

function openStory(beat, from, continuation = null) {
  state.story = { beat, from, continuation };
  show('story');
}

async function continueStory() {
  const story = state.story;
  if (!story) return;
  const { pilot } = await store.change((saved) => { (saved.storySeen ??= {})[story.beat.id] = true; });
  state.pilot = pilot;
  state.story = null;
  if (story.beat.timing === 'after' && story.beat.mission === STAGES.length && story.continuation) pacing?.complete();
  show(story.from, false);
  if (story.continuation?.which) await start(story.continuation.which, null, 'basics', story.continuation.variant);
  else menu.querySelector(story.continuation ? 'h1' : `[data-action="story-replay:${story.beat.id}"]`)?.focus({ preventScroll:true });
}

function showSettledResult(focus = true) {
  const p = state.pending;
  const stage = p?.receipt?.status === 'clear' && !p.receipt.side && p.run.variant !== 'veteran' && stageById(p.run.stage);
  const beat = stage && storyBeatFor(stage.number, 'after');
  if (beat && p.receipt.first && !p.storyShown && !state.pilot.storySeen[beat.id] && !state.pilot.settings.skipStory) {
    p.storyShown = true;
    openStory(beat, 'result', {});
    return;
  }
  if (stage?.number === STAGES.length && p.receipt.campaignWon && !p.storyShown) pacing?.complete();
  show('result', focus);
}

function launchView() {
  return `<article class="screen launch-screen"><header class="screen-header"><p class="caption">${state.launch.name}</p>
    <h1 tabindex="-1">Preparing flight</h1></header>
    <p class="notice" role="status">Loading flight assets…</p></article>`;
}

const views = {
  home, more: moreView, callSign: callSignView, stages, hangar, upgrade: upgradeView, records, settings: settingsView,
  storyLog, story: storyView,
  account: accountView, legal: legalHub, privacy: () => policyPage('privacy'), terms: () => policyPage('terms'),
  support: () => policyPage('support'), help: helpView, result: results, launch: launchView, commerce: commerceView
};

function announce(message) { $('announcer').textContent = message; }

function showBrowserUpdate() {
  if (!state.newPack || state.mode !== 'menu' || state.launch || state.pending?.working || state.pending?.error ||
      store.temporary || $('update-web')) return;
  const update = document.createElement('aside');
  update.id = 'update-web';
  update.className = 'web-update';
  update.innerHTML = action('Update browser build', 'update-web', 'quiet');
  menu.prepend(update);
}

function show(view, focus = true) {
  if (!views[view]) return;
  if (view === 'commerce' && (!nativeFlight || !state.commerceScreen)) return;
  if (view === 'story' && !state.story) return;
  if (view === 'callSign' && !state.callSign) return;
  $('frame').dataset.reducedMotion = String(motionLimited());
  state.mode = 'menu';
  state.view = view;
  pacing?.scene(['story', 'launch', 'result'].includes(view) ? view : 'menu');
  field.hidden = true;
  menu.hidden = false;
  menu.innerHTML = views[view]();
  if (view === 'commerce') paintCommerce();
  if (view === 'story') {
    const picture = menu.querySelector('.story-art img');
    const revealFallback = () => { picture.hidden = true; };
    picture.addEventListener('error', revealFallback, { once:true });
    if (picture.complete && !picture.naturalWidth) revealFallback();
  }
  if (view === 'legal' && nativeFlight) {
    paintRating();
    void refreshRating();
  }
  refreshPatrol();
  showBrowserUpdate();
  menu.scrollTop = 0;
  if (focus) menu.querySelector('h1')?.focus({ preventScroll: true });
  if (view === 'settings') checkPack();
  if (view === 'account' && googleSignInAvailable) {
    paintAccount();
    void googleAccount.open();
  }
  lookForBrowserUpdate();
  audio.play('hangar');
}

function returnToControl(view, control, scroll) {
  show(view, false);
  menu.scrollTop = scroll;
  (menu.querySelector(`[data-action="${control}"]`) ?? menu.querySelector('h1'))?.focus({ preventScroll:true });
}

function refreshPatrol() {
  state.titlePatrol?.stop();
  state.titlePatrol = state.view === 'home'
    ? mountTitlePatrol(menu.querySelector('.title-patrol'), motionLimited(), state.pilot.ship) : null;
}

reduced.addEventListener('change', () => {
  if (!state.pilot) return;
  $('frame').dataset.reducedMotion = String(motionLimited());
  if (state.mode !== 'menu' || state.launch) return;
  if (state.view === 'home') refreshPatrol();
  if (state.view === 'settings') show('settings', false);
});

function showHangar(from, selection = state.pilot.ship, tab = 'ships') {
  state.hangarBack = from;
  state.hangarTab = tab;
  state.inspected = selection;
  show('hangar');
}

function updateHangar(control) {
  show('hangar', false);
  menu.querySelector(`[data-action="${control}"]`)?.focus();
}

function readId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('-');
}

async function requestFlight(which, variant = 'standard') {
  const endless = which === 'endless';
  const mission = endless ? null : which === 'next' ? playMission() : stageById(Number(which));
  if (!endless && !mission) return;
  if (mission && requiresPurchase(mission.id) && !(which === 'next')) {
    openCommerce(mission.id, `${variant === 'veteran' ? 'fly-veteran' : 'fly'}:${which}`);
    return;
  }
  if (endless && !hasEndless(state.pilot)) return;
  if (variant === 'veteran' && !hasVeteran(state.pilot)) return;
  if (mission && !hasStage(state.pilot, mission.id, variant)) return;
  if (which === 'next') pacing?.start();
  if (!normalizeCallSign(state.pilot.callSign)) {
    openCallSign(state.view, { which, variant });
    return;
  }
  const beat = mission && variant === 'standard' && storyBeatFor(mission.number, 'before');
  if (beat && !state.pilot.storySeen[beat.id] && !state.pilot.settings.skipStory) {
    openStory(beat, state.view, { which, variant });
    return;
  }
  await start(which, null, 'basics', variant);
}

async function start(which, trainingMode = null, drill = 'basics', variant = 'standard') {
  const endless = which === 'endless';
  const mission = endless ? null : which === 'next' ? playMission() : stageById(Number(which), variant);
  const stage = mission?.id ?? null;
  if (!trainingMode && endless && !hasEndless(state.pilot)) return;
  if (!trainingMode && variant === 'veteran' && !hasVeteran(state.pilot)) return;
  const postgame = (endless && !state.pilot.legacy?.endlessQualified) || variant === 'veteran';
  if (!trainingMode && nativeFlight && (postgame || isPaidMission(mission))) {
    const decision = await nativeCommerce?.('authorize-stage', postgame ? STAGES.length : mission.number).catch(() => null);
    if (decision?.allowed !== true) {
      if (state.commerce.owned) updateCommerce({ ...state.commerce, owned:false });
      if (which === 'next' || postgame) show('stages');
      else if (state.view !== 'commerce') openCommerce(stage, `fly:${which}`);
      else {
        state.commerceScreen.message = 'Access could not be confirmed. Check with the store and try again.';
        paintCommerce();
      }
      return;
    }
  }
  const launch = { controller: new AbortController(), from: state.view, which,
    control: trainingMode === 'practice' ? `practice:${drill}` : `${variant === 'veteran' ? 'fly-veteran' : 'fly'}:${which}`,
    name: trainingMode ? 'Practice' : endless ? 'Endless' : mission?.name };
  if (!launch.name) return;
  let run;
  let launched = false;
  state.launch = launch;
  pacing?.scene('launch');
  audio.effect('launch');
  const title = !menu.hidden && menu.querySelector('.title-screen');
  if (title) {
    title.classList.add('is-launching');
    title.querySelector('.title-actions').inert = true;
    state.titlePatrol?.launch();
    const status = document.createElement('div');
    status.className = 'launch-status';
    status.innerHTML = '<p role="status">Launching…</p>';
    title.append(status);
    status.firstElementChild.tabIndex = -1;
    status.firstElementChild.focus({ preventScroll:true });
  } else show('launch');
  try {
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (trainingMode) {
      const special = trainingMode === 'practice' && drill === 'special' ? state.pilot.special : 'ghost';
      run = { id:readId(), mode:'arcade', stage:1, ship:'kestrel', rules:RULES_VERSION, special, assistance:{ ...state.pilot.settings }, seed };
    } else {
      const saved = await store.change((pilot) => beginRun(pilot, readId(), endless ? 'endless' : 'arcade', stage, Date.now(), seed, variant));
      state.pilot = saved.pilot;
      run = saved.result;
    }
    if (launch.controller.signal.aborted) return;
    if (!run) {
      restoreLaunch(launch, 'This mission is locked.');
      return;
    }
    const recording = trainingMode ? null : captureReplay(run);
    const flight = new Flight(run, { recordInput: recording?.recordInput });
    const prepared = renderer.prepare(flight, launch.controller.signal);
    if (title && !motionLimited(run.assistance)) {
      await new Promise((done) => setTimeout(done, 420));
    }
    if (!await prepared || launch.controller.signal.aborted) return;
    state.titlePatrol?.stop();
    state.titlePatrol = null;
    state.training = trainingMode ? { ...startTraining(flight, drill), from:launch.from } : null;
    state.returnView = launch.from === 'home' ? 'home' : 'stages';
    if (!trainingMode && !endless) state.campaignVariant = variant;
    state.last = run;
    state.recording = recording;
    state.flight = flight;
    state.mode = 'playing';
    pacing?.scene('flight');
    menu.hidden = true;
    field.hidden = false;
    field.querySelector('.flight-controls').inert = false;
    delete field.dataset.ending;
    clearInput();
    renderer.resize();
    renderer.beginArrival?.(motionLimited(run.assistance));
    showTrainingAction();
    globalThis.resetFixedStepClock(clock, performance.now());
    refreshHud(true);
    audio.play('flight');
    sky.setAttribute('tabindex', '-1');
    sky.focus({ preventScroll: true });
    if (!trainingMode) announce(endless ? 'Endless flight launched.' : `${flight.stage.name} launched. ${flight.stage.brief}`);
    launched = true;
    if (document.hidden) pause(true);
  } catch {
    if (state.launch === launch) restoreLaunch(launch, 'Could not prepare the flight. Try launching again.');
  } finally {
    if (state.launch === launch) state.launch = null;
    if (run && !launched && !trainingMode) await store.change((pilot) => abandonRun(pilot, run.id)).catch(() => {});
  }
}

function restoreLaunch(launch, warning = '') {
  launch.controller.abort();
  state.launch = null;
  state.busy = null;
  show(launch.from, false);
  menu.querySelector(`[data-action="${launch.control}"]`)?.focus({ preventScroll: true });
  if (warning) {
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.setAttribute('role', 'alert');
    notice.textContent = warning;
    menu.querySelector('h1')?.after(notice);
  } else announce('Launch canceled.');
}

function releasePointer() {
  const active = state.pointer;
  state.pointer = null;
  if (active?.stick) stick.hidden = true;
  if (active && sky.hasPointerCapture(active.id)) sky.releasePointerCapture(active.id);
}

function clearInput() {
  releasePointer();
  state.keys.clear();
  state.flight?.reanchor();
}

function updateKeys() {
  const held = state.keys;
  if (!held.size) { state.flight.keys = null; return; }
  state.flight.setDirection(Number(held.has('move_right')) - Number(held.has('move_left')), Number(held.has('move_down')) - Number(held.has('move_up')));
}

function dialog(html, focusSelector = 'button') {
  modal.innerHTML = `<div class="dialog-body">${html}</div>`;
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  modal.querySelector(focusSelector)?.focus({ preventScroll: true });
}

function pause(interrupted = false) {
  if (!['playing', 'resuming', 'paused'].includes(state.mode)) return;
  if (state.mode === 'paused' && interrupted) return;
  clearInput();
  state.mode = 'paused';
  pacing?.scene('paused');
  $('pause').setAttribute('aria-label', 'Pause');
  audio.quiet();
  const flight = state.flight;
  dialog(`<span class="caption">${flight.endless ? 'Endless' : flight.stage.name}</span><h2 id="pause-title" tabindex="-1">Paused</h2>
    <p>${interrupted ? 'Flight paused while you were away.' : 'Your flight is on hold.'}</p>
    ${action('Resume', 'resume', 'primary', 'play')}
    <div class="pause-actions">${action('Settings', 'pause-settings', 'quiet', '')}${action('Leave flight', 'leave', 'quiet', '')}</div>`,
    '#pause-title');
}

function showFlightSettings() {
  if (state.mode !== 'paused') return;
  dialog(`<h2 id="pause-title" tabindex="-1">Flight settings</h2>
    ${action('Back to pause', 'pause', 'quiet', 'back')}${touchSettings(state.pilot.settings)}`,
    '#pause-title');
}

function resume() {
  clearInput();
  state.mode = 'resuming';
  state.resumeAt = performance.now() + 1720;
  dialog(`<h2 id="pause-title">Resuming in <span id="countdown">2</span></h2><p>Get ready to steer.</p>${action('Stay paused', 'pause', 'quiet', '')}`);
}

async function leave() {
  if (state.training) {
    const back = state.training.from;
    clearInput();
    modal.close();
    state.training = null;
    state.flight = null;
    show(back);
    return;
  }
  await store.change((saved) => abandonRun(saved, state.flight.run.id)).catch(() => {});
  pacing?.abandon(state.flight.run, state.flight.elapsed);
  clearInput();
  modal.close();
  state.flight = null;
  state.recording = null;
  show(state.returnView ?? 'stages');
}

function showTrainingAction() {
  const container = $('training-actions');
  const training = state.training;
  container.hidden = !training;
  if (!training) return;
  const done = training.step === 'complete';
  const label = done ? 'Done' : 'End practice';
  const button = container.querySelector('button[data-action="finish-practice"]');
  if (!button) {
    container.innerHTML = action(label, 'finish-practice', done ? 'primary' : 'quiet', done ? 'play' : '');
    return;
  }
  const text = button.querySelector('span');
  if (text.textContent !== label) text.textContent = label;
  button.className = done ? 'primary' : 'quiet';
  if (done && !button.querySelector('svg')) button.insertAdjacentHTML('beforeend', icon('play'));
  if (!done) button.querySelector('svg')?.remove();
}

async function finishPractice() {
  const training = state.training;
  if (!training) return;
  if (training.drill === 'basics' && training.step === 'complete') {
    const saved = await store.change((pilot) => { pilot.settings.trainingDone = true; }).catch(() => null);
    if (saved) state.pilot = saved.pilot;
  }
  clearInput();
  state.training = null;
  state.flight = null;
  show(training.from);
}

const lastHud = {};
function content(id, value, html = false) {
  if (lastHud[id] === value) return;
  lastHud[id] = value;
  if (html) $(id).innerHTML = value;
  else $(id).textContent = value;
}

function refreshGhost(f) {
  const p = f.player;
  const special = SPECIALS[f.special];
  const energy = Math.floor(p.ghostEnergy);
  const specialTime = p.ghostTime || p.specialTime;
  const active = p.realm === 'ghost' || specialTime > 0;
  const action = f.realmHop ? 'Hop' : specialTime ? `${(Math.ceil(specialTime * 10) / 10).toFixed(1)}s` : p.ghostRecovery ? 'Wait' : special.label;
  const mode = active ? 'active' : f.shiftReady ? 'ready' : 'charging';
  const key = `${energy}/${action}/${mode}/${f.shiftReady}/${f.realmHop}/${f.special}`;
  if (lastHud.ghost === key) return;
  lastHud.ghost = key;
  const control = $('ghost-control');
  const meter = $('ghost-meter');
  control.dataset.mode = mode;
  meter.style.setProperty('--shift-cost', `${f.ghostCost}%`);
  meter.setAttribute('aria-valuenow', energy);
  $('ghost-value').style.transform = `scaleX(${energy / 100})`;
  $('ghost-shift').setAttribute('aria-disabled', String(!f.shiftReady));
  content('ghost-action', action);
  const destination = realmLabel(otherRealm(p.realm));
  $('ghost-shift').setAttribute('aria-label', f.realmHop ? `Hop to ${destination} realm` : special.name);
  content('ghost-label', f.realmHop ? `To ${destination}` : special.short);
  const remaining = `${energy} energy. ${f.realmHop ? 'Hop' : special.name} costs ${f.ghostCost}.`;
  const recovery = p.ghostRecovery ? ` ${f.realmHop ? 'Hop' : special.name} is recovering.` : '';
  content('ghost-status', f.realmHop ? `Current realm is ${realmLabel(p.realm)}. ${remaining}${recovery}`
    : specialTime ? `${action} of ${special.name} remaining.` : remaining + recovery);
}

function refreshHud(restart = false) {
  const f = state.flight;
  const p = f.player;
  const operation = f.operationStatus?.();
  const objective = `${operation?.label ?? ''}/${operation?.value ?? ''}`;
  if (restart || lastHud.objective !== objective) {
    $('operation-objective').hidden = !operation;
    content('operation-label', operation?.label ?? '');
    content('operation-value', operation?.value ?? '');
    lastHud.objective = objective;
  }
  if (restart || lastHud.hopControl !== f.realmHop) {
    const steering = usesFloatingStick() ? 'Touch and hold off-center on the stick' : 'Drag';
    const special = f.realmHop ? 'to Hop between realms' : `for ${SPECIALS[f.special].name}`;
    sky.setAttribute('aria-label', `Flight playfield. ${steering} or use arrow keys to steer. Weapons fire automatically. Press Space ${special}.`);
    lastHud.hopControl = f.realmHop;
  }
  const activeBoss = Boolean(f.boss && f.boss.hull > 0);
  const showRealm = activeBoss && f.realmHop;
  const message = f.notice?.time > 0 ? f.notice : null;
  const bossCue = Boolean(showRealm && f.boss.shifting);
  const flash = $('flight-message');
  const visible = Boolean(message || bossCue);
  const messageChanged = lastHud.message !== message;
  if (restart || messageChanged || lastHud.bossCue !== bossCue) {
    const pickup = message?.kind === 'pickup';
    const title = message?.title || (pickup ? message.copy : bossCue ? 'Wraith' : f.stage.name);
    const stickLesson = message?.kind === 'training' && state.training?.step === 'steer' && usesFloatingStick();
    const tip = stickLesson ? 'Touch anywhere and hold off-center on the stick to move. Arrow keys also steer.'
      : pickup ? message.title && message.brief !== message.title ? message.brief : '' : message?.copy;
    flash.classList.toggle('shown', visible);
    flash.dataset.kind = message?.kind ?? (bossCue ? 'warning' : '');
    content('flight-name', visible ? title : '');
    $('flight-name').hidden = !visible;
    $('flight-tip').hidden = !tip;
    content('flight-tip', tip ?? '');
    $('flight-progress').hidden = !bossCue;
    $('boss-realm').hidden = !bossCue;
    lastHud.bossCue = bossCue;
    if (message && (restart || messageChanged) && ['warning', 'pickup', 'tactic', 'training'].includes(message.kind)) {
      announce([message.title, stickLesson ? tip : message.copy].filter(Boolean).join('. '));
    }
    lastHud.message = message;
  }
  if (visible) {
    const opacity = !message || bossCue || message.time >= .45 || motionLimited(f.run.assistance) ? 1 : message.time / .45;
    if (lastHud.opacity !== opacity) {
      flash.style.setProperty('--notice-opacity', opacity);
      lastHud.opacity = opacity;
    }
  }
  const seconds = Math.floor(f.elapsed);
  if (lastHud.seconds !== seconds) {
    lastHud.seconds = seconds;
    content('clock', time(seconds));
  }
  if (lastHud.score !== f.score) {
    lastHud.score = f.score;
    content('flight-score', num(f.score));
  }
  content('flight-progress', showRealm ? `You · ${realmLabel(p.realm)}` : '');
  if (lastHud.combo !== f.combo) {
    lastHud.combo = f.combo;
    content('chain', f.combo >= 2 ? `×${f.combo}` : '');
    $('chain').hidden = f.combo < 2;
  }
  const hullState = `${p.hull}/${p.maxHull}`;
  if (lastHud.hullState !== hullState) {
    lastHud.hullState = hullState;
    content('hull', Array.from({ length: p.maxHull }, (_, i) => `<i class="segment ${i < p.hull ? 'full' : ''}" aria-hidden="true"></i>`).join(''), true);
    $('hull').setAttribute('aria-valuemax', p.maxHull);
    $('hull').setAttribute('aria-valuenow', p.hull);
  }
  refreshGhost(f);
  if (lastHud.activeBoss !== activeBoss) {
    lastHud.activeBoss = activeBoss;
    $('boss-meter').hidden = !activeBoss;
  }
  if (activeBoss) {
    const boss = f.boss;
    const realm = boss.realm === 'ghost' ? 'Ghost' : 'Physical';
    const transition = boss.shifting ? `${realm} → ${boss.realm === 'ghost' ? 'Physical' : 'Ghost'}` : realm;
    content('boss-name', boss.spec.name);
    if (showRealm) content('boss-realm', transition);
    const bossRealm = showRealm ? boss.realm : '';
    if (lastHud.bossRealm !== bossRealm) {
      lastHud.bossRealm = bossRealm;
      $('boss-meter').dataset.realm = bossRealm;
    }
    const hp = Math.max(0, f.boss.hull / f.boss.spec.hull);
    if (lastHud.bossHp !== hp) {
      lastHud.bossHp = hp;
      $('boss-value').style.transform = `scaleX(${hp.toFixed(3)})`;
      $('boss-track').setAttribute('aria-valuenow', Math.ceil(hp * 100));
    }
  }
}

async function settle() {
  const p = state.pending;
  if (!p || p.working || p.receipt) return;
  p.working = true;
  p.error = '';
  if (state.view === 'result' && state.mode === 'menu') show('result', false);
  try {
    const { pilot, result } = await store.change((saved) => settleRun(saved, p.run.id, p.terminal));
    state.pilot = pilot;
    if (!result) throw Error('Run unavailable');
    p.receipt = result;
    pacing?.attempt(result, p.terminal);
  } catch (error) {
    p.error = error.message === 'Run unavailable' ? 'This run is no longer available to save.' : 'Flight save unavailable. Retry saving to bank the result.';
  } finally {
    p.working = false;
    if (state.pending === p && state.view === 'result' && state.mode === 'menu') showSettledResult();
  }
}

async function changeSetting(key, value, controls = false) {
  const { pilot } = await store.change((saved) => { saved.settings[key] = value; });
  state.pilot = pilot;
  if (controls) {
    applyControlStyles(field, touchControlLayout(pilot.settings));
    if (key === 'steering' && state.mode === 'paused') refreshHud(true);
    return;
  }
  audio.reflect(pilot.settings);
  show('settings', false);
  (menu.querySelector(`[data-action="toggle:${key}"]`) ?? $(key))?.focus();
}

async function handle(command) {
  const [type, value] = command.split(':');
  if (type === 'update-web') {
    if (state.mode === 'menu' && state.newPack && !state.pending?.working && !state.pending?.error && !store.temporary) {
      location.replace(`/?build=${state.newPack}`);
    }
    return;
  }
  audio.unlock();
  audio.effect('ui');
  if (type === 'view') {
    if (value === 'hangar' && state.view === 'upgrade') updateHangar(`upgrade:${state.upgrade}`);
    else if (value === 'callSign') openCallSign(state.view);
    else if (state.view === 'callSign' && value === state.callSign?.from) closeCallSign();
    else if (state.view === 'legal' && value === state.legalFrom.view) {
      returnToControl(value, 'legal', state.legalFrom.scroll);
    } else if (Object.hasOwn(helpPages, state.view) && value === state.policyFrom.view) {
      returnToControl(value, `policy:${state.view}`, state.policyFrom.scroll);
    } else show(value);
    return;
  }
  if (type === 'account' && state.view === 'account') {
    if (value === 'browser' && nativeFlight) {
      const status = $('account-browser-status');
      status.hidden = true;
      if (await window.stellarOpenBrowserAccount?.()) return;
      status.textContent = 'Could not open the browser. Try again.';
      status.hidden = false;
      return;
    }
    if (value === 'sign-in') void googleAccount.signIn();
    if (value === 'sign-out') void googleAccount.signOut();
    if (value === 'retry') void googleAccount.open();
    return;
  }
  if (type === 'commerce' && nativeFlight) {
    if (value === 'show' && ['settings', 'legal'].includes(state.view)) openCommerce(null, command);
    else if (value === 'preview' && state.view === 'result') {
      const receipt = state.pending?.receipt;
      const milestone = STAGES[FREE_MISSIONS - 1];
      const destination = STAGES[FREE_MISSIONS];
      if (receipt?.stage === milestone.id && receipt.first && !store.temporary && requiresPurchase(destination.id)) {
        openCommerce(destination.id, command);
      }
    } else if (state.view === 'commerce' && value === 'back') closeCommerce();
    else if (state.view === 'commerce' && (value === 'purchase' || value === 'restore')) void runCommerce(value);
    return;
  }
  if (type === 'legal' && ['home', 'settings'].includes(state.view)) {
    state.legalFrom = { view:state.view, scroll:menu.scrollTop };
    state.rating = { available:null, message:'' };
    show('legal');
    return;
  }
  if (type === 'policy' && ['legal', 'commerce'].includes(state.view) && Object.hasOwn(helpPages, value)) {
    state.policyFrom = { view:state.view, scroll:menu.scrollTop };
    show(value);
    return;
  }
  if (type === 'rate-app' && state.view === 'legal' && nativeFlight && state.rating.available) {
    await rateApp();
    return;
  }
  if (type === 'hangar') { showHangar(value); return; }
  if (type === 'shop') { showHangar(value, state.pilot.ship, 'upgrades'); return; }
  if (type === 'unlocked') { showHangar('result', value); return; }
  if (type === 'help') { state.helpBack = value; show('help'); return; }
  if (type === 'practice') { await start('1', 'practice', value); return; }
  if (type === 'finish-practice') { await finishPractice(); return; }
  if (type === 'reroll-call-sign' && state.view === 'callSign') {
    const input = $('call-sign');
    const next = suggestCallSign(input.value);
    input.value = state.callSign.suggestion = next;
    input.removeAttribute('aria-invalid');
    $('call-sign-error').hidden = true;
    announce(`Suggested call sign ${next}.`);
    input.focus();
    return;
  }
  if (type === 'campaign') {
    if (value === 'veteran' && (!hasVeteran(state.pilot) || requiresPurchase(STAGES.at(-1).id))) return;
    state.campaignVariant = value === 'veteran' ? 'veteran' : 'standard';
    show('stages');
    return;
  }
  if (type === 'story-replay' && state.view === 'storyLog') {
    const beat = STORY_BEATS.find(({ id }) => id === value);
    if (beat && storyAvailable(beat)) openStory(beat, 'storyLog');
    return;
  }
  if (type === 'story-continue' && state.view === 'story') { await continueStory(); return; }
  if (type === 'fly' || type === 'fly-veteran') {
    await requestFlight(value, type === 'fly-veteran' ? 'veteran' : 'standard');
    return;
  }
  if (type === 'tab') { state.hangarTab = value; updateHangar(command); return; }
  if (type === 'inspect') { state.inspected = value; updateHangar(command); return; }
  if (type === 'upgrade') { state.upgrade = value; show('upgrade'); return; }
  if (type === 'equip') {
    const { pilot, result } = await store.change((saved) => equip(saved, value));
    state.pilot = pilot;
    announce(result ? `${SHIPS[value].name} equipped.` : 'Ship locked.');
    updateHangar(`inspect:${value}`);
    return;
  }
  if (type === 'special') {
    if (state.pilot.special === value) return;
    const { pilot, result } = await store.change((saved) => equipSpecial(saved, value));
    state.pilot = pilot;
    announce(result ? `${SPECIALS[value].name} equipped.` : 'Special locked.');
    updateHangar(command);
    return;
  }
  if (type === 'install') {
    const beforeTier = state.pilot.tiers[state.upgrade];
    const { pilot, result } = await store.change((saved) => install(saved, state.upgrade));
    state.pilot = pilot;
    if (result) {
      audio.chord([490, 620, 742], .14, .079);
      pacing?.purchase(state.upgrade, beforeTier, pilot);
    }
    announce(result ? `${UPGRADES[state.upgrade].name} installed.` : 'Upgrade unavailable.');
    show('upgrade');
    return;
  }
  if (type === 'toggle' && Object.hasOwn(settings, value)) {
    await changeSetting(value, value === 'haptics' ? state.pilot.settings.haptics === false : !state.pilot.settings[value]);
    return;
  }
  if (type === 'pause') { pause(); return; }
  if (type === 'pause-settings') { showFlightSettings(); return; }
  if (type === 'resume') { resume(); return; }
  if (type === 'leave') {
    dialog(`<h2 id="pause-title">Leave flight?</h2><p>Salvage and records are banked when a flight ends in victory or defeat.</p>
      ${action('Stay paused', 'pause', 'primary', '')}${action('Leave flight', 'abandon', 'quiet', '')}`);
    return;
  }
  if (type === 'abandon') { await leave(); return; }
  if (type === 'settle') { await settle(); return; }
  if (type === 'discard') {
    await store.change((saved) => abandonRun(saved, state.pending.run.id)).catch(() => {});
    state.pending = null;
    show('stages');
  }
  if (type === 'recover') {
    state.pilot = await store.open();
    const p = state.pending;
    if (p) {
      p.receipt = state.pilot.receipts[p.run.id] ?? null;
      p.discarded = !p.receipt;
      p.error = '';
    }
    announce(p?.discarded ? 'Existing device save restored. The temporary result was replaced.' : 'Device saving restored.');
    audio.reflect(state.pilot.settings);
    show(state.view);
  }
}

function closeCallSign() {
  const { from, launch } = state.callSign;
  state.callSign = null;
  const command = launch ? `${launch.variant === 'veteran' ? 'fly-veteran' : 'fly'}:${launch.which}` : 'view:callSign';
  returnToControl(from, command, 0);
}

menu.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id !== 'call-sign-form') return;
  event.preventDefault();
  if (state.busy) return;
  const input = form.elements.callSign;
  const status = $('call-sign-error');
  const callSign = normalizeCallSign(input.value);
  if (!callSign) {
    status.textContent = callSign === '' ? 'Enter a call sign or reroll for a suggestion.' : 'Enter up to 16 letters, numbers, spaces or hyphens.';
    status.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  input.removeAttribute('aria-invalid');
  status.hidden = true;
  const command = {};
  state.busy = command;
  try {
    const { pilot } = await store.change((saved) => { saved.callSign = callSign; });
    state.pilot = pilot;
    const { launch } = state.callSign;
    closeCallSign();
    announce(store.temporary ? 'Call sign set for this session.' : 'Call sign saved.');
    if (launch) await requestFlight(launch.which, launch.variant);
  } catch {
    status.textContent = 'Device storage is unavailable. Try again.';
    status.hidden = false;
  } finally {
    if (state.busy === command) state.busy = null;
  }
});

function acceptFirstAudioGesture() {
  audio.unlock();
  if (state.mode === 'menu' || state.mode === 'playing') audio.play(state.mode === 'playing' ? 'flight' : 'hangar');
}
document.addEventListener('click', acceptFirstAudioGesture, { once:true, capture:true });
document.addEventListener('keydown', acceptFirstAudioGesture, { once:true, capture:true });
document.addEventListener('click', async (event) => {
  const target = event.target.closest('button[data-action]');
  if (!target && event.detail > 0 && event.target.matches('.title-screen')) {
    if (state.titlePatrol?.hitsShip(event.clientX, event.clientY)) menu.querySelector('.title-ship')?.click();
    else state.titlePatrol?.shootAt(event.clientX, event.clientY);
    return;
  }
  if (!target || target.disabled || state.busy) return;
  const command = {};
  state.busy = command;
  try { await handle(target.dataset.action); }
  catch {
    const warning = 'Device storage is unavailable. Try again in a moment.';
    announce(warning);
    if (target.isConnected && !field.contains(target)) {
      const status = document.createElement('p');
      status.className = 'notice';
      status.setAttribute('role', 'status');
      status.textContent = warning;
      menu.querySelector('[data-save-error]')?.remove();
      status.dataset.saveError = 'true';
      target.before(status);
    }
  } finally { if (state.busy === command) state.busy = null; }
});

document.addEventListener('input', (event) => {
  const group = event.target.closest('.touch-settings');
  if (group) previewTouchSettings(group);
});
document.addEventListener('change', (event) => {
  const { id, value, valueAsNumber } = event.target;
  if (!event.target.closest('.touch-settings')) return;
  const range = Object.hasOwn(TOUCH_CONTROL_RANGES, id);
  if (!range && id !== 'sensitivity' && id !== 'steering') return;
  const label = controlLabels[id] ?? event.target.getAttribute('aria-label');
  changeSetting(id, range ? valueAsNumber : value, true).catch(() => announce(`${label} could not be saved.`));
});
$('pause').innerHTML = icon('pause');
$('pause').addEventListener('click', () => pause());
function useShift() {
  if (state.mode !== 'playing' || !state.flight.activateGhost()) return;
  state.flight.usedShift = true;
  audio.unlock();
  refreshHud();
}
const specialButton = $('ghost-shift');
let specialTouchPress = false;
specialButton.addEventListener('click', (event) => {
  if (specialTouchPress && event.detail > 0) return;
  state.input = event.detail > 0 ? 'pointer' : 'keyboard';
  useShift();
});
specialButton.addEventListener('pointerdown', (event) => {
  specialTouchPress = event.pointerType === 'touch';
  if (!specialTouchPress) return;
  event.preventDefault();
  state.input = 'touch';
  useShift();
});
modal.addEventListener('cancel', (event) => { event.preventDefault(); if (state.mode === 'resuming') pause(); });

const stickKnob = $('flight-stick-knob');

for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => {
    if (event.cancelable) event.preventDefault();
  }, { passive:false });
}
document.addEventListener('touchmove', (event) => {
  if (event.touches.length > 1 && event.cancelable) event.preventDefault();
}, { passive:false });
document.addEventListener('wheel', (event) => {
  if (event.ctrlKey && event.cancelable) event.preventDefault();
}, { passive:false });

sky.addEventListener('pointerdown', (event) => {
  if (state.mode !== 'playing' || state.pointer || event.button !== 0 || (!event.isPrimary && event.pointerType !== 'touch')) return;
  event.preventDefault();
  audio.unlock();
  state.input = event.pointerType === 'mouse' ? 'pointer' : 'touch';
  if (state.keys.size) clearInput();
  const { pointerId:id, clientX:x, clientY:y } = event;
  const floating = event.pointerType !== 'mouse' && usesFloatingStick();
  const size = floating ? touchControlLayout(state.pilot.settings).stickSize : 0;
  state.pointer = { id, x, y, stick: floating ? { x:0, y:0, radius:size * (30 / 76) } : null };
  sky.setPointerCapture(event.pointerId);
  state.flight.reanchor();
  if (floating) {
    const bounds = sky.getBoundingClientRect();
    const insetX = Math.min(size / 2 + 4, bounds.width / 2);
    const insetY = Math.min(size / 2 + 4, bounds.height / 2);
    stick.style.left = `${Math.max(insetX, Math.min(bounds.width - insetX, x - bounds.left))}px`;
    stick.style.top = `${Math.max(insetY, Math.min(bounds.height - insetY, y - bounds.top))}px`;
    stickKnob.style.transform = '';
    stick.hidden = false;
  }
});

function movePointer(event) {
  const pointer = state.pointer;
  if (!pointer || pointer.id !== event.pointerId || state.mode !== 'playing') return false;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (pointer.stick) {
    const radius = pointer.stick.radius;
    const deadZone = radius / 6;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(distance, radius);
    const strength = Math.max(0, (clamped - deadZone) / (radius - deadZone));
    const direction = distance ? strength / distance : 0;
    const knob = distance ? clamped / distance : 0;
    pointer.stick.x = dx * direction;
    pointer.stick.y = dy * direction;
    stickKnob.style.transform = `translate(${dx * knob}px, ${dy * knob}px)`;
    return true;
  }
  const sensitivity = { gentle: .78, standard: 1.12, direct: 1.37 }[state.pilot.settings.sensitivity] ?? 1.12;
  state.flight.drag(dx / renderer.unit * sensitivity, dy / renderer.unit * sensitivity);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  return true;
}

sky.addEventListener('pointermove', movePointer);
sky.addEventListener('pointerup', (event) => {
  if (state.pointer?.id === event.pointerId && state.pointer.stick) {
    clearInput();
    return;
  }
  if (!movePointer(event)) return;
  // Keep a short swipe that finished between simulation ticks. Limit long flicks
  // so the ship never keeps travelling across the arena after the pilot lifts.
  const flight = state.flight;
  const dx = flight.xIntent - flight.player.x;
  const dy = flight.yIntent - flight.player.y;
  const distance = Math.hypot(dx, dy);
  const releaseTravel = flight.speed * .19;
  if (distance > releaseTravel) {
    const trim = releaseTravel / distance - 1;
    flight.drag(dx * trim, dy * trim);
  }
  releasePointer();
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  sky.addEventListener(type, (event) => { if (state.pointer?.id === event.pointerId) clearInput(); });
}

window.addEventListener('keydown', (event) => {
  const action = globalThis.gameplayActionForKey(event.key);
  if (event.key === 'Escape' && state.mode === 'menu' && state.view === 'story') {
    event.preventDefault();
    if (!event.repeat) menu.querySelector('[data-action="story-continue"]')?.click();
  } else if (event.key === 'Escape' && state.launch) {
    event.preventDefault();
  } else if (event.key === 'Escape' && state.mode === 'menu' && state.view === 'commerce') {
    event.preventDefault();
    if (!event.repeat) closeCommerce();
  } else if (event.key === 'Escape' && state.mode !== 'menu' && state.mode !== 'finishing') {
    event.preventDefault();
    if (event.repeat) return;
    if (state.mode === 'paused' && modal.querySelector('[data-action="resume"]')) resume();
    else pause();
  } else if (action === 'ability' && state.mode === 'playing') {
    if (event.target.closest?.('button, a, input, select, textarea')) return;
    event.preventDefault();
    if (!event.repeat) { state.input = 'keyboard'; useShift(); }
  } else if (action?.startsWith('move_') && state.mode === 'playing') {
    event.preventDefault();
    state.input = 'keyboard';
    if (state.pointer || !state.keys.size) clearInput();
    state.keys.add(action);
    updateKeys();
  }
});
window.addEventListener('keyup', (event) => {
  const action = globalThis.gameplayActionForKey(event.key);
  if (state.keys.delete(action) && state.mode === 'playing') updateKeys();
});
window.addEventListener('blur', () => pause(true));
window.addEventListener('pagehide', () => { pause(true); audio.quiet(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(true); audio.quiet(); }
  else if (state.mode === 'menu') { audio.play('hangar'); lookForBrowserUpdate(); }
});
window.addEventListener('resize', () => {
  clearInput();
  if (state.mode === 'resuming') pause(true);
  if (!field.hidden && state.flight) { renderer.resize(); renderer.draw(state.flight, appearance(state.flight.run.assistance)); }
});

const hapticPulse = { hurt:18, barrier:11, ghostStart:9, realmHop:9, ionBurst:12, afterburner:10, overcharge:10, bossDown:28, playerDown:25 };
let lastHaptic = -Infinity;

function pulseFeedback(events, timestamp) {
  if (!hapticAvailable || state.input !== 'touch' || state.pilot.settings.haptics === false ||
      document.hidden || timestamp - lastHaptic < 140) return;
  let length = 0;
  for (const { type } of events) length = Math.max(length, hapticPulse[type] ?? 0);
  if (length) {
    if (nativeFlight) {
      const strength = length >= 25 ? 'heavy' : length >= 18 ? 'medium' : 'light';
      window.dispatchEvent(new CustomEvent('stellar-native-haptic', { detail:strength }));
    } else navigator.vibrate(length);
    lastHaptic = timestamp;
  }
}

function loop(timestamp) {
  const f = state.flight;
  if (state.mode === 'playing') {
    const prefs = appearance(f.run.assistance);
    const tick = globalThis.advanceFixedStep(clock, timestamp, (dt) => {
      const steering = state.pointer?.stick;
      if (steering && (steering.x || steering.y)) {
        const travel = f.speed * FIXED_TICK;
        f.drag(steering.x * travel, steering.y * travel);
      }
      f.step(FIXED_TICK);
      renderer.advanceEffects(dt / 1000);
    });
    const events = f.takeEvents();
    if (state.training) {
      const previous = state.training.step;
      advanceTraining(f, state.training, events);
      if (previous !== state.training.step) showTrainingAction();
    }
    renderer.accept(events, prefs.reduced);
    audio.accept(events);
    pulseFeedback(events, timestamp);
    if (tick.steps) refreshHud();
    renderer.draw(f, prefs);
    const end = f.terminal();
    if (end) {
      clearInput();
      state.mode = 'finishing';
      state.finishingFrame = timestamp;
      const lostShip = end.status === 'defeat' && !end.damageCause?.startsWith('objective-');
      if (lostShip) field.dataset.ending = 'defeat';
      const finaleClear = end.status === 'clear' && f.boss?.kind === 'emperor';
      state.finishAt = timestamp + (prefs.reduced ? 450 : finaleClear ? 2250 : lostShip ? 1480 : 1370);
      state.pending = { terminal: end, run: f.run, replay: state.recording?.finish(f.ticks, end) };
      state.recording = null;
      void settle();
    }
  } else if (state.mode === 'resuming') {
    const wait = state.resumeAt - timestamp;
    if (wait <= 0) {
      clearInput();
      modal.close();
      state.mode = 'playing';
      pacing?.scene('flight');
      f.resumeProtection();
      globalThis.resetFixedStepClock(clock, timestamp);
      sky.focus({ preventScroll: true });
      audio.play('flight');
    } else if ($('countdown')) {
      $('countdown').textContent = Math.ceil(wait / 1000);
    }
  } else if (state.mode === 'finishing') {
    renderer.advanceEffects(Math.min(.06, Math.max(0, timestamp - state.finishingFrame) / 1000));
    state.finishingFrame = timestamp;
    renderer.draw(f, appearance(f.run.assistance));
    if (timestamp >= state.finishAt) showSettledResult();
  }
  requestAnimationFrame(loop);
}

function packCopy() {
  if (nativeFlight) return 'Bundled flight assets ready.';
  if (state.newPack) return 'A new browser build is ready.';
  if (state.pack === 'waiting') return 'Checking the offline flight pack…';
  if (state.pack === 'ready') return navigator.onLine ? 'Offline flight pack ready.' : 'Offline. Flight pack available.';
  if (!navigator.onLine) return 'Flight pack unavailable. Reconnect and reopen the game.';
  return state.pack === 'missing' ? 'Offline flight pack incomplete. Reload to download missing files.'
    : 'Offline access will be ready after the flight pack downloads.';
}

function checkPack() {
  const worker = navigator.serviceWorker?.controller;
  const check = ++state.packCheck;
  const update = (status) => {
    if (check !== state.packCheck) return;
    state.pack = status;
    const label = $('pack-status');
    if (label) label.textContent = packCopy();
  };
  update(worker ? 'waiting' : 'downloading');
  if (!worker) return;
  const probe = new MessageChannel();
  const timeout = setTimeout(() => {
    probe.port1.close();
    update('missing');
  }, 1500);
  probe.port1.onmessage = (reply) => {
    clearTimeout(timeout);
    probe.port1.close();
    if (reply.data?.ready && reply.data.version && check === state.packCheck) {
      const own = /\/arcade\/([a-f0-9]{15})\//.exec(new URL(document.baseURI).pathname)?.[1];
      state.newPack = own && own !== reply.data.version && /^[a-f0-9]{15}$/.test(reply.data.version) ? reply.data.version : null;
      showBrowserUpdate();
    }
    update(reply.data?.ready === true ? 'ready' : 'missing');
  };
  worker.postMessage('stellar-pack-status', [probe.port2]);
}

let registration;
let lastUpdateCheck = 0;
function lookForBrowserUpdate() {
  if (!registration || document.hidden || Date.now() - lastUpdateCheck < 60_000) return;
  lastUpdateCheck = Date.now();
  registration.update().catch(() => {});
}

async function boot() {
  if (/^\?build=[a-f0-9]{15}$/.test(location.search)) history.replaceState(null, '', '/');
  try { state.pilot = await store.open(); }
  catch { state.pilot = store.useTemporary(); }
  applyControlStyles(field, touchControlLayout(state.pilot.settings));
  audio.reflect(state.pilot.settings);
  const accountLink = googleSignInAvailable && location.hash === '#account';
  const returning = googleSignInAvailable && (pendingGoogleReturn() || accountLink);
  if (accountLink) history.replaceState(null, '', location.pathname + location.search);
  show(returning ? 'account' : 'home', returning);
  if (nativeFlight) {
    window.addEventListener('stellar-commerce-change', (event) => updateCommerce(event.detail));
    window.addEventListener('stellar-native-foreground', refreshCommerce);
    void refreshCommerce();
  }
  if (googleSignInAvailable) {
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && state.view === 'account' && pendingGoogleReturn()) void googleAccount.open(true);
    });
  }
  void loadSprite('kestrel');
  if (!nativeFlight && navigator.serviceWorker && document.documentElement.dataset.pack === 'true' && !document.documentElement.dataset.localPreview) {
    navigator.serviceWorker.addEventListener('controllerchange', checkPack);
    window.addEventListener('offline', checkPack);
    window.addEventListener('online', checkPack);
    navigator.serviceWorker.register('/sw.js').then((worker) => {
      registration = worker;
      lastUpdateCheck = Date.now();
      checkPack();
    }).catch(() => {});
    checkPack();
  }
  state.installed = nativeFlight || matchMedia('(display-mode: standalone)').matches;
  requestAnimationFrame(loop);
}

boot().catch(() => { menu.textContent = 'Flight systems unavailable. Reload the game to try again.'; });
