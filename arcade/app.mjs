import { BOSSES, HEIGHT, PICKUPS, SHIPS, STAGES, UPGRADES, WIDTH, stageById } from './catalog.mjs';
import { Flight } from './flight.mjs';
import { FlightScene, loadSprite, spriteUrl } from './scene.mjs';
import { FlightAudio } from './audio.mjs';
import { PilotStore, abandonRun, beginRun, equip, hasShip, hasStage, install, legacyArchive, settleRun } from './pilot.mjs';

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const sky = $('sky');
const field = $('flight');
const modal = $('flight-modal');
const legacyUrl = 'https://star-strike-rush.web.app/';
const archive = (() => {
  try { return legacyArchive(localStorage); } catch { return legacyArchive(null); }
})();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const store = new PilotStore(globalThis.indexedDB, { reduced: reduced.matches, ...archive.settings });
const audio = new FlightAudio();
const clock = globalThis.createFixedStepClock();
const renderer = new FlightScene(sky);
const state = {
  pilot: null, view: 'home', mode: 'menu', hangarTab: 'ships', inspected: 'kestrel', hangarBack: 'home',
  helpBack: 'home', upgrade: null, flight: null, pending: null, last: null, busy: false,
  pointer: null, keys: new Set(), input: 'touch', support: '', pack: 'waiting', packCheck: 0, installed: false, resumeAt: 0, finishAt: 0
};

const icons = {
  next: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m15 5-7 7 7 7"/>',
  play: '<path fill="currentColor" stroke="none" d="M7 4.6 19 12 7 19.4z"/>',
  pause: '<path stroke-width="3" d="M8.2 5v14m7.6-14v14"/>',
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
  arrowout: '<path d="M12 4h8v8m0-8-9 9m7 2v5H4V6h5"/>'
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
  return `<article class="title-screen"><h1 tabindex="-1" class="brand-lockup"><img src="${media('brand/stacked-light.svg')}" alt="Stellar Rebels" width="336" height="201"></h1>
    <img class="title-craft" alt="" src="${media('environment/title-craft.webp')}" width="720" height="720">
    <div class="title-actions">${saveNotice()}${action('Play', 'view:stages', 'primary', 'play')}
      <nav class="home-links" aria-label="Hangar and records">
        <button class="home-link" data-action="hangar:home">${icon('ship')} Hangar</button>
        <button class="home-link" data-action="view:records">${icon('score')} Records</button>
        <button class="home-link" data-action="view:settings">${icon('settings')} Settings</button>
      </nav></div></article>`;
}

function stages() {
  const { pilot } = state;
  const next = STAGES.find((s) => !pilot.clears[s.id] && hasStage(pilot, s.id));
  const rows = STAGES.map((s) => {
    const available = hasStage(pilot, s.id);
    const clear = Boolean(pilot.clears[s.id]);
    const tag = available ? clear ? `${icon('check')} Replay` : 'Launch' : `${icon('lock')} Locked`;
    let note = s.region;
    if (!available) note = `Clear ${stageById(s.id - 1)?.name ?? 'the previous stage'}`;
    else if (clear && s.mastery) {
      note = pilot.mastery?.[s.mastery.key ?? s.id] ? 'Mastered'
        : s.mastery.condition === 'parts' ? 'Destroy both turrets first' : 'Keep hull intact in the boss fight';
    }
    return `<li><button class="stage ${s.id === next?.id ? 'next' : ''}" style="--stage-color:${s.accent}" data-action="fly:${s.id}" ${available ? '' : 'disabled'}>
      <span class="stage-num">${chapter(s.id)}</span><span><span class="stage-name">${s.name}</span><span class="stage-note">${note}</span></span>
      <span class="stage-tag">${tag}</span></button></li>`;
  }).join('');
  return screen('Stage Select', 'home', `
    <div class="cardline"><strong>${SHIPS[pilot.ship].name} equipped</strong><button data-action="hangar:stages">Change ship ${icon('next')}</button></div>
    <ol class="stage-list" aria-label="Arcade stages">${rows}</ol>
    <div class="support-actions"><div class="endless-entry">${action('Endless', 'fly:endless', 'quiet', 'endless', 'aria-describedby="endless-note"')}
    <small id="endless-note">Survival record · 0 Salvage</small></div>${action('Flight school', 'help:stages', 'flat', '')}</div>`, wallet());
}

