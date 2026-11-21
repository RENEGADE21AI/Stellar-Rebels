import { BOSSES, FIXED_TICK, HEIGHT, PICKUPS, RULES_VERSION, SHIPS, SPECIALS, STAGES, UPGRADES, WIDTH, stageById } from './catalog.mjs';
import { Flight } from './flight.mjs';
import { FlightScene, loadSprite, spriteUrl } from './scene.mjs';
import { FlightAudio } from './audio.mjs';
import { PilotStore, abandonRun, beginRun, equip, equipSpecial, hasShip, hasSpecial, hasStage, install, loadoutBest, normalizeCallSign, settleRun } from './pilot.mjs';
import { captureReplay } from './replay.mjs';
import { otherRealm, realmLabel } from './wraith.mjs';
import { mountTitlePatrol } from './title-patrol.mjs';
import { advanceTraining, startTraining } from './training.mjs';
import { createGoogleAccount, googleSignInAvailable, pendingGoogleReturn } from './account.mjs';

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const sky = $('sky');
const field = $('flight');
const modal = $('flight-modal');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const hapticAvailable = typeof navigator.vibrate === 'function' && navigator.maxTouchPoints > 0;
const store = new PilotStore(globalThis.indexedDB);
const audio = new FlightAudio();
const clock = globalThis.createFixedStepClock();
const renderer = new FlightScene(sky);
const state = {
  pilot: null, view: 'home', mode: 'menu', hangarTab: 'ships', inspected: 'kestrel', hangarBack: 'home',
  helpBack: 'home', upgrade: null, flight: null, pending: null, last: null, busy: null, launch: null,
  pointer: null, keys: new Set(), input: 'touch', support: '', pack: 'waiting', packCheck: 0, installed: false, resumeAt: 0, finishAt: 0
};
const motionLimited = (preferences = state.pilot.settings) => reduced.matches || preferences.reduced;
const appearance = (preferences) => motionLimited(preferences) === preferences.reduced
  ? preferences : { ...preferences, reduced: true };
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
  salvage: '<path d="M5.5 4h13l4 8-4 8h-13l-4-8zM5.5 4 9 12l-3.5 8m13-16L15 12l3.5 8M9 12h6"/>',
  barrier: '<path d="M12 3 20 6v5c0 4-3 8-8 10-5-2-8-6-8-10V6zM12 7v9"/>',
  overdrive: '<path d="m13 3-8 11h6l-1 7 9-12h-6z"/>',
  repair: '<path d="M12 4v16M4 12h16" stroke-width="3"/>',
  power: '<path d="m3 16 4-8 4 8m2 0 4-8 4 8"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  endless: '<path d="M9 10c-1.7-2.2-5.8-3.3-7 .3-1.2 3.4 2.4 6.6 5.6 3.9l8.9-6.6c3.2-2.7 6.8.5 5.6 3.9-1.1 3.6-5.3 2.5-7 .3"/>',
  arrowout: '<path d="M12 4h8v8m0-8-9 9m7 2v5H4V6h5"/>',
  edit: '<path d="m15 5 4 4M5 15l-1 5 5-1L20 8l-4-4Z"/>'
};
const icon = (name, cls = '') => `<svg aria-hidden="true" viewBox="0 0 24 24" class="icon ${cls}">${icons[name] ?? ''}</svg>`;
const format = new Intl.NumberFormat();
const num = (value) => format.format(value);
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

function home() {
  const callSign = normalizeCallSign(state.pilot.callSign) || 'Pilot';
  const ship = SHIPS[state.pilot.ship].name;
  return `<article class="title-screen"><h1 tabindex="-1" class="brand-lockup"><img src="${media('brand/title-wordmark.webp')}" alt="Stellar Rebels" width="768" height="310"></h1>
    <canvas class="title-patrol" aria-hidden="true"></canvas>
    <div class="title-actions">${saveNotice()}
      ${action('Play', 'fly:next', 'primary', 'play')}
      <div class="title-pilot">
        <button type="button" class="title-id" data-action="view:callSign" aria-label="Edit call sign" aria-describedby="title-call-sign">
          <span><small>Call sign</small><strong id="title-call-sign">${callSign}</strong></span>${icon('edit')}
        </button>
        <span class="title-equipped"><small>Equipped</small><strong>${ship}</strong></span>
      </div>
      <nav class="home-links" aria-label="Game options">
        <button class="home-link" data-action="view:stages">${icon('stages')} Arcade</button>
        <button class="home-link" data-action="hangar:home">${icon('ship')} Hangar</button>
        <button class="home-link" data-action="view:records">${icon('score')} Records</button>
        <button class="home-link" data-action="view:settings">${icon('settings')} Settings</button>
      </nav></div></article>`;
}

