const tracks = { hangar:'hangar-bay-seven.mp3', flight:'gravitys-edge.mp3' };

export function createGameMusic({ createPlayer, source, prepare, foreground }) {
  let player;
  let track;
  let revision = 0;
  let ready;

  function pause() {
    revision++;
    if (!player) return;
    player.pause();
    player.clearLockScreenControls();
  }

  async function play(scene) {
    if (!Object.hasOwn(tracks, scene) || !foreground()) return;
    const attempt = ++revision;
    ready ??= Promise.resolve().then(prepare);
    try {
      await ready;
    } catch {
      ready = null;
      return;
    }
    if (attempt !== revision || !foreground()) return;
    if (track !== scene) {
      pause();
      player?.remove();
      player = undefined;
      track = undefined;
      player = createPlayer(source(tracks[scene]), { keepAudioSessionActive:false });
      player.loop = true;
      player.volume = scene === 'flight' ? .29 : .41;
      player.setActiveForLockScreen(false);
      track = scene;
    }
    player.play();
  }

  function dispose() {
    pause();
    player?.remove();
    player = null;
    track = null;
  }

  return { play, pause, dispose };
}
