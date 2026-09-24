/**
 * The partner-water widget: the partner's bear on the home screen, filling
 * live as they drink.
 *
 * Kept out of `withPartnerWidget.js` so that file's contract test — every key
 * its Kotlin reads must be one `buildWidgetSnapshot` writes — stays about the
 * week widget. This one has its own test against `buildWaterWidgetSnapshot`.
 *
 * ## How it stays live with the app closed
 *
 * The partner's phone sends a silent (data-only) push each time their total
 * moves. `RepChampMessagingService` — a subclass of Expo's own FCM service,
 * registered at a higher priority so FCM picks it — writes the payload into
 * SharedPreferences and redraws, without starting any JavaScript. Every other
 * push falls through to Expo untouched.
 *
 * ## How it moves
 *
 * RemoteViews cannot run code on a timer, but a launcher does animate an
 * indeterminate ProgressBar. Its drawable here is an `animation-list` of
 * rising bubbles, shown over the bear for fifteen minutes after a drink,
 * beside a pulsing LIVE dot. An inexact alarm redraws the widget when the
 * window closes, so it calms down without the app.
 *
 * The bear itself is drawn natively to a bitmap with the same geometry as
 * `components/home/BearJar.tsx`: rim, glassy body, each drink a band in its
 * own colour with the same light-to-deep shading, and a wavy surface.
 */

/* Geometry, in the 100 x 124 box both the bitmap and the vector frames use:
   BearJar's 100 x 120 view box moved down 2, so the rim stroke under the belly
   is not cut off. */
const Y = 2;
const circle = (cx, cy, r) =>
  `M${cx - r},${cy + Y} a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0 Z`;
const ellipse = (cx, cy, rx, ry) =>
  `M${cx - rx},${cy + Y} a${rx},${ry} 0 1,1 ${2 * rx},0 a${rx},${ry} 0 1,1 ${-2 * rx},0 Z`;
const SILHOUETTE = [circle(25, 20, 13), circle(75, 20, 13), circle(50, 40, 30), ellipse(50, 86, 38, 33)].join(' ');

const round = (n) => Math.round(n * 100) / 100;

/**
 * One frame of rising bubbles.
 *
 * Each bubble has its own phase, so the column never pulses in step; it grows
 * a little as it rises and fades out near the top of its run, which is what
 * reads as fizz rather than dots sliding up.
 */