function callSignView() {
  const callSign = normalizeCallSign(state.pilot.callSign) ?? '';
  return screen('Call sign', 'home', `<form class="call-sign-form" id="call-sign-form">
    <label for="call-sign">Pilot name</label>
    <input id="call-sign" name="callSign" value="${callSign}" placeholder="Pilot" maxlength="32"
      autocapitalize="words" autocomplete="off" spellcheck="false" aria-describedby="call-sign-hint call-sign-error">
    <p class="subtle" id="call-sign-hint">Up to 16 characters. Letters, numbers, spaces, and hyphens.</p>
    <p class="notice" id="call-sign-error" role="status" hidden></p>
    <button class="primary" type="submit">Save call sign ${icon('check')}</button>
  </form>`);
}

function nextStage(pilot) {
  return STAGES.find((stage) => !pilot.clears[stage.id] && hasStage(pilot, stage.id));
}

function loadoutContext(pilot) {
  const special = SPECIALS[pilot.special]?.name ?? SPECIALS.ghost.name;
  const mods = pilot.equipment.length;
  return `${special} · ${mods ? `${mods} upgrade${mods === 1 ? '' : 's'}` : 'Stock'}`;
}

function stages() {
  const { pilot } = state;
  const next = nextStage(pilot);
  const rows = STAGES.map((s) => {
    const available = hasStage(pilot, s.id);
    const clear = Boolean(pilot.clears[s.id]);
    const tag = available ? clear ? `${icon('check')} Replay` : 'Launch' : `${icon('lock')} Locked`;
    const record = available ? loadoutBest(pilot, s.id) : null;
    const mastered = Boolean(pilot.mastery?.[s.mastery?.key ?? s.id]);
    const goal = s.mastery?.condition === 'parts' ? 'Disarm both turrets' : 'No hull loss at boss';
    let note = s.region;
    let nextGoal = '';
    if (!available) note = `Clear ${stageById(s.id - 1)?.name ?? 'the previous stage'}`;
    else if (record?.status === 'clear') {
      note = `${num(record.score)} loadout best${mastered ? ' · Mastered' : ''}`;
      if (s.mastery && !mastered) nextGoal = `<span class="stage-mastery-goal">${goal}</span>`;
    }
    else if (clear && s.mastery) {
      note = mastered ? 'Set a loadout best' : goal;
    } else if (record) note = `${num(record.score)} best attempt`;
    return `<li><button class="stage ${s.id === next?.id ? 'next' : ''}" style="--stage-color:${s.accent}" data-action="fly:${s.id}" ${available ? '' : 'disabled'}>
      <span class="stage-num">${chapter(s.id)}</span><span><span class="stage-name">${s.name}</span><span class="stage-note">${note}${nextGoal}</span></span>
      <span class="stage-tag">${tag}</span></button></li>`;
  }).join('');
  const survival = loadoutBest(pilot, null);
  return screen('Stage Select', 'home', `
    <div class="cardline"><div class="stage-loadout"><strong>${SHIPS[pilot.ship].name}</strong><small>${loadoutContext(pilot)}</small></div><button data-action="hangar:stages">Change ship ${icon('next')}</button></div>
    ${action('Practice', 'help:stages', 'quiet', 'play')}
    <ol class="stage-list" aria-label="Arcade stages">${rows}</ol>
    <div class="support-actions"><div class="endless-entry">${action('Endless', 'fly:endless', 'quiet', 'endless', 'aria-describedby="endless-note"')}
    <small id="endless-note">${survival ? `${time(survival.duration)} loadout best` : 'Survival record'} · 0 Salvage</small></div></div>`, wallet());
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
  const shopOpen = state.hangarTab === 'upgrades';
  const selection = Object.entries(SHIPS).filter(([, ship]) => ship.clearance <= STAGES.length).map(([key, ship]) => {
    const copy = key === pilot.ship ? 'Equipped' : hasShip(pilot, key) ? ship.role : `Clear ${chapter(ship.clearance)}`;
    return `<button class="craft-choice" data-action="inspect:${key}" aria-pressed="${key === state.inspected}">${ship.name}<small>${copy}</small></button>`;
  }).join('');
  const availableAssets = state.inspected === 'kestrel' || STAGES.length >= SHIPS[state.inspected].clearance;
  const bay = `<div class="turntable"><span class="pad"></span>${availableAssets ? `<img class="craft-art" src="${spriteUrl(state.inspected)}" alt="${craft.name}" width="240" height="240">` : ''}</div>
    <div class="ship-identity"><h2>${craft.name}</h2>${craft.name === craft.role ? '' : `<span class="caption">${craft.role}</span>`}</div><p class="subtle">${craft.description}</p>
    <div class="craft-specs"><span>${craft.hull + Number(pilot.equipment.includes('hull'))} hull</span><span>${craft.speed >= 370 ? 'Agile' : craft.speed < 280 ? 'Heavy' : 'Balanced'} handling</span></div>
    <div class="craft-grid" role="group" aria-label="Available ships">${selection}</div>
    ${owned ? action(active ? 'Equipped' : `Equip ${craft.name}`, `equip:${state.inspected}`, active ? 'quiet' : 'primary', active ? 'check' : 'next', active ? 'disabled' : '') : `<div class="notice">Clear ${stageById(craft.clearance)?.name ?? `stage ${craft.clearance}`} to unlock ${craft.name}.</div>`}`;
  const shop = `<div class="shop-list">${Object.entries(UPGRADES).map(([key, item]) => {
    const installed = pilot.equipment.includes(key);
    const prereq = item.needs && !pilot.equipment.includes(item.needs) ? ` · Requires ${UPGRADES[item.needs].name}` : '';
    return `<button class="shop-card" data-action="upgrade:${key}">${icon(item.icon, 'icon-large')}<span><strong>${item.name}</strong><small>${item.detail}${prereq}</small></span>
      <span class="price">${installed ? 'Installed' : num(item.cost)}</span></button>`;
  }).join('')}</div>`;
  return screen('Hangar', state.hangarBack, tabs + (shopOpen ? shop : bay), wallet());
}

