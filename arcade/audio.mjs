const effects = {
  shot: [535, 282, .055, .023, 'triangle'],
  hit: [490, 140, .07, .055, 'triangle'],
  shieldHit: [1080, 450, .09, .047, 'triangle'],
  enemyDown: [150, 41, .24, .18, 'sawtooth'],
  moduleDown: [225, 34, .36, .23, 'triangle'],
  bossDown: [124, 28, .78, .29, 'sawtooth'],
  playerDown: [190, 32, .55, .26, 'triangle'],
  hurt: [98, 42, .25, .19, 'square'],
  barrier: [1000, 280, .19, .12, 'sine'],
  ghostStart: [260, 980, .28, .115, 'triangle'],
  ghostEnd: [680, 220, .21, .075, 'sine'],
  realmHop: [340, 760, .22, .12, 'sine'],
  realmWarning: [132, 425, .62, .145, 'sine'],
  wraithShift: [680, 151, .38, .13, 'triangle'],
  wraithVolley: [195, 72, .22, .12, 'triangle'],
  bossFire: [119, 67, .28, .10, 'triangle'],
  charge: [187, 397, .31, .10, 'triangle'],
  hazard: [190, 83, .38, .16, 'sawtooth'],
  boss: [96, 104, .6, .13, 'triangle'],
  cruiserEnter: [86, 64, .48, .086, 'triangle'],
  dash: [470, 240, .105, .035, 'triangle'],
  returnFlyby: [155, 318, .22, .052, 'triangle'],
  linkedFire: [311, 129, .22, .13, 'triangle'],
  formationBreak: [1120, 125, .21, .14, 'square'],
  ui: [650, 470, .08, .055, 'sine']
};

export class FlightAudio {
  constructor() {
    this.track = null;
    this.ctx = null;
    this.enabled = false;
    this.effects = true;
    this.music = true;
    this.last = {};
  }

  unlock() {
    this.enabled = true;
    const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!this.ctx && Constructor) {
      try { this.ctx = new Constructor(); } catch {}
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  reflect(prefs) {
    this.music = prefs.music;
    this.effects = prefs.effects;
    if (!this.music) this.track?.pause();
  }

  play(name) {
    if (!this.enabled || !this.music || document.hidden) return;
    const file = name === 'flight' ? 'gravitys-edge' : 'hangar-bay-seven';
    if (this.track?.dataset.name !== file) {
      this.track?.pause();
      const source = document.documentElement.dataset.pack === 'true'
        ? new URL(`./audio/${file}.mp3`, import.meta.url).href : `/assets/audio/${file}.mp3`;
      this.track ??= new Audio();
      this.track.src = source;
      this.track.dataset.name = file;
      this.track.volume = name === 'flight' ? .29 : .41;
      this.track.loop = true;
    }
    this.track.play().catch(() => {});
  }

  quiet() { this.track?.pause(); }

  accept(events) {
    for (const e of events) {
      if (e.type === 'pickup') this.chord([480, 622, 760], .18, .10);
      else if (e.type === 'formationBreak') {
        this.effect(e.type);
        this.chord([365, 487, 730], .17, .11, .08);
      } else if (e.type === 'ghostStart' || e.type === 'realmHop') {
        this.effect(e.type);
        this.chord([420, 630, 840], .20, .065, .03);
      } else if (e.type === 'bossDown') {
        this.effect(e.type);
        this.chord([260, 327, 391, 520], .33, .115, .23);
      } else this.effect(e.type, e.detail === 'boost' ? 1.35 : 1);
    }
  }

  chord(notes, duration, volume, offset = 0) {
    if (!this.ctx || !this.effects || document.hidden) return;
    const t = this.ctx.currentTime + offset;
    notes.forEach((pitch, i) => this.tone([pitch, pitch * 1.022, duration, volume, 'sine'], t + i * .07));
  }

  effect(kind, power = 1) {
    const recipe = effects[kind];
    if (!recipe || !this.ctx || !this.effects || document.hidden) return;
    const t = this.ctx.currentTime;
    if (t - (this.last[kind] ?? -1) < (kind === 'hit' || kind === 'shieldHit' ? .082 : .044)) return;
    this.last[kind] = t;
    this.tone(recipe, t, power);
    if (kind === 'enemyDown' || kind === 'moduleDown' || kind === 'bossDown') {
      this.tone([365, 93, .11, kind === 'enemyDown' ? .032 : .047, 'square'], t);
    }
  }

  tone([from, to, duration, volume, type], start, power = 1) {
    const oscill = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscill.type = type;
    oscill.frequency.setValueAtTime(from * power, start);
    oscill.frequency.exponentialRampToValueAtTime(to, start + duration * .78);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .009);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscill.connect(gain);
    gain.connect(this.ctx.destination);
    oscill.start(start);
    oscill.stop(start + duration + .008);
  }
}