function bubbleFrame(frame, frames, { xs, from, to, size }) {
  const paths = xs
    .map((x, i) => {
      const p = (frame / frames + i / xs.length) % 1;
      const cy = from - p * (from - to);
      const cx = x + 1.6 * Math.sin(p * Math.PI * 4);
      const r = size * (0.7 + 0.6 * p);
      const alpha = p > 0.8 ? round(0.7 * (1 - (p - 0.8) / 0.2)) : 0.7;
      return `    <path android:fillColor="#FFFFFF" android:fillAlpha="${alpha}" android:strokeColor="#FFFFFF" android:strokeAlpha="${round(alpha * 0.9)}" android:strokeWidth="0.5" android:pathData="M${round(cx - r)},${round(cy)} a${round(r)},${round(r)} 0 1,1 ${round(2 * r)},0 a${round(r)},${round(r)} 0 1,1 ${round(-2 * r)},0 Z" />`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="84dp" android:height="104dp"
    android:viewportWidth="100" android:viewportHeight="124">
${paths}
</vector>
`;
}

const BUBBLE_FRAMES = 10;

/* Two runs: a tall one for a bear at least half full, a short low one for a
   bear with only a little in it — bubbles must never rise above the drink. */
const BUBBLE_SETS = {
  high: { xs: [36, 52, 64, 44, 58], from: 116, to: 72, size: 1.9 },
  low: { xs: [42, 50, 58], from: 118, to: 104, size: 1.4 },
};

function bubbleDrawables() {
  const files = {};
  for (const [name, set] of Object.entries(BUBBLE_SETS)) {
    const items = [];
    for (let f = 0; f < BUBBLE_FRAMES; f++) {
      files[`drawable/water_bubble_${name}_${f}.xml`] = bubbleFrame(f, BUBBLE_FRAMES, set);
      items.push(`    <item android:drawable="@drawable/water_bubble_${name}_${f}" android:duration="120" />`);
    }
    files[`drawable/water_bubbles_${name}.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<animation-list xmlns:android="http://schemas.android.com/apk/res/android" android:oneshot="false">
${items.join('\n')}
</animation-list>
`;
  }
  return files;
}

/* The LIVE dot's heartbeat: a green dot that swells and dims, over and over. */
function pulseDrawables() {
  const files = {};
  const steps = [1, 0.85, 0.65, 0.45, 0.65, 0.85];
  const items = steps.map((a, i) => {
    const inset = round((1 - a) * 2.5);
    const alpha = Math.round((0.35 + 0.65 * a) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    files[`drawable/water_pulse_${i}.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android" android:inset="${inset}dp">
    <shape android:shape="oval">
        <solid android:color="#${alpha}4ADE80" />
    </shape>
</inset>
`;
    return `    <item android:drawable="@drawable/water_pulse_${i}" android:duration="140" />`;
  });
  files['drawable/water_live_pulse.xml'] = `<?xml version="1.0" encoding="utf-8"?>
<animation-list xmlns:android="http://schemas.android.com/apk/res/android" android:oneshot="false">
${items.join('\n')}
</animation-list>
`;
  return files;
}

/* The picker never calls onUpdate, so the layout's own image must look like
   the real thing: a half-full bear, drawn as a vector from the same geometry. */
const PREVIEW_BEAR_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="84dp" android:height="104dp"
    android:viewportWidth="100" android:viewportHeight="124">
    <path android:fillColor="#A5B4FC" android:strokeColor="#A5B4FC" android:strokeWidth="5" android:pathData="${SILHOUETTE}" />
    <path android:fillColor="#EEF0FF" android:pathData="${SILHOUETTE}" />
    <path android:fillColor="#8B5CF6" android:fillAlpha="0.55" android:pathData="${circle(25, 20, 6.5)} ${circle(75, 20, 6.5)}" />
    <group>
        <clip-path android:pathData="${SILHOUETTE}" />
        <path android:fillColor="#38BDF8" android:pathData="M0,70 Q12,66 25,70 T50,70 T75,70 T100,70 L100,124 L0,124 Z" />
        <path android:fillColor="#FB923C" android:pathData="M0,104 Q12,102 25,104 T50,104 T75,104 T100,104 L100,124 L0,124 Z" />
    </group>
    <path android:strokeColor="#FFFFFF" android:strokeAlpha="0.7" android:strokeWidth="3.2" android:strokeLineCap="round" android:pathData="M22,76 Q18,92 26,106" />
    <path android:strokeColor="#FFFFFF" android:strokeAlpha="0.75" android:strokeWidth="2.6" android:strokeLineCap="round" android:pathData="M30,26 Q34,20 40,18" />
    <path android:fillColor="#1E293B" android:pathData="${ellipse(40, 40, 3.6, 4.4)} ${ellipse(60, 40, 3.6, 4.4)}" />
    <path android:fillColor="#FFFFFF" android:pathData="${circle(41.3, 38.4, 1.2)} ${circle(61.3, 38.4, 1.2)}" />
    <path android:fillColor="#FFFFFF" android:fillAlpha="0.85" android:pathData="${ellipse(50, 50, 9, 6.5)}" />
    <path android:fillColor="#1E293B" android:pathData="${ellipse(50, 48, 3.2, 2.3)}" />
    <path android:strokeColor="#1E293B" android:strokeWidth="1.4" android:strokeLineCap="round" android:pathData="M46.5,54 Q50,57.5 53.5,54" />
    <path android:fillColor="#8B5CF6" android:fillAlpha="0.6" android:pathData="${ellipse(31, 50, 5, 3)} ${ellipse(69, 50, 5, 3)}" />
</vector>
`;

const WATER_PROVIDER_KT = (pkg) => `package ${pkg}

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The partner's bear, filling live as they drink.
 *
 * Draws what \`domain/waterWidget\` phrased and coloured; decides only the two
 * things that belong to draw time — whether the payload is still today's, and
 * whether the last drink is recent enough to animate.
 */
class WaterWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { render(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        id: Int,
        options: Bundle
    ) {
        render(context, manager, id)
    }

    companion object {
        const val KEY = "repchamp.widget.water.v1"
        private const val LIVE_MS = 15L * 60L * 1000L
        private val MINT = 0xFF6EE7B7.toInt()
        private val GOLD = 0xFFFDE047.toInt()

        /**
         * Whether a new copy should replace the stored one.
         *
         * The same state arrives twice — the partner's silent push and this
         * app's copy from the couple document — in either order. A later day
         * always wins; within a day the higher \`rev\` does, so an older copy
         * can never walk the bear backwards. \`rev\` 0 carries no ordering
         * (an older partner app, or they are not sharing) and is taken as is.
         */
        fun accept(context: Context, json: String?): Boolean {
            if (json.isNullOrBlank()) return true
            val old = context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
                .getString(KEY, null)
            if (old.isNullOrBlank()) return true
            return try {
                val next = JSONObject(json)
                val prev = JSONObject(old)
                val nextDay = next.optString("day")
                val prevDay = prev.optString("day")
                if (nextDay != prevDay) {
                    nextDay > prevDay
                } else {
                    val rev = next.optLong("rev", 0L)
                    rev == 0L || rev >= prev.optLong("rev", 0L)
                }
            } catch (e: Exception) {
                true
            }
        }

        /** Redraw every placed instance now — used by the messaging service. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, WaterWidgetProvider::class.java))
            ids.forEach { render(context, manager, it) }
        }

        fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.water_widget)
            val raw = context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
                .getString(KEY, null)
            val snap = try {
                if (raw.isNullOrBlank()) null else JSONObject(raw)
            } catch (e: Exception) {
                null
            }
            val density = context.resources.displayMetrics.density
            val now = System.currentTimeMillis()

            if (snap == null) {
                // Not paired, or they stopped sharing: say so, with an empty bear.
                views.setTextViewText(R.id.water_title, context.getString(R.string.water_widget_title_empty))
                views.setTextViewText(R.id.water_amount, "—")
                views.setTextViewText(R.id.water_goal, "")
                views.setTextViewText(R.id.water_status, context.getString(R.string.water_widget_empty))
                views.setTextColor(R.id.water_status, MINT)
                views.setViewVisibility(R.id.water_last, View.GONE)
                views.setViewVisibility(R.id.water_progress, View.GONE)
                views.setViewVisibility(R.id.water_live, View.GONE)
                views.setViewVisibility(R.id.water_bubbles_high, View.GONE)
                views.setViewVisibility(R.id.water_bubbles_low, View.GONE)
                views.setImageViewBitmap(R.id.water_bear, BearArt.draw(density, 0f, emptyList(), false, now))
            } else {
                val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
                // Yesterday's total is not today's: a new day starts the bear empty.
                val isToday = snap.optString("day") == today
                val pct = if (isToday) snap.optDouble("pct", 0.0).toFloat().coerceIn(0f, 1f) else 0f
                val met = isToday && snap.optBoolean("met", false)

                val layers = ArrayList<Pair<Int, Float>>()
                val arr = if (isToday) snap.optJSONArray("layers") else null
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        val o = arr.optJSONObject(i) ?: continue
                        val color = try {
                            Color.parseColor(o.optString("c"))
                        } catch (e: Exception) {
                            continue
                        }
                        layers.add(color to o.optDouble("t", 0.0).toFloat().coerceIn(0f, 1f))
                    }
                }

                views.setTextViewText(R.id.water_title, snap.optString("title").uppercase(Locale.getDefault()))
                views.setTextViewText(R.id.water_amount, if (isToday) snap.optString("amount") else "0 ml")
                views.setTextViewText(R.id.water_goal, snap.optString("goal"))
                views.setTextViewText(
                    R.id.water_status,
                    if (isToday) snap.optString("status") else context.getString(R.string.water_widget_new_day)
                )
                views.setTextColor(R.id.water_status, if (met) GOLD else MINT)
                views.setViewVisibility(R.id.water_progress, View.VISIBLE)
                views.setProgressBar(R.id.water_progress, 1000, (pct * 1000f).roundToInt(), false)

                val last = if (isToday) snap.optString("last", "") else ""
                val lastAt = snap.optLong("lastAt", 0L)
                if (last.isBlank()) {
                    views.setViewVisibility(R.id.water_last, View.GONE)
                } else {
                    val time = if (lastAt > 0L) {
                        " · " + android.text.format.DateFormat.getTimeFormat(context).format(Date(lastAt))
                    } else {
                        ""
                    }
                    views.setTextViewText(R.id.water_last, last + time)
                    views.setViewVisibility(R.id.water_last, View.VISIBLE)
                }

                /* Fresh: they drank in the last fifteen minutes. A minute of
                   grace for the other phone's clock being slightly ahead. */
                val age = now - lastAt
                val fresh = isToday && lastAt > 0L && age >= -60_000L && age <= LIVE_MS
                views.setViewVisibility(R.id.water_live, if (fresh) View.VISIBLE else View.GONE)
                views.setViewVisibility(
                    R.id.water_bubbles_high,
                    if (fresh && pct >= 0.5f) View.VISIBLE else View.GONE
                )
                views.setViewVisibility(
                    R.id.water_bubbles_low,
                    if (fresh && pct >= 0.2f && pct < 0.5f) View.VISIBLE else View.GONE
                )
                if (fresh) scheduleCalm(context, lastAt + LIVE_MS + 5_000L)

                views.setImageViewBitmap(R.id.water_bear, BearArt.draw(density, pct, layers, met, now))
            }

            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launch != null) {
                val pending = PendingIntent.getActivity(
                    context, 7300, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.water_root, pending)
            }

            manager.updateAppWidget(id, views)
        }

        /** Redraw once the live window closes, so the bubbles stop on their own. */
        private fun scheduleCalm(context: Context, at: Long) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, WaterWidgetProvider::class.java))
            val intent = Intent(context, WaterWidgetProvider::class.java)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            val pending = PendingIntent.getBroadcast(
                context, 7301, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            // Inexact on purpose: needs no exact-alarm permission, and a few
            // minutes' slack on "stop the bubbles" costs nothing.
            alarms.set(AlarmManager.RTC, at, pending)
        }
    }
}

/**
 * The bear, drawn to a bitmap — the same shapes and colours as BearJar.tsx,
 * in the partner's lavender theme.
 */
object BearArt {
    private const val TOP = 7f + 2f
    private const val BOTTOM = 119f + 2f
    private val BODY = Color.parseColor("#E6E8FF")
    private val RIM = Color.parseColor("#A5B4FC")
    private val TINT = Color.parseColor("#8B5CF6")
    private val INK = Color.parseColor("#1E293B")
    private val DEEP = Color.parseColor("#0B1B3F")
    private val SPARK = Color.parseColor("#FBBF24")

    private fun mix(a: Int, b: Int, t: Float): Int = Color.rgb(
        (Color.red(a) + (Color.red(b) - Color.red(a)) * t).roundToInt(),
        (Color.green(a) + (Color.green(b) - Color.green(a)) * t).roundToInt(),
        (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t).roundToInt()
    )

    private fun silhouette(): Path {
        val p = Path()
        val parts = listOf(
            Path().apply { addCircle(25f, 22f, 13f, Path.Direction.CW) },
            Path().apply { addCircle(75f, 22f, 13f, Path.Direction.CW) },
            Path().apply { addCircle(50f, 42f, 30f, Path.Direction.CW) },
            Path().apply { addOval(RectF(12f, 55f, 88f, 121f), Path.Direction.CW) }
        )
        parts.forEach { p.op(it, Path.Op.UNION) }
        return p
    }

    private fun surface(y: Float, amp: Float, phase: Float): Path {
        val p = Path()
        var x = -2f
        p.moveTo(x, y + amp * sin(phase))
        while (x <= 102f) {
            p.lineTo(x, y + amp * sin(phase + x / 100f * 2f * PI.toFloat() * 1.2f))
            x += 4f
        }
        return p
    }

    private fun star(cx: Float, cy: Float, r: Float): Path = Path().apply {
        moveTo(cx, cy - r)
        quadTo(cx, cy, cx + r, cy)
        quadTo(cx, cy, cx, cy + r)
        quadTo(cx, cy, cx - r, cy)
        quadTo(cx, cy, cx, cy - r)
        close()
    }

    fun draw(density: Float, pct: Float, layers: List<Pair<Int, Float>>, met: Boolean, now: Long): Bitmap {
        val w = (84f * density).roundToInt().coerceIn(120, 280)
        val h = (w * 1.24f).roundToInt()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.scale(w / 100f, w / 100f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val sil = silhouette()

        // Rim, then the glassy body over it — only the outline survives.
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 5f
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = RIM
        c.drawPath(sil, paint)
        paint.style = Paint.Style.FILL
        paint.shader = LinearGradient(0f, 0f, 100f, 124f, Color.WHITE, BODY, Shader.TileMode.CLAMP)
        c.drawPath(sil, paint)
        paint.shader = null

        // Inner ears.
        paint.color = TINT
        paint.alpha = 140
        c.drawCircle(25f, 22f, 6.5f, paint)
        c.drawCircle(75f, 22f, 6.5f, paint)
        paint.alpha = 255

        // The drinks: highest band first, each lower one painted over its share.
        if (pct > 0f && layers.isNotEmpty()) {
            val phase = (now % 6000L) / 6000f * 2f * PI.toFloat()
            c.save()
            c.clipPath(sil)
            for (i in layers.indices.reversed()) {
                val (color, t) = layers[i]
                if (t <= 0f) continue
                val y = BOTTOM - t * (BOTTOM - TOP)
                val top = i == layers.lastIndex
                val band = surface(y, if (top) 2.2f else 1.1f, phase + i * 1.3f)
                band.lineTo(102f, 130f)
                band.lineTo(-2f, 130f)
                band.close()
                paint.shader = LinearGradient(
                    0f, 0f, 0f, 124f,
                    intArrayOf(mix(color, Color.WHITE, 0.28f), color, mix(color, DEEP, 0.22f)),
                    floatArrayOf(0f, 0.55f, 1f),
                    Shader.TileMode.CLAMP
                )
                c.drawPath(band, paint)
            }
            paint.shader = null
            // A bright line along the surface, so it reads as liquid, not paint.
            val t = layers.last().second
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1.6f
            paint.strokeCap = Paint.Cap.ROUND
            paint.color = Color.WHITE
            paint.alpha = 120
            c.drawPath(surface(BOTTOM - t * (BOTTOM - TOP), 2.2f, phase + layers.lastIndex * 1.3f), paint)
            paint.alpha = 255
            paint.style = Paint.Style.FILL
            c.restore()
        }

        // Glass shine.
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.color = Color.WHITE
        paint.alpha = 180
        paint.strokeWidth = 3.2f
        c.drawPath(Path().apply { moveTo(22f, 76f); quadTo(18f, 92f, 26f, 106f) }, paint)
        paint.alpha = 190
        paint.strokeWidth = 2.6f
        c.drawPath(Path().apply { moveTo(30f, 26f); quadTo(34f, 20f, 40f, 18f) }, paint)
        paint.alpha = 255
        paint.style = Paint.Style.FILL

        // Face, always above the drink.
        paint.color = INK
        c.drawOval(RectF(36.4f, 37.6f, 43.6f, 46.4f), paint)
        c.drawOval(RectF(56.4f, 37.6f, 63.6f, 46.4f), paint)
        paint.color = Color.WHITE
        c.drawCircle(41.3f, 40.4f, 1.2f, paint)
        c.drawCircle(61.3f, 40.4f, 1.2f, paint)
        paint.alpha = 217
        c.drawOval(RectF(41f, 45.5f, 59f, 58.5f), paint)
        paint.alpha = 255
        paint.color = INK
        c.drawOval(RectF(46.8f, 47.7f, 53.2f, 52.3f), paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.4f
        c.drawPath(Path().apply { moveTo(46.5f, 54f); quadTo(50f, 57.5f, 53.5f, 54f) }, paint)
        paint.style = Paint.Style.FILL
        paint.color = TINT
        paint.alpha = 153
        c.drawOval(RectF(26f, 49f, 36f, 55f), paint)
        c.drawOval(RectF(64f, 49f, 74f, 55f), paint)
        paint.alpha = 255

        // Goal met: a little sparkle beside the ear.
        if (met) {
            paint.color = SPARK
            c.drawPath(star(90f, 12f, 7f), paint)
            c.drawPath(star(95.5f, 26f, 3.8f), paint)
        }
        return bmp
    }
}
`;

const MESSAGING_KT = (pkg) => `package ${pkg}

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

/**
 * Expo's FCM service, with one message type taken out first.
 *
 * A \`partner-water\` push is data for the home-screen widget: it is written
 * straight into the widget's storage and never becomes a notification, and
 * no JavaScript has to start for it. Everything else goes to Expo exactly as
 * before. Registered above Expo's own service (priority -1) so FCM picks it.
 */
class RepChampMessagingService : ExpoFirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val body = remoteMessage.data["body"]
        if (body != null) {
            try {
                val data = JSONObject(body)
                if (data.optString("type") == "partner-water") {
                    val prefs = getSharedPreferences("repchamp.widget", MODE_PRIVATE).edit()
                    val widget = data.optJSONObject("widget")
                    if (widget == null) {
                        prefs.remove(WaterWidgetProvider.KEY)
                    } else {
                        val json = widget.toString()
                        if (!WaterWidgetProvider.accept(this, json)) return
                        prefs.putString(WaterWidgetProvider.KEY, json)
                    }
                    prefs.apply()
                    WaterWidgetProvider.refresh(this)
                    return
                }
            } catch (e: Exception) {
                // Not ours, or malformed: let Expo have it.
            }
        }
        super.onMessageReceived(remoteMessage)
    }
}
`;

const WATER_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- RemoteViews-safe views only. The two ProgressBars over the bear are the
     animation: launchers run an indeterminate ProgressBar's animation-list,
     which is the one way a widget can move without the app. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/water_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="horizontal"
    android:gravity="center_vertical"
    android:paddingStart="14dp"
    android:paddingEnd="16dp"
    android:paddingTop="12dp"
    android:paddingBottom="12dp"
    android:background="@drawable/water_widget_bg">

    <FrameLayout
        android:layout_width="84dp"
        android:layout_height="104dp">

        <ImageView
            android:id="@+id/water_bear"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:scaleType="fitCenter"
            android:contentDescription="@string/water_widget_bear"
            android:src="@drawable/water_bear_preview" />

        <ProgressBar
            android:id="@+id/water_bubbles_high"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:indeterminate="true"
            android:indeterminateOnly="true"
            android:indeterminateDrawable="@drawable/water_bubbles_high"
            android:visibility="gone" />

        <ProgressBar
            android:id="@+id/water_bubbles_low"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:indeterminate="true"
            android:indeterminateOnly="true"
            android:indeterminateDrawable="@drawable/water_bubbles_low"
            android:visibility="gone" />
    </FrameLayout>

    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:layout_marginStart="12dp"
        android:orientation="vertical">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <TextView
                android:id="@+id/water_title"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="@string/water_widget_preview_title"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="@color/water_widget_eyebrow"
                android:textSize="10sp"
                android:textStyle="bold"
                android:letterSpacing="0.14" />

            <LinearLayout
                android:id="@+id/water_live"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:paddingStart="6dp"
                android:paddingEnd="7dp"
                android:paddingTop="2dp"
                android:paddingBottom="2dp"
                android:background="@drawable/water_live_pill">

                <ProgressBar
                    android:layout_width="8dp"
                    android:layout_height="8dp"
                    android:indeterminate="true"
                    android:indeterminateOnly="true"
                    android:indeterminateDrawable="@drawable/water_live_pulse" />

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_marginStart="4dp"
                    android:text="@string/water_widget_live"
                    android:textColor="@color/water_widget_live"
                    android:textSize="9sp"
                    android:textStyle="bold"
                    android:letterSpacing="0.1" />
            </LinearLayout>
        </LinearLayout>

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="2dp"
            android:orientation="horizontal"
            android:baselineAligned="true">

            <TextView
                android:id="@+id/water_amount"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="1.25 L"
                android:maxLines="1"
                android:textColor="#FFFFFF"
                android:textSize="28sp"
                android:fontFamily="sans-serif-black" />

            <TextView
                android:id="@+id/water_goal"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="6dp"
                android:text="of 2 L"
                android:maxLines="1"
                android:textColor="@color/water_widget_muted"
                android:textSize="13sp"
                android:fontFamily="sans-serif-medium" />
        </LinearLayout>

        <ProgressBar
            android:id="@+id/water_progress"
            style="?android:attr/progressBarStyleHorizontal"
            android:layout_width="match_parent"
            android:layout_height="7dp"
            android:layout_marginTop="7dp"
            android:max="1000"
            android:progress="620"
            android:progressDrawable="@drawable/water_progress" />

        <TextView
            android:id="@+id/water_status"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="8dp"
            android:text="750 ml to go"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="#6EE7B7"
            android:textSize="12.5sp"
            android:fontFamily="sans-serif-medium"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/water_last"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="2dp"
            android:text="@string/water_widget_preview_last"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="@color/water_widget_muted"
            android:textSize="11sp" />
    </LinearLayout>
</LinearLayout>
`;

const WATER_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/water_widget"
    android:previewLayout="@layout/water_widget"
    android:description="@string/water_widget_description"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:minResizeWidth="220dp"
    android:minResizeHeight="110dp"
    android:maxResizeWidth="400dp"
    android:maxResizeHeight="200dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="1800000" />
`;

/* Deep ocean, not the week widget's brand green: this card is about water,
   and the drinks' colours read best against dark blue. */
const WATER_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:startColor="#1E1B4B"
        android:centerColor="#1E3A8A"
        android:endColor="#0C4A6E"
        android:angle="315" />
    <corners android:radius="@dimen/widget_radius" />
</shape>
`;

const WATER_PROGRESS_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:id="@android:id/background">
        <shape>
            <solid android:color="#26FFFFFF" />
            <corners android:radius="4dp" />
        </shape>
    </item>
    <item android:id="@android:id/progress">
        <scale android:scaleWidth="100%" android:scaleGravity="left">
            <shape>
                <gradient android:startColor="#38BDF8" android:endColor="#A78BFA" android:angle="0" />
                <corners android:radius="4dp" />
            </shape>
        </scale>
    </item>
</layer-list>
`;

const WATER_LIVE_PILL_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#2A4ADE80" />
    <corners android:radius="999dp" />
</shape>
`;

const WATER_COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="water_widget_eyebrow">#A5B4FC</color>
    <color name="water_widget_muted">#C7D2FE</color>
    <color name="water_widget_live">#4ADE80</color>
</resources>
`;

const WATER_STRINGS = {
  water_widget_description: 'Your partner’s water today. Their bear fills live as they drink.',
  water_widget_title_empty: 'PARTNER’S WATER',
  water_widget_empty: 'Pair up to see their bear fill here',
  water_widget_new_day: 'No drinks yet today',
  water_widget_live: 'LIVE',
  water_widget_bear: 'Your partner’s water bear',
  water_widget_preview_title: 'ALEX’S WATER',
  water_widget_preview_last: '☕ Coffee · 250 ml · 3:42 PM',
};

/** Every resource file the water widget needs, keyed by path under res/. */
function waterResources() {
  return {
    'drawable/water_widget_bg.xml': WATER_BG_XML,
    'drawable/water_progress.xml': WATER_PROGRESS_XML,
    'drawable/water_live_pill.xml': WATER_LIVE_PILL_XML,
    'drawable/water_bear_preview.xml': PREVIEW_BEAR_XML,
    'values/water_widget_colors.xml': WATER_COLORS_XML,
    ...bubbleDrawables(),
    ...pulseDrawables(),
  };
}

module.exports = {
  WATER_PROVIDER_KT,
  MESSAGING_KT,
  WATER_LAYOUT_XML,
  WATER_INFO_XML,
  WATER_STRINGS,
  waterResources,
};