function upgradeView() {
  const target = UPGRADES[state.upgrade];
  const p = state.pilot;
  const installed = p.equipment.includes(state.upgrade);
  const locked = target.needs && !p.equipment.includes(target.needs);
  const afford = p.salvage >= target.cost;
  const copy = installed ? 'Installed on every ship.' : locked ? `Requires ${UPGRADES[target.needs].name}.` : !afford ? `Earn ${num(target.cost - p.salvage)} more Salvage.` : `${num(p.salvage - target.cost)} Salvage left after installation.`;
  return screen(target.name, 'hangar', `<div class="notice"><strong>${target.detail}</strong><p>${copy}</p></div>
    ${action(installed ? 'Installed' : `Install for ${num(target.cost)} Salvage`, 'install', 'primary', 'check', installed || locked || !afford ? 'disabled' : '')}`, wallet());
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
  const mods = (record.equipment ?? []).flatMap((key) => Object.hasOwn(UPGRADES, key) ? [UPGRADES[key].name] : []).join(', ') || 'Stock';
  const notes = [SHIPS[record.ship]?.name ?? 'Fighter', SPECIALS[record.special]?.name ?? SPECIALS.ghost.name, mods, ...assistance];
  if (record.stage === 5 && record.rules === 'arcade-1') notes.push('Original route · Gravity Platform');
  const version = recordVersion(record);
  notes.push(record.rules === RULES_VERSION ? 'Current rules' : version ? `Earlier rules ${version}` : 'Earlier rules');
  return notes.join(' · ');
}

function records() {
  const { pilot } = state;
  const { arcade, endless, history = {} } = pilot.records;
  const rows = STAGES.map((s) => {
    const best = loadoutBest(pilot, s.id);
    if (!best) return '';
    return recordLine(s.name, `${best.status === 'clear' ? 'Clear' : 'Best attempt'} · ${time(best.duration)}`, num(best.score));
  }).join('');
  const bestSurvival = loadoutBest(pilot, null);
  const survival = bestSurvival ? recordLine('Endless survival', `${num(bestSurvival.score)} points`, time(bestSurvival.duration)) : '';
  const archived = Object.values(history);
  const careerRows = STAGES.flatMap((s) => [arcade[s.id], ...archived.filter((r) => r.mode === 'arcade' && r.stage === s.id)]
    .filter(Boolean).sort((a, b) => recordVersion(b) - recordVersion(a))
    .map((r) => recordLine(s.name, `${r.status === 'clear' ? 'Cleared' : 'Best attempt'} · ${time(r.duration)} · ${recordContext(r)}`, num(r.score)))).join('');
  const careerSurvival = [endless, ...archived.filter((r) => r.mode === 'endless')].filter(Boolean)
    .sort((a, b) => recordVersion(b) - recordVersion(a))
    .map((r) => recordLine('Endless survival', `${num(r.score)} points · ${recordContext(r)}`, time(r.duration))).join('');
  const career = careerRows || careerSurvival ? `<details class="career-records" ${rows || survival ? '' : 'open'}><summary>Career records</summary>
    <div class="career-list">${careerRows}${careerSurvival}</div></details>` : '';
  const earned = STAGES.filter((s) => s.mastery && pilot.mastery?.[s.mastery.key ?? s.id]).map((s) => s.mastery.name);
  if (pilot.mastery?.[5]) earned.push('Gravity Platform mastery · Original route');
  const mastery = earned.length ? `<section class="record-heading" aria-labelledby="record-mastery">
    <h2 id="record-mastery">Mastery</h2><ul class="mastery-list">${earned.map((name) => `<li>${name}</li>`).join('')}</ul></section>` : '';
  return screen('Records', 'home', `<div class="record-heading"><h2>Current loadout</h2><p class="subtle">${SHIPS[pilot.ship].name} · ${loadoutContext(pilot)}</p></div>
    ${rows || survival ? rows + survival : '<p class="subtle">Fly with this loadout to set a record.</p>'}${mastery}${career}`);
}

