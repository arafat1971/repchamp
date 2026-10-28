package expo.modules.raceclipencoder

import android.graphics.BitmapFactory
import android.graphics.Rect
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import android.util.Base64
import android.view.Surface
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class RaceClipEncoderModule : Module() {
  private var session: EncoderSession? = null

  override fun definition() = ModuleDefinition {
    Name("RaceClipEncoder")

    AsyncFunction("start") { width: Int, height: Int, fps: Int, bitrate: Int ->
      synchronized(this@RaceClipEncoderModule) {
        session?.cancel()
        session = null
        val dir = appContext.cacheDirectory
        val file = File(dir, "race-clip-${System.currentTimeMillis()}.mp4")
        session = EncoderSession(file, width, height, fps, bitrate)
      }
    }

    AsyncFunction("appendFrame") { base64Jpeg: String ->
      synchronized(this@RaceClipEncoderModule) {
        val open = session ?: throw NoClipException()
        open.append(base64Jpeg)
      }
    }

    AsyncFunction("finish") {
      synchronized(this@RaceClipEncoderModule) {
        val open = session ?: throw NoClipException()
        session = null
        open.finish()
        "file://${open.file.absolutePath}"
      }
    }

    AsyncFunction("cancel") {
      synchronized(this@RaceClipEncoderModule) {
        session?.cancel()
        session = null
      }
    }
  }
}

private class NoClipException : CodedException("ERR_NO_CLIP", "No race clip is open; call start first.", null)

private class BadFrameException : CodedException("ERR_BAD_FRAME", "A frame could not be decoded.", null)

/**
 * H.264 through MediaCodec's input surface. Frames are drawn onto the surface
 * as they arrive, so the codec stamps them with wall-clock time; the muxer
 * gets re-stamped times instead (n / fps), which is what makes the clip play
 * at exactly `fps` however long encoding took. That relies on output order
 * matching input order, hence no B-frames.
 */
private class EncoderSession(
  val file: File,
  private val width: Int,
  private val height: Int,
  private val fps: Int,
  bitrate: Int,
) {
  private val codec: MediaCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
  private val muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
  private val surface: Surface
  private val info = MediaCodec.BufferInfo()
  private val target = Rect(0, 0, width, height)
  private var track = -1
  private var muxing = false
  private var written = 0L

  init {
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0)
      }
    }
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    surface = codec.createInputSurface()
    codec.start()
  }

  fun append(base64Jpeg: String) {
    val bytes = Base64.decode(base64Jpeg, Base64.DEFAULT)
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: throw BadFrameException()
    val canvas = try {
      surface.lockHardwareCanvas()
    } catch (_: Throwable) {
      surface.lockCanvas(null)
    }
    try {
      canvas.drawBitmap(bitmap, null, target, null)
    } finally {
      surface.unlockCanvasAndPost(canvas)
      bitmap.recycle()
    }
    drain(endOfStream = false)
  }

  fun finish() {
    try {
      codec.signalEndOfInputStream()
      drain(endOfStream = true)
    } finally {
      release()
    }
  }

  fun cancel() {
    release()
    file.delete()
  }

  private fun drain(endOfStream: Boolean) {
    var idleSince = System.currentTimeMillis()
    while (true) {
      val index = codec.dequeueOutputBuffer(info, if (endOfStream) 10_000L else 0L)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) return
          // A codec that never signals end of stream must not hang the share.
          if (System.currentTimeMillis() - idleSince > 3_000) return
        }
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (!muxing) {
            track = muxer.addTrack(codec.outputFormat)
            muxer.start()
            muxing = true
          }
        }
        index >= 0 -> {
          idleSince = System.currentTimeMillis()
          val buffer = codec.getOutputBuffer(index)
          val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
          if (buffer != null && !isConfig && info.size > 0 && muxing) {
            info.presentationTimeUs = written * 1_000_000L / fps
            written++
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            muxer.writeSampleData(track, buffer, info)
          }
          codec.releaseOutputBuffer(index, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
        }
      }
    }
  }

  private var released = false

  private fun release() {
    if (released) return
    released = true
    runCatching { codec.stop() }
    runCatching { codec.release() }
    runCatching { surface.release() }
    if (muxing) runCatching { muxer.stop() }
    runCatching { muxer.release() }
  }
}
