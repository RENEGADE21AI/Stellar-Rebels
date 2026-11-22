export const STORY_BEATS = Object.freeze([
  {
    id: 'invasion', mission: 1, timing: 'before', title: 'Neyara under attack',
    text: 'The Zoruun Empire has entered the Auren System. Neyara’s defenses are falling, and your three-person crew is among the last still flying.',
    alt: 'Invading warships descend through Neyara’s damaged orbital defenses.'
  },
  {
    id: 'advance-force', mission: 1, timing: 'after', title: 'The fleet that stayed behind',
    text: 'The Warden falls and the attackers retreat. It was only an advance force. The Emperor and his flagship never came.',
    alt: 'Retreating ships recede above broken orbital defenses and the lights of Neyara.'
  },
  {
    id: 'departure', mission: 2, timing: 'before', title: 'Three rebels',
    text: 'Auren Command needs every ship at home. You believe waiting will cost Neyara everything. Both of your crewmates choose to go with you.',
    alt: 'Three crew members stand on the flight deck beside their compact ivory strikecraft.'
  },
  {
    id: 'array-signal', mission: 5, timing: 'after', title: 'The Dark Matter Array',
    text: 'The relay carried plans for a gravitational siege weapon. The Emperor intends to use it against Auren, even if a full-power discharge tears through the system he means to conquer.',
    alt: 'A lone rebel strikecraft approaches a damaged ring relay and its violet gravity signal.'
  },
  {
    id: 'zoruun-fall', mission: 8, timing: 'after', title: 'What happened to Zoruun',
    text: 'Zoruun’s own Dark Matter experiments ruined its inhabited worlds. Millions died. Its people fled aboard civilian and military fleets, and the Emperor is willing to risk the same catastrophe again.',
    alt: 'An ivory strikecraft passes abandoned orbital structures above Zoruun’s scarred homeworld.'
  },
  {
    id: 'flagship-intel', mission: 10, timing: 'after', title: 'A way through',
    text: 'The stabilizer transmitted the Array’s fail-safe design before it went dark. The Array is aboard the flagship. Cut its feeds and break the defensive mounts, and the core will be exposed.',
    alt: 'Stabilizer arms and a gravitational chamber sit deep within the imperial flagship.'
  },
  {
    id: 'final-run', mission: 15, timing: 'before', title: 'Before it fires',
    text: 'Your crew has cut the flagship’s last line of support. The Emperor is bringing the Array online. The three of you have one opening before it fires.',
    alt: 'The rebel strikecraft flies toward an opening between the flagship’s enormous armor plates.'
  },
  {
    id: 'homecoming', mission: 15, timing: 'after', title: 'Home to Neyara',
    text: 'The Array collapsed inside the flagship, taking the Emperor with it. His commanders withdraw, civilian ships escape, and all three rebels come home to Neyara.',
    alt: 'Three rebels stand next to their docked strikecraft above a peaceful Neyara at dawn.'
  }
].map((beat) => Object.freeze({ ...beat, art:`media/story/${beat.id}.webp` })));

export const storyBeatFor = (mission, timing) =>
  STORY_BEATS.find((beat) => beat.mission === mission && beat.timing === timing);