const settings = {
  music: ['Music', 'Hangar and flight tracks'], effects: ['Sound effects', 'Weapons, hits, pickups and warnings'],
  haptics: ['Vibration', 'Short pulses for hits and abilities'],
  reduced: ['Reduced motion', 'Steady camera and fewer flashes'], contrast: ['High contrast hazards', 'Brighter projectile centers and warning outlines']
};

function settingsView() {
  const prefs = appearance(state.pilot.settings);
  const switches = Object.entries(settings).filter(([key]) => key !== 'haptics' || hapticAvailable).map(([key, [label, copy]]) => {
    const systemMotion = key === 'reduced' && reduced.matches;
    const on = key === 'haptics' ? prefs.haptics !== false : prefs[key];
    return `<div class="setting"><span><strong>${label}</strong><small>${systemMotion ? 'On in your device settings' : copy}</small></span>
      <button class="toggle" data-action="toggle:${key}" aria-label="${label}" aria-pressed="${on}" ${systemMotion ? 'disabled' : ''}>${on ? 'On' : 'Off'}</button></div>`;
  }).join('');
  return screen('Settings', 'home', `${switches}<div class="setting"><div><strong>Drag sensitivity</strong><small>Changes how far the ship follows a swipe</small></div>
    <select class="toggle" id="sensitivity" aria-label="Drag sensitivity"><option value="gentle" ${prefs.sensitivity === 'gentle' ? 'selected' : ''}>Gentle</option><option value="standard" ${prefs.sensitivity === 'standard' ? 'selected' : ''}>Standard</option><option value="direct" ${prefs.sensitivity === 'direct' ? 'selected' : ''}>Direct</option></select></div>
    <div class="notice" id="pack-status" role="status">${packCopy()}</div>${state.installed ? '' : '<p class="subtle">Install from your browser menu or Add to Home Screen in Safari.</p>'}
    ${googleSignInAvailable ? action('Account', 'view:account') : ''}
    ${action('Practice', 'help:settings', 'quiet')}${state.support ? `<p class="notice">${state.support}</p>` : ''}`);
}

