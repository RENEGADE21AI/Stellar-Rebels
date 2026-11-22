package expo.modules.stellargameaudio

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactContext
import com.facebook.react.common.LifecycleState
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class StellarGameAudioModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private val trackPath = Regex(
    "(?:[a-f0-9]{64}|[a-f0-9]{15})/arcade/[a-f0-9]{15}/audio/(?:hangar-bay-seven|gravitys-edge)\\.mp3"
  )
  private var player: MediaPlayer? = null
  private var track: File? = null
  private var prepared = false
  private var wantsPlayback = false
  private var volume = 0f

  override fun definition() = ModuleDefinition {
    Name("StellarGameAudio")

    AsyncFunction("play") { uri: String, volume: Double ->
      play(uri, volume)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("pause") {
      pausePlayback()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("dispose") {
      releasePlayer()
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersBackground { pausePlayback() }
    OnActivityDestroys { releasePlayer() }
    OnDestroy { main.post { releasePlayer() } }
  }

  private fun inForeground(): Boolean =
    (appContext.reactContext as? ReactContext)?.lifecycleState == LifecycleState.RESUMED

  private fun bundledTrack(source: String): File {
    val uri = Uri.parse(source)
    require(uri.scheme == "file" && uri.authority.isNullOrEmpty() && uri.query == null && uri.fragment == null)
    val file = File(requireNotNull(uri.path)).canonicalFile
    val cache = requireNotNull(appContext.reactContext).cacheDir
    val packRoot = File(cache, "stellar-rebels").canonicalFile
    require(trackPath.matches(file.toRelativeString(packRoot)) && file.isFile) {
      "The soundtrack must come from the installed flight pack"
    }
    return file
  }

  private fun play(source: String, newVolume: Double) {
    if (!inForeground()) return
    require(newVolume in 0.0..1.0)
    val file = bundledTrack(source)
    volume = newVolume.toFloat()

    val current = player
    if (current != null && track == file) {
      wantsPlayback = true
      if (prepared) startPlayback(current)
      return
    }

    releasePlayer()
    // Game music is an audio stream. No MediaSession or transport controls are registered.
    val next = MediaPlayer()
    player = next
    track = file
    wantsPlayback = true
    try {
      next.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_GAME)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
      )
      next.setOnPreparedListener { ready ->
        if (player === ready) {
          prepared = true
          ready.isLooping = true
          if (wantsPlayback && inForeground()) startPlayback(ready)
        }
      }
      next.setOnErrorListener { failed, _, _ ->
        if (player === failed) releasePlayer()
        true
      }
      next.setDataSource(file.path)
      next.prepareAsync()
    } catch (error: Exception) {
      releasePlayer()
      throw error
    }
  }

  private fun startPlayback(current: MediaPlayer) {
    try {
      current.setVolume(volume, volume)
      if (!current.isPlaying) current.start()
    } catch (_: IllegalStateException) {
      releasePlayer()
    }
  }

  private fun pausePlayback() {
    wantsPlayback = false
    if (prepared) {
      try {
        player?.let { if (it.isPlaying) it.pause() }
      } catch (_: IllegalStateException) {
        releasePlayer()
      }
    }
  }

  private fun releasePlayer() {
    val current = player
    player = null
    track = null
    prepared = false
    wantsPlayback = false
    current?.release()
  }
}
