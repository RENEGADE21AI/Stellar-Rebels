const assert = require('node:assert/strict');
const test = require('node:test');

test('Android soundtrack uses the local playback module and honors foreground and pause', async () => {
  const { createAndroidGameMusic } = await import('../native/src/music.mjs');
  const calls = [];
  let active = true;
  const music = createAndroidGameMusic({
    playback: {
      play: async (source, volume) => calls.push([source, volume]),
      pause: async () => calls.push('pause'),
      dispose: async () => calls.push('dispose')
    },
    source: (file) => `file:///offline/${file}`,
    foreground: () => active
  });
  await music.play('flight');
  active = false;
  await music.play('hangar');
  music.pause();
  music.dispose();
  assert.deepEqual(calls, [['file:///offline/gravitys-edge.mp3', .29], 'pause', 'dispose']);
});

test('game music follows foreground commands and never registers lock-screen controls', async () => {
  const { createGameMusic } = await import('../native/src/music.mjs');
  const actions = [];
  let inForeground = true;
  const music = createGameMusic({
    prepare: () => actions.push('prepare'),
    foreground: () => inForeground,
    source: (name) => name,
    createPlayer: (name, options) => {
      actions.push(name, options.keepAudioSessionActive);
      return {
        setActiveForLockScreen: (active) => actions.push(active),
        clearLockScreenControls: () => actions.push('clear'),
        play: () => actions.push('play'),
        pause: () => actions.push('pause'),
        remove: () => actions.push('remove')
      };
    }
  });
  await music.play('hangar');
  assert.deepEqual(actions, ['prepare', 'hangar-bay-seven.mp3', false, false, 'play']);
  inForeground = false;
  music.pause();
  await music.play('flight');
  assert.deepEqual(actions.slice(5), ['pause', 'clear']);
  inForeground = true;
  await music.play('flight');
  assert.deepEqual(actions.slice(7), ['pause', 'clear', 'remove', 'gravitys-edge.mp3', false, false, 'play']);
  music.dispose();
  assert.deepEqual(actions.slice(-3), ['pause', 'clear', 'remove']);
});

test('backgrounding during native audio setup prevents late playback', async () => {
  const { createGameMusic } = await import('../native/src/music.mjs');
  let configured;
  const preparation = new Promise((resolve) => { configured = resolve; });
  let plays = 0;
  const music = createGameMusic({
    prepare: () => preparation,
    foreground: () => true,
    source: (name) => name,
    createPlayer: () => { plays++; }
  });
  const request = music.play('flight');
  music.pause();
  configured();
  await request;
  assert.equal(plays, 0);
});