function accountView() {
  return screen('Account', 'settings', `<div class="info account-panel">
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
    ['Drag to steer', 'Drag anywhere on the playfield. Lift and touch again to reanchor. Arrow keys and WASD also steer.'],
    ['Line up your shots', 'Weapons fire automatically. Aim by placing your ship beneath the target.'],
    ['Energy', 'Start each flight with full energy. It recharges over time when you aren’t phasing. Hits and kills charge it faster.'],
    ['Specials', 'Equip a Special in the Hangar. Tap its button or press Space to use it. Ghost Shift phases through physical fire for one second. Ion Burst clears nearby physical shots.'],
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
  if (!previous) return endless ? 'Survival record set' : receipt.status === 'clear' ? 'First clear with this loadout' : '';

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

const retryAdvice = {
  debris: 'Fly through the opening between the rocks.',
  rail: 'Leave the striped lane before the rail fires.',
  spectral: 'Dodge hollow rounds while you are in the ghost realm.',
  collision: 'Keep your cockpit clear of enemy hulls.',
  fire: 'Move across incoming fire and save your Special for tight spots.'
};

function results() {
  const p = state.pending;
  const report = p.receipt ?? p.terminal;
  const clear = report.status === 'clear';
  const isEndless = p.run.mode === 'endless';
  const stage = stageById(p.run.stage);
  const finale = clear && stage?.id === 6;
  const relayCleared = clear && stage?.id === 3;
  const next = p.receipt && clear && stageById(stage.id + 1);
  const title = finale ? 'Fleet defeated' : relayCleared ? 'Relay offline' : clear ? 'Stage clear' : isEndless ? 'Run complete' : 'Flight lost';
  const repeat = isEndless ? 'Fly again' : clear ? 'Replay stage' : 'Retry stage';
  const retry = `fly:${isEndless ? 'endless' : stage.id}`;
  const progression = p.receipt?.award ? `<p class="result-reward">${icon('salvage')} <span>+${num(p.receipt.award)} Salvage ${store.temporary ? 'this session' : 'banked'}</span>${p.receipt.first ? '<small>First clear</small>' : ''}</p>` : '';
  const unlocked = [
    p.receipt?.newStage ? `${stageById(p.receipt.newStage).name} unlocked` : null,
    p.receipt?.newSpecial === 'ion' ? 'Ion Burst unlocked' : null
  ].filter(Boolean);
  const ship = p.receipt?.newShip ? action(`${SHIPS[p.receipt.newShip].name} unlocked`, `unlocked:${p.receipt.newShip}`, 'quiet', 'ship') : '';
  const pendingCopy = p.discarded ? '<p class="result-warning" role="status">This flight was temporary. Your existing device save is active.</p>'
    : !p.receipt ? `<p class="result-warning" role="status">${p.error || 'Saving flight…'}</p>` : '';
  const buyable = p.receipt && clear && Object.entries(UPGRADES).some(([key,item]) =>
    !state.pilot.equipment.includes(key) && (!item.needs || state.pilot.equipment.includes(item.needs)) && state.pilot.salvage >= item.cost);
  const primary = p.discarded ? action('Return to stages', 'view:stages', 'primary')
    : !p.receipt ? (p.error ? action('Retry saving', 'settle', 'primary', 'check') : '')
    : next ? action('Next Flight', `fly:${next.id}`, 'primary', 'next', `aria-label="Next Flight · ${next.name}"`)
      : finale ? action('Return to stages', 'view:stages', 'primary') : action(repeat, retry, 'primary');
  const mastery = p.receipt && clear && stage?.mastery ? `<p class="subtle">${p.receipt.mastery ? `Mastery earned · ${stage.mastery.name}`
    : p.receipt.masteryMet ? `Mastery repeated · ${stage.mastery.name}` : stage.mastery.detail}</p>` : '';
  const comparison = resultComparison(p.receipt);
  const cause = p.terminal.damageCause;
  const advice = !clear && Object.hasOwn(retryAdvice, cause) ? retryAdvice[cause] : '';
  const secondary = [
    p.receipt && !finale ? action('Arcade', 'view:stages', 'quiet', '') : '',
    p.receipt || p.discarded ? action('Title Screen', 'view:home', 'quiet', '') : '',
    p.receipt && (next || finale) ? action(repeat, retry, 'quiet', '') : '',
    p.receipt ? action(buyable ? 'Upgrades' : 'Hangar', buyable ? 'shop:result' : 'hangar:result', 'quiet', '') : '',
    !p.receipt && p.error ? action('Leave unsaved', 'discard', 'quiet', '') : '',
    ship
  ].filter(Boolean);
  return `<article class="screen result-screen" data-outcome="${clear ? 'clear' : 'finished'}">
    <div class="result-card">
      ${saveNotice()}
      <header class="result-heading"><span class="caption">${finale ? 'Campaign complete' : isEndless ? 'Endless' : stage.name}</span>
        <h1 tabindex="-1">${title}</h1>
      </header>
      <section class="result-facts" aria-label="Flight stats">
        <div class="result-score"><span class="caption">Score</span><strong>${num(report.score)}</strong></div>
        <div><span class="caption">Flight time</span><strong>${time(report.duration)}</strong></div>
        <div><span class="caption">Targets</span><strong>${num(report.kills)}</strong></div>
      </section>
      ${progression || mastery || comparison || advice || unlocked.length ? `<div class="result-earned">
        ${comparison ? `<p class="result-comparison">${comparison}</p>` : ''}
        ${mastery}${advice ? `<p class="subtle">${advice}</p>` : ''}${progression}
        ${unlocked.length ? `<ul class="result-unlocks">${unlocked.map((label) => `<li>${icon('check')}${label}</li>`).join('')}</ul>` : ''}
      </div>` : ''}
      ${pendingCopy}${primary}
      ${secondary.length ? `<nav class="result-secondary" aria-label="After the flight">${secondary.join('')}</nav>` : ''}
      ${p.replay ? action('Save flight replay', 'save-replay', 'flat replay-link', '') : ''}
    </div>
  </article>`;
}

function launchView() {
  return `<article class="screen launch-screen"><header class="screen-header"><p class="caption">${state.launch.name}</p>
    <h1 tabindex="-1">Preparing flight</h1></header>
    <p class="notice" role="status">Loading flight assets…</p>${action('Cancel launch', 'cancel-flight', 'quiet', 'back')}</article>`;
}

const views = { home, callSign: callSignView, stages, hangar, upgrade: upgradeView, records, settings: settingsView, account: accountView, help: helpView, result: results, launch: launchView };

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
  if (!views[view] || (view === 'account' && !googleSignInAvailable)) return;
  $('frame').dataset.reducedMotion = String(motionLimited());
  state.mode = 'menu';
  state.view = view;
  field.hidden = true;
  menu.hidden = false;
  menu.innerHTML = views[view]();
  refreshPatrol();
  showBrowserUpdate();
  menu.scrollTop = 0;
  if (focus) menu.querySelector('h1')?.focus({ preventScroll: true });
  if (view === 'settings') checkPack();
  if (view === 'account') {
    paintAccount();
    void googleAccount.open();
  }
  lookForBrowserUpdate();
  audio.play('hangar');
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

function needsTraining() {
  const { pilot } = state;
  return !pilot.settings.trainingDone && !Object.keys(pilot.clears).length &&
    !Object.keys(pilot.records.arcade).length && !pilot.records.endless && !pilot.salvage;
}

async function start(which, trainingMode = null, drill = 'basics') {
  const endless = which === 'endless';
  const chooseStage = (pilot) => endless ? null : which === 'next'
    ? (nextStage(pilot) ?? STAGES.at(-1)).id : Number(which);
  const stage = chooseStage(state.pilot);
  const launch = { controller: new AbortController(), from: state.training?.from ?? state.view, which,
    control: trainingMode === 'practice' ? `practice:${drill}` : `fly:${which}`,
    name: trainingMode ? 'Practice' : endless ? 'Endless' : stageById(stage)?.name };
  if (!launch.name) return;
  let run;
  let launched = false;
  state.launch = launch;
  audio.effect('launch');
  const title = !menu.hidden && menu.querySelector('.title-screen');
  const fromPractice = !field.hidden && state.flight?.practice;
  if (title) {
    title.classList.add('is-launching');
    title.querySelector('.title-actions').inert = true;
    state.titlePatrol?.launch();
    const status = document.createElement('div');
    status.className = 'launch-status';
    status.innerHTML = '<p role="status">Launching…</p>' + action('Cancel launch', 'cancel-flight', 'quiet', '');
    title.append(status);
    status.querySelector('button').focus({ preventScroll:true });
  } else if (fromPractice) {
    state.mode = 'launching';
    clearInput();
    field.querySelector('.flight-controls').inert = true;
    $('training-actions').innerHTML = '<span class="caption" role="status">Joining Arcade…</span>';
  } else show('launch');
  try {
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (trainingMode) {
      const special = trainingMode === 'practice' && drill === 'special' ? state.pilot.special : 'ghost';
      run = { id:readId(), mode:'arcade', stage:1, ship:'kestrel', equipment:[], special, assistance:{ ...state.pilot.settings }, seed };
    } else {
      const saved = await store.change((pilot) => beginRun(pilot, readId(), endless ? 'endless' : 'arcade', chooseStage(pilot), Date.now(), seed));
      state.pilot = saved.pilot;
      run = saved.result;
    }
    if (launch.controller.signal.aborted) return;
    if (!run) {
      restoreLaunch(launch, 'This stage is locked.');
      return;
    }
    const recording = trainingMode ? null : captureReplay(run);
    const flight = new Flight(run, { recordInput: recording?.recordInput });
    const prepared = renderer.prepare(flight, launch.controller.signal);
    if ((title || fromPractice) && !motionLimited(run.assistance)) {
      await new Promise((done) => setTimeout(done, title ? 420 : 260));
    }
    if (!await prepared || launch.controller.signal.aborted) return;
    state.titlePatrol?.stop();
    state.titlePatrol = null;
    state.training = trainingMode ? { ...startTraining(flight, drill), mode:trainingMode, from:launch.from, which } : null;
    state.returnView = launch.from === 'home' ? 'home' : 'stages';
    state.last = run;
    state.recording = recording;
    state.flight = flight;
    state.mode = 'playing';
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

function dialog(html) {
  modal.innerHTML = `<div class="dialog-body">${html}</div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector('button')?.focus();
}

function pause(interrupted = false) {
  if (!['playing', 'resuming', 'paused'].includes(state.mode)) return;
  if (state.mode === 'paused' && interrupted) return;
  clearInput();
  state.mode = 'paused';
  $('pause').setAttribute('aria-label', 'Pause');
  audio.quiet();
  const flight = state.flight;
  dialog(`<span class="caption">${flight.endless ? 'Endless' : flight.stage.name}</span><h2 id="pause-title">Paused</h2>
    <p>${interrupted ? 'Flight paused while you were away.' : 'Your flight is on hold.'}</p>${action('Resume', 'resume', 'primary', 'play')}${action('Leave flight', 'leave', 'quiet', '')}`);
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
  const label = training.mode === 'intro' ? done ? 'Start arcade' : 'Skip training' : done ? 'Done' : 'End practice';
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
  if (training.mode === 'intro' || (training.drill === 'basics' && training.step === 'complete')) {
    const saved = await store.change((pilot) => { pilot.settings.trainingDone = true; }).catch(() => null);
    if (saved) state.pilot = saved.pilot;
  }
  state.training = null;
  if (training.mode === 'intro') {
    state.view = training.from;
    await start(training.which);
  } else show(training.from);
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
  const active = p.realm === 'ghost';
  const action = f.realmHop ? 'Hop' : p.ghostTime ? `${(Math.ceil(p.ghostTime * 10) / 10).toFixed(1)}s` : p.ghostRecovery ? 'Wait' : special.label;
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
  const skyAction = f.realmHop ? 'to Hop between realms' : `for ${special.name}`;
  if (lastHud.skyAction !== skyAction) {
    lastHud.skyAction = skyAction;
    sky.setAttribute('aria-label', `Flight playfield. Drag or use arrow keys to steer. Weapons fire automatically. Press Space ${skyAction}.`);
  }
  $('ghost-shift').setAttribute('aria-label', f.realmHop ? `Hop to ${destination} realm` : special.name);
  content('ghost-label', f.realmHop ? `To ${destination}` : f.special === 'ion' ? 'Ion' : 'Ghost');
  const remaining = `${energy} energy. ${f.realmHop ? 'Hop' : special.name} costs ${f.ghostCost}.`;
  const recovery = p.ghostRecovery ? ` ${f.realmHop ? 'Hop' : special.name} is recovering.` : '';
  content('ghost-status', f.realmHop ? `Current realm is ${realmLabel(p.realm)}. ${remaining}${recovery}`
    : p.ghostTime ? `${action} of phasing remaining.` : remaining + recovery);
}

function refreshHud(restart = false) {
  const f = state.flight;
  const p = f.player;
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
    const tip = pickup ? message.title && message.brief !== message.title ? message.brief : '' : message?.copy;
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
      announce([message.title, message.copy].filter(Boolean).join('. '));
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
  } catch (error) {
    p.error = error.message === 'Run unavailable' ? 'This run is no longer available to save.' : 'Flight save unavailable. Retry saving to bank the result.';
  } finally {
    p.working = false;
    if (state.pending === p && state.view === 'result' && state.mode === 'menu') show('result', true);
  }
}

