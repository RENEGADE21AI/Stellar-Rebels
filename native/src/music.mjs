const tracks = {
  hangar: { file:'hangar-bay-seven.mp3', volume:.41 },
  flight: { file:'gravitys-edge.mp3', volume:.29 }
};

export function createAndroidGameMusic({ playback, source, foreground }) {
  return {
    async play(scene) {
      if (!playback || !Object.hasOwn(tracks, scene) || !foreground()) return;
      const { file, volume } = tracks[scene];
      await playback.play(source(file), volume);
    },
    pause() { void playback?.pause().catch(() => {}); },
    dispose() { void playback?.dispose().catch(() => {}); }
  };
}

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
      const { file, volume } = tracks[scene];
      player = createPlayer(source(file), { keepAudioSessionActive:false });
      player.loop = true;
      player.volume = volume;
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