function hangar() {
  const { pilot } = state;
  const craft = SHIPS[state.inspected];
  const owned = hasShip(pilot, state.inspected);
  const active = pilot.ship === state.inspected;
  const shopOpen = state.hangarTab === 'upgrades';
  const tabs = `<div class="dock-tabs" role="group" aria-label="Hangar sections">
    <button class="hangar-tab" data-action="tab:ships" aria-pressed="${!shopOpen}">Ship bay</button>
    <button class="hangar-tab" data-action="tab:upgrades" aria-pressed="${shopOpen}">Upgrades</button></div>`;
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

function recordContext(record) {
  const assistance = [];
  if (record.assistance.reduced) assistance.push('Reduced motion');
  if (record.assistance.contrast) assistance.push('High contrast');
  if (['gentle', 'direct'].includes(record.assistance.sensitivity)) assistance.push(`${record.assistance.sensitivity} drag`);
  const mods = record.equipment.flatMap((key) => Object.hasOwn(UPGRADES, key) ? [UPGRADES[key].name] : []).join(', ') || 'Stock';
  return `${SHIPS[record.ship]?.name ?? 'Fighter'} · ${mods}${assistance.length ? ` · ${assistance.join(', ')}` : ''}`;
}

function records() {
  const { arcade, endless } = state.pilot.records;
  const rows = STAGES.filter((s) => arcade[s.id]).map((s) => {
    const r = arcade[s.id];
    const badges = [];
    if (state.pilot.mastery?.[s.mastery?.key ?? s.id]) badges.push('Mastered');
    if (s.id === 5 && state.pilot.mastery?.[5]) badges.push('Gravity Platform mastery');
    if (s.id === 5 && r.rules === 'arcade-1') badges.push('Original route score');
    return recordLine(s.name, `${r.status === 'clear' ? 'Cleared' : 'Best attempt'} · ${time(r.duration)} · ${recordContext(r)}${badges.length ? ' · ' + badges.join(' · ') : ''}`, num(r.score));
  }).join('');
  const survival = endless ? recordLine('Endless survival', `${num(endless.score)} score · ${recordContext(endless)}`, time(endless.duration))
    : recordLine('Endless survival', 'Fly a survival run to set a record.', '—');
  const legacy = archive.visible ? recordLine('Historical device record', `${num(archive.glory)} Glory · Prestige ${num(archive.prestige)}`, num(archive.score)) : '';
  return screen('Records', 'home', `<p class="subtle">Personal bests saved on this device.</p>${rows || '<p class="subtle">Clear or finish a stage to start your flight record.</p>'}${survival}${legacy}
    <a class="quiet" href="${legacyUrl}" rel="noopener">Star Strike RUSH archive ${icon('arrowout')}</a>`);
}

const settings = {
  music: ['Music', 'Hangar and flight tracks'], effects: ['Sound effects', 'Weapons, hits, pickups and warnings'],
  reduced: ['Reduced motion', 'Steady camera and fewer flashes'], contrast: ['High contrast hazards', 'Brighter projectile centers and warning outlines']
};

function settingsView() {
  const prefs = state.pilot.settings;
  const switches = Object.entries(settings).map(([key, [label, copy]]) => `<div class="setting"><span><strong>${label}</strong><small>${copy}</small></span>
    <button class="toggle" data-action="toggle:${key}" aria-label="${label}" aria-pressed="${prefs[key]}">${prefs[key] ? 'On' : 'Off'}</button></div>`).join('');
  return screen('Settings', 'home', `${switches}<div class="setting"><div><strong>Drag sensitivity</strong><small>Changes how far the ship follows a swipe</small></div>
    <select class="toggle" id="sensitivity" aria-label="Drag sensitivity"><option value="gentle" ${prefs.sensitivity === 'gentle' ? 'selected' : ''}>Gentle</option><option value="standard" ${prefs.sensitivity === 'standard' ? 'selected' : ''}>Standard</option><option value="direct" ${prefs.sensitivity === 'direct' ? 'selected' : ''}>Direct</option></select></div>
    <div class="notice" id="pack-status" role="status">${packCopy()}</div>${state.installed ? '' : '<p class="subtle">Install from your browser menu or Add to Home Screen in Safari.</p>'}
    ${action('Flight school', 'help:settings', 'quiet')}${state.support ? `<p class="notice">${state.support}</p>` : ''}`);
}

function helpView() {
  const rows = [
    ['Drag to steer', 'Drag anywhere on the playfield. Lift and touch again to reanchor. Arrow keys and WASD also steer.'],
    ['Line up your shots', 'Weapons fire automatically. Aim by placing your ship beneath the target.'],
    ['Ghost Shift', 'Land shots and destroy targets to fill Ghost Energy. Tap Shift or press Space to pass through physical fire for one second. A short recovery follows.'],
    ['Wraith realms', 'Tap Hop or press Space to change realms. Match the Wraith’s realm and shoot its marked core. Solid rounds hit physical ships. Hollow diamonds hit ghost ships.'],
    ['Read the warning', 'Leave striped beam lanes. Fly through the marked open seam in a debris wall.'],
    ['Watch the edges', 'A surviving fighter can circle up the side and make one more pass. It keeps any damage you dealt.'],
    ['Break the modules', 'Shoot hardpoints framed by corner brackets. A crossed-out module is offline.'],
    ['Break a formation', 'Target the bracketed command relay. Stop its volley and hit the exposed wing before it recovers.'],
    ['Expose shielded escorts', 'Follow the solid blue links to the Command Ship. Destroy it to drop the escorts’ shields.'],
    ...Object.values(PICKUPS).map((drop) => [drop.name, drop.hint])
  ];
  return screen('Flight school', state.helpBack, rows.map(([title, text]) => `<div class="info"><strong>${title}</strong><p class="subtle">${text}</p></div>`).join(''));
}

function results() {
  const p = state.pending;
  const report = p.receipt ?? p.terminal;
  const clear = report.status === 'clear';
  const isEndless = p.run.mode === 'endless';
  const stage = stageById(p.run.stage);
  const finale = clear && stage?.id === 6;
  const relayCleared = clear && stage?.id === 3;
  const next = p.receipt && clear && stageById(stage.id + 1);
  const title = finale ? 'Fleet defeated' : relayCleared ? 'Relay offline' : clear ? 'Stage clear' : isEndless ? p.receipt?.best ? 'New survival best' : 'Run complete' : 'Flight lost';
  const repeat = isEndless ? 'Fly again' : clear ? 'Replay stage' : 'Retry stage';
  const retry = `fly:${isEndless ? 'endless' : stage.id}`;
  const progression = !isEndless && p.receipt ? `<div class="result-reward">${icon('salvage')} ${p.receipt.award ? `+${num(p.receipt.award)} Salvage ${store.temporary ? 'this session' : 'banked'}` : '0 Salvage earned'}${p.receipt.first ? ' · First clear' : ''}</div>` : '';
  const unlocked = p.receipt?.newStage ? `<div class="unlock">${stageById(p.receipt.newStage).name} unlocked</div>` : '';
  const ship = p.receipt?.newShip ? action(`${SHIPS[p.receipt.newShip].name} unlocked`, `unlocked:${p.receipt.newShip}`, 'quiet', 'ship') : '';
  const pendingCopy = p.discarded ? '<p class="result-reward warning">This flight was temporary. Your existing device save is active.</p>'
    : !p.receipt ? `<p class="result-reward warning">${p.error || 'Saving flight…'}</p>` : '';
  const buyable = p.receipt && clear && Object.entries(UPGRADES).some(([key,item]) =>
    !state.pilot.equipment.includes(key) && (!item.needs || state.pilot.equipment.includes(item.needs)) && state.pilot.salvage >= item.cost);
  const primary = p.discarded ? action('Return to stages', 'view:stages', 'primary')
    : !p.receipt ? (p.error ? action('Retry saving', 'settle', 'primary', 'check') : '')
    : next ? action(`Next · ${next.name}`, `fly:${next.id}`, 'primary') : finale ? action('Return to stages', 'view:stages', 'primary') : action(repeat, retry, 'primary');
  const mastery = p.receipt && clear && stage?.mastery ? `<p class="subtle">${state.pilot.mastery?.[stage.id] ? 'Mastered · ' + stage.mastery.name : stage.mastery.detail}</p>` : '';
  return `<article class="screen result-screen"><div class="result-card">${saveNotice()}<span class="caption">${finale ? 'Campaign complete' : isEndless ? 'Endless' : stage.name}</span>
    <h1 tabindex="-1">${title}</h1>${finale && p.receipt ? '<p class="subtle">The enemy fleet has fallen. Every completed stage is open for replay.</p>' : ''}
    <div class="result-facts"><div><span class="caption">${!isEndless && p.receipt?.best && report.score > 0 ? 'Personal best' : 'Score'}</span><strong>${num(report.score)}</strong></div><div><span class="caption">Flight time</span><strong>${time(report.duration)}</strong></div></div>
    ${mastery}${progression}${pendingCopy}${unlocked}${primary}${ship}<div class="result-secondary">
    ${p.receipt && (next || finale) ? action(repeat, retry, 'quiet', '') : p.receipt ? action('Hangar', 'hangar:result', 'quiet', '') : p.error ? action('Leave unsaved', 'discard', 'quiet', '') : ''}
    ${p.receipt && !finale ? action('Stages', 'view:stages', 'quiet', '') : ''}
    ${buyable ? action('Upgrades', 'shop:result', 'quiet', '') : ''}</div></div></article>`;
}

const views = { home, stages, hangar, upgrade: upgradeView, records, settings: settingsView, help: helpView, result: results };

function announce(message) { $('announcer').textContent = message; }

function showBrowserUpdate() {
  if (!state.newPack || state.mode !== 'menu' || state.pending?.working || state.pending?.error ||
      store.temporary || $('update-web')) return;
  const update = document.createElement('aside');
  update.id = 'update-web';
  update.className = 'web-update';
  update.innerHTML = action('Update browser build', 'update-web', 'quiet');
  menu.prepend(update);
}

function show(view, focus = true) {
  if (!views[view]) return;
  state.mode = 'menu';
  state.view = view;
  field.hidden = true;
  menu.hidden = false;
  menu.innerHTML = views[view]();
  showBrowserUpdate();
  menu.scrollTop = 0;
  if (focus) menu.querySelector('h1')?.focus({ preventScroll: true });
  if (view === 'settings') checkPack();
  lookForBrowserUpdate();
  audio.play('hangar');
}

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

async function start(which) {
  const endless = which === 'endless';
  const stage = endless ? null : Number(which);
  const { pilot, result: run } = await store.change((saved) => beginRun(saved, readId(), endless ? 'endless' : 'arcade', stage));
  state.pilot = pilot;
  if (!run) { announce('This stage is locked.'); show('stages'); return; }
  state.last = run;
  state.flight = new Flight(run);
  await renderer.prepare(state.flight);
  state.mode = 'playing';
  menu.hidden = true;
  field.hidden = false;
  clearInput();
  renderer.resize();
  globalThis.resetFixedStepClock(clock, performance.now());
  refreshHud(true);
  audio.play('flight');
  sky.setAttribute('tabindex', '-1');
  sky.focus({ preventScroll: true });
  announce(endless ? 'Endless flight launched.' : `${state.flight.stage.name} launched. ${state.flight.stage.brief}`);
  if (document.hidden) pause(true);
}

function clearInput() {
  const active = state.pointer;
  state.pointer = null;
  if (active && sky.hasPointerCapture(active.id)) sky.releasePointerCapture(active.id);
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
  await store.change((saved) => abandonRun(saved, state.flight.run.id)).catch(() => {});
  clearInput();
  modal.close();
  state.flight = null;
  show('stages');
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
  const energy = Math.floor(p.ghostEnergy);
  const active = p.realm === 'ghost';
  const action = f.realmHop ? 'Hop' : p.ghostTime ? `${(Math.ceil(p.ghostTime * 10) / 10).toFixed(1)}s` : p.ghostRecovery ? 'Wait' : 'Shift';
  const mode = active ? 'active' : f.shiftReady ? 'ready' : 'charging';
  const key = `${energy}/${action}/${mode}/${f.realmHop}`;
  if (lastHud.ghost === key) return;
  lastHud.ghost = key;
  const control = $('ghost-control');
  control.dataset.mode = mode;
  control.style.setProperty('--shift-cost', `${f.ghostCost}%`);
  $('ghost-meter').setAttribute('aria-valuenow', energy);
  $('ghost-value').style.transform = `scaleX(${energy / 100})`;
  $('ghost-shift').setAttribute('aria-disabled', String(!f.shiftReady));
  content('ghost-action', action);
  content('ghost-label', f.realmHop && !active ? 'Physical' : 'Ghost');
  content('ghost-status', f.realmHop ? `${active ? 'Ghost' : 'Physical'} realm. ${energy} energy. Hop costs ${f.ghostCost}.`
    : p.ghostTime ? `${action} of phasing remaining.` : p.ghostRecovery ? 'Ghost Shift is recovering.'
      : `${energy} energy. Ghost Shift costs ${f.ghostCost}.`);
}

function refreshHud(restart = false) {
  const f = state.flight;
  const p = f.player;
  const activeBoss = Boolean(f.boss && f.boss.hull > 0);
  const message = f.notice?.time > 0 ? f.notice : null;
  const brief = message && ['intro','tactic','warning'].includes(message.kind);
  content('flight-name', f.endless ? 'Endless' : f.stage.name);
  content('clock', time(f.elapsed));
  $('clock').hidden = Boolean(brief);
  $('flight-tip').hidden = !brief;
  content('flight-tip', brief ? message.copy : '');
  content('flight-score', num(f.score));
  const meters = activeBoss ? '' : f.endless ? 'Survival' : `${Math.min(100, Math.floor(f.elapsed / f.stage.bossAt * 100))}% to boss`;
  content('flight-progress', message?.kind === 'pickup' ? message.brief : message?.kind === 'tactic' ? message.title : meters);
  content('chain', f.combo >= 2 ? `${f.combo} chain` : '');
  content('hull', Array.from({ length: p.maxHull }, (_, i) => `<i class="segment ${i < p.hull ? 'full' : ''}" aria-hidden="true"></i>`).join(''), true);
  $('hull').setAttribute('aria-valuemax', p.maxHull);
  $('hull').setAttribute('aria-valuenow', p.hull);
  refreshGhost(f);
  $('boss-meter').hidden = !activeBoss;
  if (activeBoss) {
    const boss = f.boss;
    const realm = boss.realm === 'ghost' ? 'Ghost' : 'Physical';
    const transition = boss.shifting ? `${realm} → ${boss.realm === 'ghost' ? 'Physical' : 'Ghost'}` : realm;
    content('boss-name', f.realmHop ? `Wraith · ${transition}` : boss.spec.name);
    $('boss-meter').dataset.realm = f.realmHop ? boss.realm : '';
    const hp = Math.max(0, f.boss.hull / f.boss.spec.hull);
    $('boss-value').style.transform = `scaleX(${hp.toFixed(3)})`;
    $('boss-track').setAttribute('aria-valuenow', Math.ceil(hp * 100));
  }
  const flags = [];
  if (p.barrier) flags.push(`Barrier ×${p.barrier}`);
  if (p.power) flags.push(`Power ${Math.ceil(p.power)}s`);
  if (p.overdrive) flags.push(`Overdrive ${Math.ceil(p.overdrive)}s`);
  content('field-effects', flags.map((flag) => `<span class="field-chip">${flag}</span>`).join(''), true);
  const ghostLesson = !f.endless && f.stage.id === 1 && f.shiftReady && !f.usedShift && f.elapsed < 27;
  $('flight-help').hidden = !ghostLesson && (f.elapsed > 8.5 || (f.endless && f.elapsed > 4.5));
  const keyboard = state.input === 'keyboard';
  content('flight-help', ghostLesson ? `${keyboard ? 'Space' : 'Tap Shift'} to pass through fire` : keyboard ? 'Arrows / WASD to steer · Auto-fire' : 'Drag to steer · Auto-fire');
  if (message && (lastHud.message !== message || restart)) {
    lastHud.message = message;
    if (['warning', 'pickup', 'tactic'].includes(message.kind)) announce([message.title,message.copy].filter(Boolean).join('. '));
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
    else show(value);
    return;
  }
  if (type === 'hangar') { showHangar(value); return; }
  if (type === 'shop') { showHangar(value, state.pilot.ship, 'upgrades'); return; }
  if (type === 'unlocked') { showHangar('result', value); return; }
  if (type === 'help') { state.helpBack = value; show('help'); return; }
  if (type === 'fly') { await start(value); return; }
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
  if (type === 'install') {
    const { pilot, result } = await store.change((saved) => install(saved, state.upgrade));
    state.pilot = pilot;
    if (result) audio.chord([490, 620, 742], .14, .079);
    announce(result ? `${UPGRADES[state.upgrade].name} installed.` : 'Upgrade unavailable.');
    show('upgrade');
    return;
  }
  if (type === 'toggle' && Object.hasOwn(settings, value)) { await changeSetting(value, !state.pilot.settings[value]); return; }
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

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button[data-action]');
  if (!target || target.disabled || state.busy) return;
  state.busy = true;
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
  } finally { state.busy = false; }
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
  clearInput();
  state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  sky.setPointerCapture(event.pointerId);
});
sky.addEventListener('pointermove', (event) => {
  const pointer = state.pointer;
  if (!pointer || pointer.id !== event.pointerId || state.mode !== 'playing') return;
  const sensitivity = { gentle: .78, standard: 1.12, direct: 1.37 }[state.flight.run.assistance.sensitivity] ?? 1.12;
  state.flight.drag((event.clientX - pointer.x) / renderer.unit * sensitivity, (event.clientY - pointer.y) / renderer.unit * sensitivity);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  sky.addEventListener(type, (event) => { if (state.pointer?.id === event.pointerId) clearInput(); });
}

window.addEventListener('keydown', (event) => {
  const action = globalThis.gameplayActionForKey(event.key);
  if (event.key === 'Escape' && state.mode !== 'menu' && state.mode !== 'finishing') {
    event.preventDefault();
    if (event.repeat) return;
    if (state.mode === 'paused' && modal.querySelector('[data-action="resume"]')) resume();
    else pause();
  } else if (action === 'ability' && state.mode === 'playing') {
    event.preventDefault();
    if (!event.repeat) { state.input = 'keyboard'; useShift(); }
  } else if (action?.startsWith('move_') && state.mode === 'playing') {
    event.preventDefault();
    state.input = 'keyboard';
    if (state.pointer) clearInput();
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
  if (!field.hidden && state.flight) { renderer.resize(); renderer.draw(state.flight, state.flight.run.assistance); }
});

function loop(timestamp) {
  const f = state.flight;
  if (state.mode === 'playing') {
    const prefs = f.run.assistance;
    const tick = globalThis.advanceFixedStep(clock, timestamp, (dt) => {
      f.step(dt / 1000);
      renderer.advanceEffects(dt / 1000);
    });
    const events = f.takeEvents();
    renderer.accept(events, prefs.reduced);
    audio.accept(events);
    if (tick.steps) refreshHud();
    renderer.draw(f, prefs);
    const end = f.terminal();
    if (end) {
      clearInput();
      state.mode = 'finishing';
      state.finishAt = timestamp + (prefs.reduced ? 380 : 900);
      state.pending = { terminal: end, run: f.run };
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
    renderer.advanceEffects(1 / 60);
    renderer.draw(f, f.run.assistance);
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
  show('home', false);
  void loadSprite('kestrel');
  if (navigator.serviceWorker && document.documentElement.dataset.pack === 'true') {
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