async function changeSetting(key, value) {
  const { pilot } = await store.change((saved) => { saved.settings[key] = value; });
  state.pilot = pilot;
  audio.reflect(pilot.settings);
  show('settings', false);
  menu.querySelector(key === 'sensitivity' ? '#sensitivity' : `[data-action="toggle:${key}"]`)?.focus();
}

async function handle(command) {
  const [type, value] = command.split(':');
  if (type === 'save-replay') {
    const replay = state.pending?.replay;
    if (!replay) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(replay)], { type:'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `stellar-rebels-${replay.run.seed.slice(0, 12)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
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
    else if (value === 'home' && state.view === 'callSign') returnToPilot();
    else show(value);
    return;
  }
  if (type === 'account' && state.view === 'account') {
    if (value === 'sign-in') void googleAccount.signIn();
    if (value === 'sign-out') void googleAccount.signOut();
    if (value === 'retry') void googleAccount.open();
    return;
  }
  if (type === 'hangar') { showHangar(value); return; }
  if (type === 'shop') { showHangar(value, state.pilot.ship, 'upgrades'); return; }
  if (type === 'unlocked') { showHangar('result', value); return; }
  if (type === 'help') { state.helpBack = value; show('help'); return; }
  if (type === 'practice') { await start('1', 'practice', value); return; }
  if (type === 'finish-practice') { await finishPractice(); return; }
  if (type === 'fly') {
    const firstStage = value === 'next' || value === '1';
    await start(value, firstStage && needsTraining() ? 'intro' : null);
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
    const { pilot, result } = await store.change((saved) => install(saved, state.upgrade));
    state.pilot = pilot;
    if (result) audio.chord([490, 620, 742], .14, .079);
    announce(result ? `${UPGRADES[state.upgrade].name} installed.` : 'Upgrade unavailable.');
    show('upgrade');
    return;
  }
  if (type === 'toggle' && Object.hasOwn(settings, value)) {
    await changeSetting(value, value === 'haptics' ? state.pilot.settings.haptics === false : !state.pilot.settings[value]);
    return;
  }
  if (type === 'pause') { pause(); return; }
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

function returnToPilot() {
  show('home', false);
  menu.querySelector('[data-action="view:callSign"]').focus({ preventScroll: true });
}

menu.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id !== 'call-sign-form') return;
  event.preventDefault();
  if (state.busy) return;
  const input = form.elements.callSign;
  const status = $('call-sign-error');
  const callSign = normalizeCallSign(input.value);
  if (callSign === null) {
    status.textContent = 'Enter up to 16 letters, numbers, spaces, or hyphens.';
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
    returnToPilot();
    announce(store.temporary ? 'Call sign set for this session.' : 'Call sign saved.');
  } catch {
    status.textContent = 'Device storage is unavailable. Try again.';
    status.hidden = false;
  } finally {
    if (state.busy === command) state.busy = null;
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button[data-action]');
  if (target?.dataset.action === 'cancel-flight' && state.launch) { restoreLaunch(state.launch); return; }
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

menu.addEventListener('change', (event) => {
  if (event.target.id === 'sensitivity') changeSetting('sensitivity', event.target.value).catch(() => announce('Drag sensitivity could not be saved.'));
});
$('pause').innerHTML = icon('pause');
$('pause').addEventListener('click', () => pause());
function useShift() {
  if (state.mode !== 'playing' || !state.flight.activateGhost()) return;
  state.flight.usedShift = true;
  audio.unlock();
  refreshHud();
}
$('ghost-shift').addEventListener('click', useShift);
$('ghost-shift').addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' && !event.isPrimary) {
    event.preventDefault();
    useShift();
  }
});
modal.addEventListener('cancel', (event) => { event.preventDefault(); if (state.mode === 'resuming') pause(); });

sky.addEventListener('pointerdown', (event) => {
  if (state.mode !== 'playing' || state.pointer || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  audio.unlock();
  state.input = event.pointerType === 'mouse' ? 'pointer' : 'touch';
  if (state.keys.size) clearInput();
  state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  sky.setPointerCapture(event.pointerId);
});

function movePointer(event) {
  const pointer = state.pointer;
  if (!pointer || pointer.id !== event.pointerId || state.mode !== 'playing') return false;
  const sensitivity = { gentle: .78, standard: 1.12, direct: 1.37 }[state.flight.run.assistance.sensitivity] ?? 1.12;
  state.flight.drag((event.clientX - pointer.x) / renderer.unit * sensitivity, (event.clientY - pointer.y) / renderer.unit * sensitivity);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  return true;
}

sky.addEventListener('pointermove', movePointer);
sky.addEventListener('pointerup', (event) => {
  if (!movePointer(event)) return;
  // Keep a short swipe that finished between simulation ticks. Limit long flicks
  // so the ship never keeps travelling across the arena after the pilot lifts.
  const flight = state.flight;
  const dx = flight.xIntent - flight.player.x;
  const dy = flight.yIntent - flight.player.y;
  const distance = Math.hypot(dx, dy);
  const releaseTravel = flight.ship.speed * .19;
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
  if (event.key === 'Escape' && state.launch) {
    event.preventDefault();
    if (!event.repeat) restoreLaunch(state.launch);
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

const hapticPulse = { hurt:18, barrier:11, ghostStart:9, realmHop:9, ionBurst:12, bossDown:28, playerDown:25 };
let lastHaptic = -Infinity;

function pulseFeedback(events, timestamp) {
  if (!hapticAvailable || state.input !== 'touch' || state.pilot.settings.haptics === false ||
      document.hidden || timestamp - lastHaptic < 140) return;
  let length = 0;
  for (const { type } of events) length = Math.max(length, hapticPulse[type] ?? 0);
  if (length) {
    navigator.vibrate(length);
    lastHaptic = timestamp;
  }
}

function loop(timestamp) {
  const f = state.flight;
  if (state.mode === 'playing') {
    const prefs = appearance(f.run.assistance);
    const tick = globalThis.advanceFixedStep(clock, timestamp, (dt) => {
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
      if (end.status === 'defeat') field.dataset.ending = 'defeat';
      state.finishAt = timestamp + (prefs.reduced ? 450 : end.status === 'defeat' ? 1480 : 1370);
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
    if (timestamp >= state.finishAt) show('result');
  }
  requestAnimationFrame(loop);
}

function packCopy() {
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
  audio.reflect(state.pilot.settings);
  const returning = googleSignInAvailable && pendingGoogleReturn();
  show(returning ? 'account' : 'home', returning);
  if (googleSignInAvailable) {
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && state.view === 'account' && pendingGoogleReturn()) void googleAccount.open(true);
    });
  }
  void loadSprite('kestrel');
  if (navigator.serviceWorker && document.documentElement.dataset.pack === 'true' && !document.documentElement.dataset.localPreview) {
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
  state.installed = matchMedia('(display-mode: standalone)').matches;
  requestAnimationFrame(loop);
}

boot().catch(() => { menu.textContent = 'Flight systems unavailable. Reload the game to try again.'; });
