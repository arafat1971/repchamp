/**
 * The "partner today" widget: the partner's water, steps and reps as three
 * activity rings around their water bear, each beside mine — drawn in the
 * iOS widget idiom (a plain system card, bold coloured numbers, rings).
 *
 * Kept out of `withPartnerWidget.js` so that file's contract test — every key
 * its Kotlin reads must be one `buildWidgetSnapshot` writes — stays about the
 * week widget. This one has its own test against `buildWaterWidgetSnapshot`.
 *
 * ## How it stays live with the app closed
 *
 * The partner's phone sends a silent (data-only) push each time their water,
 * steps or reps move. `RepChampMessagingService` — a subclass of Expo's own
 * FCM service, registered at a higher priority so FCM picks it — writes the
 * payload into SharedPreferences and redraws, without starting JavaScript.
 * Every other push falls through to Expo untouched.
 *
 * ## How it moves
 *
 * RemoteViews cannot run code on a timer, but a launcher does animate an
 * indeterminate ProgressBar. Four micro-animations ride on that, all only
 * while the partner has been active in the last fifteen minutes (or, for the
 * twinkle, once every ring is closed): a glint orbiting the rings, bubbles
 * rising in the bear after a drink, sparkles when a ring closes, and a
 * pulsing LIVE dot. An inexact alarm redraws when the window ends, so it all
 * settles without the app.
 */

const round = (n) => Math.round(n * 100) / 100;

/* ---------- Geometry (100 x 100 box, shared by bitmap and vectors) ---------- */

/* Rings, inner to outer: water (around the bear), steps, reps. */
const RING = { stroke: 8.5, water: 25.25, steps: 35.5, reps: 45.75 };

/* The bear sits in the rings' hole: BearJar's 100 x 124 box scaled to 34 tall. */
const BEAR_SCALE = 34 / 124;
const BEAR_LEFT = 50 - 50 * BEAR_SCALE;
const BEAR_TOP = 50 - 62 * BEAR_SCALE;
/** Bear-space y (already +2) to ring-box y. */
const by = (y) => BEAR_TOP + y * BEAR_SCALE;
const bx = (x) => BEAR_LEFT + x * BEAR_SCALE;

const circlePath = (cx, cy, r) =>
  `M${round(cx - r)},${round(cy)} a${round(r)},${round(r)} 0 1,1 ${round(2 * r)},0 a${round(r)},${round(r)} 0 1,1 ${round(-2 * r)},0 Z`;

/** An arc from the top, clockwise, as SVG path data. */
function arcPath(r, pct) {
  const a = Math.min(pct, 0.9999) * 2 * Math.PI;
  const x = 50 + r * Math.sin(a);
  const y = 50 - r * Math.cos(a);
  return `M50,${round(50 - r)} A${r},${r} 0 ${pct > 0.5 ? 1 : 0},1 ${round(x)},${round(y)}`;
}

/** A four-point sparkle. */
function starPath(cx, cy, r) {
  return `M${round(cx)},${round(cy - r)} Q${round(cx)},${round(cy)} ${round(cx + r)},${round(cy)} Q${round(cx)},${round(cy)} ${round(cx)},${round(cy + r)} Q${round(cx)},${round(cy)} ${round(cx - r)},${round(cy)} Q${round(cx)},${round(cy)} ${round(cx)},${round(cy - r)} Z`;
}

const vector = (body) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="118dp" android:height="118dp"
    android:viewportWidth="100" android:viewportHeight="100">
${body}
</vector>
`;

const animationList = (name, count, duration) => `<?xml version="1.0" encoding="utf-8"?>
<animation-list xmlns:android="http://schemas.android.com/apk/res/android" android:oneshot="false">
${Array.from({ length: count }, (_, i) => `    <item android:drawable="@drawable/${name}_${i}" android:duration="${duration}" />`).join('\n')}
</animation-list>
`;

/* ---------- Micro-animation 1: bubbles in the bear ---------- */

const BUBBLE_FRAMES = 10;

/* Two runs, so bubbles never rise above the drink: a tall one for a bear at
   least half full, a short low one for a bear with a little in it. */
const BUBBLE_SETS = {
  high: { xs: [42, 51, 58, 46, 55], from: 118, to: 72, size: 2.2 },
  low: { xs: [44, 50, 56], from: 119, to: 104, size: 1.7 },
};

function bubbleFrame(frame, { xs, from, to, size }) {
  return vector(
    xs
      .map((x, i) => {
        const p = (frame / BUBBLE_FRAMES + i / xs.length) % 1;
        const cy = by(from - p * (from - to));
        const cx = bx(x + 1.6 * Math.sin(p * Math.PI * 4));
        const r = size * BEAR_SCALE * (0.7 + 0.6 * p) * 1.6;
        const alpha = p > 0.8 ? round(0.8 * (1 - (p - 0.8) / 0.2)) : 0.8;
        return `    <path android:fillColor="#FFFFFF" android:fillAlpha="${alpha}" android:pathData="${circlePath(cx, cy, r)}" />`;
      })
      .join('\n'),
  );
}

/* ---------- Micro-animation 2: a glint orbiting the rings ---------- */

/* A comet on the outer ring: a bright head at twelve o'clock and a tail
   fading behind it. A RotateDrawable spins it; the ProgressBar drives it. */
function glintDrawable() {
  const r = RING.reps;
  const segments = [];
  for (let i = 0; i < 6; i++) {
    const a0 = (-48 + i * 8) * (Math.PI / 180);
    const a1 = (-48 + (i + 1) * 8) * (Math.PI / 180);
    const p = (a) => `${round(50 + r * Math.sin(a))},${round(50 - r * Math.cos(a))}`;
    segments.push(
      `    <path android:strokeColor="#FFFFFF" android:strokeAlpha="${round(0.08 + i * 0.1)}" android:strokeWidth="${round(2 + i * 0.35)}" android:strokeLineCap="round" android:pathData="M${p(a0)} A${r},${r} 0 0,1 ${p(a1)}" />`,
    );
  }
  segments.push(`    <path android:fillColor="#FFFFFF" android:fillAlpha="0.95" android:pathData="${circlePath(50, 50 - r, 2.4)}" />`);
  return {
    'drawable/pt_glint.xml': vector(segments.join('\n')),
    'drawable/pt_orbit.xml': `<?xml version="1.0" encoding="utf-8"?>
<rotate xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@drawable/pt_glint"
    android:fromDegrees="0"
    android:toDegrees="360"
    android:pivotX="50%"
    android:pivotY="50%" />
`,
  };
}

/* ---------- Micro-animation 3: sparkles when a ring closes ---------- */

const TWINKLE_FRAMES = 8;
const SPARKS = [
  { x: 88, y: 12, r: 5.5 },
  { x: 95, y: 27, r: 3 },
  { x: 11, y: 88, r: 4 },
  { x: 90, y: 86, r: 3.2 },
];

function twinkleDrawables() {
  const files = {};
  for (let f = 0; f < TWINKLE_FRAMES; f++) {
    files[`drawable/pt_twinkle_${f}.xml`] = vector(
      SPARKS.map((s, i) => {
        const phase = (f / TWINKLE_FRAMES + i / SPARKS.length) % 1;
        const k = Math.sin(phase * Math.PI);
        return `    <path android:fillColor="#FFD60A" android:fillAlpha="${round(0.25 + 0.75 * k)}" android:pathData="${starPath(s.x, s.y, s.r * (0.45 + 0.55 * k))}" />`;
      }).join('\n'),
    );
  }
  files['drawable/pt_twinkle.xml'] = animationList('pt_twinkle', TWINKLE_FRAMES, 110);
  return files;
}

/* ---------- Micro-animation 4: the LIVE dot's heartbeat ---------- */

function pulseDrawables() {
  const files = {};
  const steps = [1, 0.85, 0.65, 0.45, 0.65, 0.85];
  steps.forEach((a, i) => {
    const alpha = Math.round((0.35 + 0.65 * a) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    files[`drawable/pt_pulse_${i}.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android" android:inset="${round((1 - a) * 2.5)}dp">
    <shape android:shape="oval">
        <solid android:color="#${alpha}30D158" />
    </shape>
</inset>
`;
  });
  files['drawable/pt_live_pulse.xml'] = animationList('pt_pulse', steps.length, 140);
  return files;
}

/* ---------- The picker preview (the picker never calls onUpdate) ---------- */

const RING_COLORS = {
  water: ['#32ADE6', '#64D2FF'],
  steps: ['#30D158', '#A8F06C'],
  reps: ['#FF2D55', '#FF7A9A'],
};

const bearCircle = (cx, cy, r) =>
  `M${cx - r},${cy + 2} a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0 Z`;
const bearEllipse = (cx, cy, rx, ry) =>
  `M${cx - rx},${cy + 2} a${rx},${ry} 0 1,1 ${2 * rx},0 a${rx},${ry} 0 1,1 ${-2 * rx},0 Z`;
const BEAR_SILHOUETTE = [bearCircle(25, 20, 13), bearCircle(75, 20, 13), bearCircle(50, 40, 30), bearEllipse(50, 86, 38, 33)].join(' ');

function previewRings() {
  const ring = (key, pct) => {
    const [start] = RING_COLORS[key];
    const r = RING[key];
    return [
      `    <path android:strokeColor="${start}" android:strokeAlpha="0.2" android:strokeWidth="${RING.stroke}" android:pathData="${circlePath(50, 50, r)}" />`,
      `    <path android:strokeColor="${start}" android:strokeWidth="${RING.stroke}" android:strokeLineCap="round" android:pathData="${arcPath(r, pct)}" />`,
    ].join('\n');
  };
  const s = Math.round(BEAR_SCALE * 1000) / 1000;
  const bear = `    <group android:translateX="${round(BEAR_LEFT)}" android:translateY="${round(BEAR_TOP)}" android:scaleX="${s}" android:scaleY="${s}">
        <path android:fillColor="#A5B4FC" android:strokeColor="#A5B4FC" android:strokeWidth="5" android:pathData="${BEAR_SILHOUETTE}" />
        <path android:fillColor="#EEF0FF" android:pathData="${BEAR_SILHOUETTE}" />
        <group>
            <clip-path android:pathData="${BEAR_SILHOUETTE}" />
            <path android:fillColor="#38BDF8" android:pathData="M0,72 Q12,68 25,72 T50,72 T75,72 T100,72 L100,124 L0,124 Z" />
            <path android:fillColor="#FB923C" android:pathData="M0,104 Q12,102 25,104 T50,104 T75,104 T100,104 L100,124 L0,124 Z" />
        </group>
        <path android:fillColor="#1E293B" android:pathData="${circlePath(40, 42, 4)} ${circlePath(60, 42, 4)}" />
        <path android:fillColor="#FFFFFF" android:fillAlpha="0.85" android:pathData="${circlePath(50, 52, 8)}" />
        <path android:fillColor="#1E293B" android:pathData="${circlePath(50, 50, 3)}" />
        <path android:fillColor="#8B5CF6" android:fillAlpha="0.55" android:pathData="${circlePath(31, 52, 4)} ${circlePath(69, 52, 4)}" />
    </group>`;
  return vector([ring('reps', 0.72), ring('steps', 0.58), ring('water', 0.62), bear].join('\n'));
}

/* ---------- Kotlin: the provider and the renderer ---------- */

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
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The partner's day — water, steps, reps — as rings around their water bear.
 *
 * Draws what \`domain/waterWidget\` phrased and coloured; decides only what
 * belongs to draw time: whether the payload is still today's, and whether the
 * partner was active recently enough to animate.
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
        private val ME_KEYS = arrayOf(
            "hasMe", "meWater", "meSteps", "meReps", "meWaterMl", "meStepsN", "meRepsN",
            "mePct", "meMet", "meLayers", "streak", "meLastAt", "meadow", "sky", "temp", "season", "occasion"
        )
        private val STYLE_KEYS = arrayOf(
            "styled", "layout", "theme", "showSteps", "showReps", "showMine", "motion", "weather", "surface"
        )

        /**
         * Whether a new copy should replace the stored one.
         *
         * The same state arrives twice — the partner's silent push and this
         * app's copy from the couple document — in either order. A later day
         * always wins; within a day the higher \`rev\` does, so an older copy
         * can never walk the rings backwards. \`rev\` 0 carries no ordering
         * (an older partner app) and is taken as is.
         */
        fun accept(context: Context, json: String?): Boolean {
            if (json.isNullOrBlank()) return true
            val old = stored(context) ?: return true
            return try {
                val next = JSONObject(json)
                val nextDay = next.optString("day")
                val prevDay = old.optString("day")
                if (nextDay != prevDay) {
                    nextDay > prevDay
                } else {
                    val rev = next.optLong("rev", 0L)
                    rev == 0L || rev >= old.optLong("rev", 0L)
                }
            } catch (e: Exception) {
                true
            }
        }

        /**
         * A push-built copy knows nothing about *my* numbers; keep the ones
         * this app last wrote for the same day, so the head-to-head survives.
         */
        fun withMine(context: Context, json: String): String {
            return try {
                val next = JSONObject(json)
                val old = stored(context) ?: return json
                var changed = false
                if (old.optString("day") == next.optString("day") &&
                    !next.optBoolean("hasMe", false) && old.optBoolean("hasMe", false)
                ) {
                    for (k in ME_KEYS) next.put(k, old.opt(k))
                    changed = true
                }
                // The look is this phone's choice, whatever day it is.
                if (!next.optBoolean("styled", false) && old.optBoolean("styled", false)) {
                    for (k in STYLE_KEYS) next.put(k, old.opt(k))
                    changed = true
                }
                if (changed) next.toString() else json
            } catch (e: Exception) {
                json
            }
        }

        private fun stored(context: Context): JSONObject? {
            val raw = context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
                .getString(KEY, null)
            if (raw.isNullOrBlank()) return null
            return try {
                JSONObject(raw)
            } catch (e: Exception) {
                null
            }
        }

        /** Redraw every placed instance now — used by the messaging service. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, WaterWidgetProvider::class.java))
            ids.forEach { render(context, manager, it) }
            // The glance reads the same payload; keep it in step.
            GlanceWidgetProvider.refresh(context)
        }

        private fun fraction(snap: JSONObject?, key: String): Float =
            (snap?.optDouble(key, 0.0) ?: 0.0).toFloat().coerceIn(0f, 1f)

        fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val stored = stored(context)
            val layoutName = stored?.optString("layout", "scene") ?: "scene"
            val scene = layoutName == "scene"
            val duo = layoutName == "duo"
            val views = RemoteViews(
                context.packageName,
                when {
                    scene -> R.layout.water_widget_scene
                    duo -> R.layout.water_widget_duo
                    else -> R.layout.water_widget
                }
            )
            val density = context.resources.displayMetrics.density
            val now = System.currentTimeMillis()
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
            // Yesterday's numbers are not today's: a new day starts every ring empty.
            val snap = if (stored != null && stored.optString("day") == today) stored else null

            // The look survives a new day; only the numbers reset.
            val look = stored
            val showSteps = look?.optBoolean("showSteps", true) ?: true
            val showReps = look?.optBoolean("showReps", true) ?: true
            val showMine = look?.optBoolean("showMine", true) ?: true
            val motion = look?.optBoolean("motion", true) ?: true
            val palette = Palette.resolve(context, look?.optString("theme", "sunset") ?: "sunset")
            if (!scene) Palette.apply(views, palette, duo)

            // Tapping opens the partner's day in the app.
            val open = Intent(Intent.ACTION_VIEW, Uri.parse("repchamp://couple/partner"))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            views.setOnClickPendingIntent(
                R.id.pt_root,
                PendingIntent.getActivity(
                    context, 7300, open,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )

            if (scene) {
                renderScene(context, manager, id, views, stored, snap, showSteps, showReps, showMine, motion, now)
                manager.updateAppWidget(id, views)
                return
            }
            if (duo) {
                renderDuo(context, views, stored, snap, palette, showSteps, showReps, showMine, motion, density, now)
                manager.updateAppWidget(id, views)
                return
            }

            show(views, R.id.pt_steps_row, showSteps)
            show(views, R.id.pt_reps_row, showReps)

            val waterPct = fraction(snap, "pct")
            val stepsPct = if (showSteps) fraction(snap, "stepsPct") else -1f
            val repsPct = if (showReps) fraction(snap, "repsPct") else -1f
            val layers = layersOf(snap, "layers")

            when {
                stored == null -> {
                    views.setTextViewText(R.id.pt_title, context.getString(R.string.pt_title_empty))
                    views.setTextViewText(R.id.pt_footer, context.getString(R.string.pt_empty))
                }
                snap == null -> {
                    views.setTextViewText(R.id.pt_title, stored.optString("title"))
                    views.setTextViewText(R.id.pt_footer, context.getString(R.string.pt_new_day))
                }
                else -> {
                    views.setTextViewText(R.id.pt_title, snap.optString("title"))
                    val footerAt = snap.optLong("footerAt", 0L)
                    val time = if (footerAt > 0L) {
                        " · " + android.text.format.DateFormat.getTimeFormat(context).format(Date(footerAt))
                    } else {
                        ""
                    }
                    views.setTextViewText(R.id.pt_footer, snap.optString("footer") + time)
                }
            }

            views.setTextViewText(R.id.pt_water_value, snap?.optString("amount") ?: "0 ml")
            views.setTextViewText(R.id.pt_water_goal, snap?.optString("goal") ?: "")
            views.setTextViewText(R.id.pt_steps_value, snap?.optString("steps") ?: "—")
            views.setTextViewText(R.id.pt_steps_goal, snap?.optString("stepsGoal") ?: "")
            views.setTextViewText(R.id.pt_reps_value, snap?.optString("reps") ?: "0")
            views.setTextViewText(R.id.pt_reps_goal, snap?.optString("repsDetail") ?: "reps")
            you(context, views, R.id.pt_water_you, if (showMine) snap?.optString("meWater") else null)
            you(context, views, R.id.pt_steps_you, if (showMine) snap?.optString("meSteps") else null)
            you(context, views, R.id.pt_reps_you, if (showMine) snap?.optString("meReps") else null)

            /* Fresh: active — a drink or a set — in the last fifteen minutes.
               A minute of grace for the other phone's clock running ahead. */
            val activeAt = snap?.optLong("activeAt", 0L) ?: 0L
            val lastAt = snap?.optLong("lastAt", 0L) ?: 0L
            val fresh = motion && activeAt > 0L && now - activeAt >= -60_000L && now - activeAt <= LIVE_MS
            val drankFresh = motion && lastAt > 0L && now - lastAt >= -60_000L && now - lastAt <= LIVE_MS
            val allMet = snap?.optBoolean("allMet", false) ?: false
            val anyClosed = waterPct >= 1f || stepsPct >= 1f || repsPct >= 1f

            show(views, R.id.pt_live, fresh)
            show(views, R.id.pt_orbit, fresh)
            show(views, R.id.pt_bubbles_high, drankFresh && waterPct >= 0.5f)
            show(views, R.id.pt_bubbles_low, drankFresh && waterPct >= 0.2f && waterPct < 0.5f)
            show(views, R.id.pt_twinkle, motion && (allMet || (fresh && anyClosed)))
            if (fresh) scheduleCalm(context, activeAt + LIVE_MS + 5_000L)

            views.setImageViewBitmap(
                R.id.pt_rings,
                RingArt.draw(density, waterPct, stepsPct, repsPct, layers, snap?.optBoolean("met", false) ?: false, now)
            )

            manager.updateAppWidget(id, views)
        }

        /** Drink bands from the payload: colour and top, bottom to top. */
        private fun layersOf(snap: JSONObject?, key: String): List<Pair<Int, Float>> {
            val out = ArrayList<Pair<Int, Float>>()
            val arr = snap?.optJSONArray(key) ?: return out
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val color = try {
                    Color.parseColor(o.optString("c"))
                } catch (e: Exception) {
                    continue
                }
                out.add(color to o.optDouble("t", 0.0).toFloat().coerceIn(0f, 1f))
            }
            return out
        }

        /**
         * The duo: both bears face to face, a tug-of-war per metric with the
         * leader crowned, the rivalry line, and a button to drink right here.
         */
        private fun renderDuo(
            context: Context,
            views: RemoteViews,
            stored: JSONObject?,
            snap: JSONObject?,
            look: Palette.Look,
            showSteps: Boolean,
            showReps: Boolean,
            showMine: Boolean,
            motion: Boolean,
            density: Float,
            now: Long
        ) {
            val name = stored?.optString("name")?.takeIf { it.isNotBlank() }
            views.setTextViewText(
                R.id.pt_title,
                if (name == null) context.getString(R.string.pd_title_empty) else stored?.optString("vs") ?: name
            )
            views.setTextViewText(
                R.id.pt_footer,
                when {
                    stored == null -> context.getString(R.string.pt_empty)
                    snap == null -> context.getString(R.string.pd_new_day)
                    else -> snap.optString("duel")
                }
            )
            views.setTextViewText(R.id.d_them_name, name ?: context.getString(R.string.pd_partner))
            views.setTextViewText(R.id.d_them_amt, snap?.optString("amount") ?: "0 ml")

            val hasMe = snap?.optBoolean("hasMe", false) ?: false
            val meWater = if (hasMe) snap?.optString("meWater") ?: "—" else "—"
            views.setTextViewText(R.id.d_me_amt, meWater)

            val waterPct = fraction(snap, "pct")
            val mePct = if (hasMe) fraction(snap, "mePct") else 0f
            val met = snap?.optBoolean("met", false) ?: false
            val meMet = hasMe && (snap?.optBoolean("meMet", false) ?: false)
            views.setImageViewBitmap(
                R.id.d_them_bear,
                BearArt.bitmap(density, waterPct, layersOf(snap, "layers"), met, BearArt.THEIRS, now)
            )
            views.setImageViewBitmap(
                R.id.d_me_bear,
                BearArt.bitmap(density, mePct, if (hasMe) layersOf(snap, "meLayers") else emptyList(), meMet, BearArt.MINE, now)
            )

            duel(
                views, R.id.d_water_them, R.id.d_water_me, R.id.d_water_tug,
                snap?.optLong("waterMl", 0L) ?: 0L,
                if (hasMe) snap?.optLong("meWaterMl", 0L) ?: 0L else 0L,
                snap?.optString("amount") ?: "0 ml", meWater, showMine, look
            )
            show(views, R.id.d_steps_row, showSteps)
            if (showSteps) {
                val a = snap?.optLong("stepsN", -1L) ?: -1L
                val b = if (hasMe) snap?.optLong("meStepsN", -1L) ?: -1L else -1L
                duel(
                    views, R.id.d_steps_them, R.id.d_steps_me, R.id.d_steps_tug,
                    max(0L, a), max(0L, b),
                    if (a >= 0L) snap?.optString("steps") ?: "—" else "—",
                    if (b >= 0L) snap?.optString("meSteps") ?: "—" else "—",
                    showMine, look
                )
            }
            show(views, R.id.d_reps_row, showReps)
            if (showReps) {
                duel(
                    views, R.id.d_reps_them, R.id.d_reps_me, R.id.d_reps_tug,
                    snap?.optLong("repsN", 0L) ?: 0L,
                    if (hasMe) snap?.optLong("meRepsN", 0L) ?: 0L else 0L,
                    snap?.optString("reps") ?: "0",
                    if (hasMe) snap?.optString("meReps") ?: "0" else "—",
                    showMine, look
                )
            }

            /* Motion only while they have been active in the last fifteen
               minutes, with a minute of grace for a clock running ahead. */
            val activeAt = snap?.optLong("activeAt", 0L) ?: 0L
            val lastAt = snap?.optLong("lastAt", 0L) ?: 0L
            val fresh = motion && activeAt > 0L && now - activeAt >= -60_000L && now - activeAt <= LIVE_MS
            val drankFresh = motion && lastAt > 0L && now - lastAt >= -60_000L && now - lastAt <= LIVE_MS
            show(views, R.id.pt_live, fresh)
            show(views, R.id.d_them_bubbles_high, drankFresh && waterPct >= 0.5f)
            show(views, R.id.d_them_bubbles_low, drankFresh && waterPct >= 0.2f && waterPct < 0.5f)
            show(views, R.id.d_them_twinkle, fresh && met)
            show(views, R.id.d_me_twinkle, motion && meMet && fresh)
            if (fresh) scheduleCalm(context, activeAt + LIVE_MS + 5_000L)

            // The quick drink: one tap logs 250 ml through the app.
            val drink = Intent(Intent.ACTION_VIEW, Uri.parse("repchamp://drink?ml=250"))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            views.setOnClickPendingIntent(
                R.id.d_drink,
                PendingIntent.getActivity(
                    context, 7302, drink,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
        }

        /**
         * The scene: the real sky over a hill, both bears in a tug-of-war over
         * water, painted as one picture sized to the widget; text, chips and
         * the drink button ride on top, and the sky's own animations — stars
         * at night, rain on their bear after a drink, confetti at a goal —
         * are ProgressBars over it.
         */
        private fun renderScene(
            context: Context,
            manager: AppWidgetManager,
            id: Int,
            views: RemoteViews,
            stored: JSONObject?,
            snap: JSONObject?,
            showSteps: Boolean,
            showReps: Boolean,
            showMine: Boolean,
            motion: Boolean,
            now: Long
        ) {
            val name = stored?.optString("name")?.takeIf { it.isNotBlank() }
            views.setTextViewText(
                R.id.pt_title,
                if (name == null) context.getString(R.string.pd_title_empty) else stored?.optString("vs") ?: name
            )
            views.setTextViewText(
                R.id.pt_footer,
                when {
                    stored == null -> context.getString(R.string.pt_empty)
                    snap == null -> context.getString(R.string.pd_new_day)
                    else -> snap.optString("duel")
                }
            )

            val hasMe = snap?.optBoolean("hasMe", false) ?: false
            show(views, R.id.s_steps, showSteps)
            if (showSteps) {
                val a = snap?.optLong("stepsN", -1L) ?: -1L
                val b = if (hasMe) snap?.optLong("meStepsN", -1L) ?: -1L else -1L
                views.setTextViewText(
                    R.id.s_steps,
                    chip(
                        "👟", max(0L, a), max(0L, b),
                        if (a >= 0L) snap?.optString("steps") ?: "—" else "—",
                        if (b >= 0L) snap?.optString("meSteps") ?: "—" else "—",
                        showMine
                    )
                )
            }
            show(views, R.id.s_reps, showReps)
            if (showReps) {
                views.setTextViewText(
                    R.id.s_reps,
                    chip(
                        "💪",
                        snap?.optLong("repsN", 0L) ?: 0L,
                        if (hasMe) snap?.optLong("meRepsN", 0L) ?: 0L else 0L,
                        snap?.optString("reps") ?: "0",
                        if (hasMe) snap?.optString("meReps") ?: "0" else "—",
                        showMine
                    )
                )
            }

            val waterA = snap?.optLong("waterMl", 0L) ?: 0L
            val waterB = if (hasMe) snap?.optLong("meWaterMl", 0L) ?: 0L else 0L
            val share = when {
                !showMine -> 0.5f
                waterA + waterB > 0L -> waterA.toFloat() / (waterA + waterB).toFloat()
                else -> 0.5f
            }

            val activeAt = snap?.optLong("activeAt", 0L) ?: 0L
            val lastAt = snap?.optLong("lastAt", 0L) ?: 0L
            val fresh = motion && activeAt > 0L && now - activeAt >= -60_000L && now - activeAt <= LIVE_MS
            val drankFresh = motion && lastAt > 0L && now - lastAt >= -60_000L && now - lastAt <= LIVE_MS
            val met = snap?.optBoolean("met", false) ?: false
            val meMet = hasMe && (snap?.optBoolean("meMet", false) ?: false)

            val cal = java.util.Calendar.getInstance()
            val hour = cal.get(java.util.Calendar.HOUR_OF_DAY) + cal.get(java.util.Calendar.MINUTE) / 60f
            val options = manager.getAppWidgetOptions(id)
            val wDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0).takeIf { it > 0 } ?: 330
            val hDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0).takeIf { it > 0 } ?: 170

            val streak = if (hasMe) snap?.optInt("streak", 0) ?: 0 else 0
            // They splashed me: hearts over my bear for the live window.
            val cheerAt = snap?.optLong("cheerAt", 0L) ?: 0L
            val cheered = cheerAt > 0L && now - cheerAt >= -60_000L && now - cheerAt <= LIVE_MS
            // A reaction they sent me: an emoji in a bubble over my bear.
            val reactAt = snap?.optLong("reactAt", 0L) ?: 0L
            val reacted = reactAt > 0L && now - reactAt >= -60_000L && now - reactAt <= LIVE_MS
            val reactEmoji = if (reacted) snap?.optString("reactEmoji", "") ?: "" else ""
            // My local weather, when switched on, and this week's meadow.
            val skyKind = snap?.optString("sky", "") ?: ""
            val temp = snap?.optString("temp", "") ?: ""
            val meadowArr = snap?.optJSONArray("meadow")
            val meadow = IntArray(7) { meadowArr?.optInt(it, 0) ?: 0 }
            views.setViewVisibility(R.id.s_temp, if (temp.isNotBlank()) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.s_temp, temp)

            // Both drank within ten minutes of each other, just now: a clink.
            val meLastAt = if (hasMe) snap?.optLong("meLastAt", 0L) ?: 0L else 0L
            val latestSip = max(lastAt, meLastAt)
            val together = lastAt > 0L && meLastAt > 0L &&
                kotlin.math.abs(lastAt - meLastAt) <= 10L * 60L * 1000L &&
                now - latestSip >= -60_000L && now - latestSip <= LIVE_MS
            views.setViewVisibility(R.id.s_streak, if (streak > 0) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.s_streak, "🔥 " + streak)
            views.setImageViewBitmap(
                R.id.s_scene,
                SceneArt.draw(
                    context.resources.displayMetrics.density, wDp, hDp, hour, now,
                    SceneArt.Bear(fraction(snap, "pct"), layersOf(snap, "layers"), met, name ?: context.getString(R.string.pd_partner), snap?.optString("amount") ?: "0 ml", waterA),
                    SceneArt.Bear(if (hasMe) fraction(snap, "mePct") else 0f, if (hasMe) layersOf(snap, "meLayers") else emptyList(), meMet, context.getString(R.string.pd_you), if (hasMe) snap?.optString("meWater") ?: "—" else "—", waterB),
                    share, drankFresh, streak, snap?.optInt("visitor", 0) ?: 0, cheered, together,
                    skyKind, meadow, reactEmoji,
                    stored?.optString("surface", "glass") ?: "glass",
                    stored?.optString("season", "summer") ?: "summer",
                    snap?.optString("occasion", "") ?: ""
                )
            )

            val night = SceneArt.isNight(hour)
            show(views, R.id.pt_live, fresh)
            show(views, R.id.s_stars, motion && night)
            show(views, R.id.s_rain, drankFresh)
            show(views, R.id.s_confetti, motion && (((met || meMet) && fresh) || together))
            if (together) scheduleCalm(context, latestSip + LIVE_MS + 5_000L)
            show(views, R.id.s_hearts, motion && cheered)
            show(views, R.id.s_rainfall, motion && (skyKind == "rain" || skyKind == "storm"))
            show(views, R.id.s_snowfall, motion && skyKind == "snow")
            if (reacted) scheduleCalm(context, reactAt + LIVE_MS + 5_000L)

            // Tap their bear to send a reaction.
            val react = Intent(Intent.ACTION_VIEW, Uri.parse("repchamp://react"))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            views.setOnClickPendingIntent(
                R.id.s_tap_them,
                PendingIntent.getActivity(
                    context, 7304, react,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            if (fresh) scheduleCalm(context, activeAt + LIVE_MS + 5_000L)
            if (cheered) scheduleCalm(context, max(cheerAt, activeAt) + LIVE_MS + 5_000L)

            // The splash: a playful water nudge to them, straight from here.
            val splash = Intent(Intent.ACTION_VIEW, Uri.parse("repchamp://splash"))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            views.setOnClickPendingIntent(
                R.id.d_splash,
                PendingIntent.getActivity(
                    context, 7303, splash,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )

            val drink = Intent(Intent.ACTION_VIEW, Uri.parse("repchamp://drink?ml=250"))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            views.setOnClickPendingIntent(
                R.id.d_drink,
                PendingIntent.getActivity(
                    context, 7302, drink,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
        }

        /** "👟 👑 6,120 · 4,100" — the leader crowned, my side optional. */
        private fun chip(icon: String, a: Long, b: Long, themText: String, meText: String, showMine: Boolean): String {
            val themLead = a > b
            val meLead = showMine && b > a
            val them = (if (themLead) "👑 " else "") + themText
            return if (showMine) icon + " " + them + "  ·  " + meText + (if (meLead) " 👑" else "") else icon + " " + them
        }

        /**
         * One metric as a tug-of-war: the bar is their share from the left,
         * mine from the right; the leader is crowned and drawn brighter.
         * With "compare" off, my side stays blank and the bar is only theirs.
         */
        private fun duel(
            views: RemoteViews,
            themId: Int,
            meId: Int,
            tugId: Int,
            a: Long,
            b: Long,
            themText: String,
            meText: String,
            showMine: Boolean,
            look: Palette.Look
        ) {
            val share = when {
                !showMine -> if (a > 0L) 1000 else 0
                a + b > 0L -> ((a * 1000L) / (a + b)).toInt()
                else -> 500
            }
            views.setProgressBar(tugId, 1000, share, false)
            val themLead = a > b
            val meLead = showMine && b > a
            views.setTextViewText(themId, (if (themLead) "👑 " else "") + themText)
            views.setTextColor(themId, if (themLead) look.text else look.secondary)
            views.setTextViewText(meId, if (showMine) meText + (if (meLead) " 👑" else "") else "")
            views.setTextColor(meId, if (meLead) look.text else look.secondary)
        }

        private fun show(views: RemoteViews, id: Int, on: Boolean) {
            views.setViewVisibility(id, if (on) View.VISIBLE else View.GONE)
        }

        private fun you(context: Context, views: RemoteViews, id: Int, value: String?) {
            if (value.isNullOrBlank()) {
                views.setViewVisibility(id, View.GONE)
            } else {
                views.setTextViewText(id, context.getString(R.string.pt_you, value))
                views.setViewVisibility(id, View.VISIBLE)
            }
        }

        /** Redraw once the live window closes, so the animations stop on their own. */
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
            // minutes' slack on "stop animating" costs nothing.
            alarms.set(AlarmManager.RTC, at, pending)
        }
    }
}

/**
 * Three activity rings — reps outside, steps, water inside — around the
 * partner's water bear, in a 100 x 100 box.
 */
object RingArt {
    private const val STROKE = ${RING.stroke}f
    private val WATER = intArrayOf(Color.parseColor("${RING_COLORS.water[0]}"), Color.parseColor("${RING_COLORS.water[1]}"))
    private val STEPS = intArrayOf(Color.parseColor("${RING_COLORS.steps[0]}"), Color.parseColor("${RING_COLORS.steps[1]}"))
    private val REPS = intArrayOf(Color.parseColor("${RING_COLORS.reps[0]}"), Color.parseColor("${RING_COLORS.reps[1]}"))

    fun draw(
        density: Float,
        water: Float,
        steps: Float,
        reps: Float,
        layers: List<Pair<Int, Float>>,
        met: Boolean,
        now: Long
    ): Bitmap {
        val size = (118f * density).roundToInt().coerceIn(160, 360)
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.scale(size / 100f, size / 100f)

        ring(c, ${RING.reps}f, reps, REPS)
        ring(c, ${RING.steps}f, steps, STEPS)
        ring(c, ${RING.water}f, water, WATER)

        c.save()
        c.translate(${round(BEAR_LEFT)}f, ${round(BEAR_TOP)}f)
        c.scale(${Math.round(BEAR_SCALE * 1000) / 1000}f, ${Math.round(BEAR_SCALE * 1000) / 1000}f)
        BearArt.drawInto(c, water, layers, met, BearArt.THEIRS, now)
        c.restore()
        return bmp
    }

    /** One ring: a faint track, a gradient arc from twelve o'clock, round caps. */
    private fun ring(c: Canvas, r: Float, pct: Float, colors: IntArray) {
        if (pct < 0f) return // hidden by the widget's style
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = STROKE
        paint.color = colors[0]
        paint.alpha = 52
        c.drawCircle(50f, 50f, r, paint)
        if (pct <= 0.004f) return

        paint.alpha = 255
        val sweep = 360f * min(pct, 1f)
        val shader = SweepGradient(50f, 50f, colors, floatArrayOf(0f, max(sweep / 360f, 0.02f)))
        val m = Matrix()
        m.setRotate(-90f, 50f, 50f)
        shader.setLocalMatrix(m)
        paint.shader = shader
        paint.strokeCap = Paint.Cap.ROUND
        c.drawArc(RectF(50f - r, 50f - r, 50f + r, 50f + r), -90f, sweep, false, paint)
        paint.shader = null

        // The start cap in the start colour — the sweep would paint it the end's.
        val fill = Paint(Paint.ANTI_ALIAS_FLAG)
        fill.color = colors[0]
        c.drawCircle(50f, 50f - r, STROKE / 2f, fill)

        // The leading cap, lifted with a soft shadow the way a closed ring overlaps itself.
        val a = (sweep - 90f) * (PI.toFloat() / 180f)
        val x = 50f + r * cos(a)
        val y = 50f + r * sin(a)
        val cap = Paint(Paint.ANTI_ALIAS_FLAG)
        cap.color = colors[1]
        if (pct >= 1f) cap.setShadowLayer(1.6f, 0f, 0f, Color.argb(110, 0, 0, 0))
        c.drawCircle(x, y, STROKE / 2f, cap)
    }
}

/**
 * The scene: the real sky over a hill, and both bears in a tug-of-war over
 * water — the rope's red flag drifts toward whoever has drunk more, and the
 * one ahead leans back harder. Painted once per update, sized to the widget.
 */
object SceneArt {
    class Bear(
        val pct: Float,
        val layers: List<Pair<Int, Float>>,
        val met: Boolean,
        val label: String,
        val amount: String,
        val ml: Long
    )

    private class Sky(val top: Int, val bottom: Int, val hillBack: Int, val hillFront: Int, val cloud: Int)

    private val NIGHT = Sky(0xFF0B1026.toInt(), 0xFF3B2A6B.toInt(), 0xFF1E3A5F.toInt(), 0xFF15452F.toInt(), 0x33FFFFFF)
    private val DAWN = Sky(0xFF93C5FD.toInt(), 0xFFFBCFE8.toInt(), 0xFF86EFAC.toInt(), 0xFF4ADE80.toInt(), 0xE6FFFFFF.toInt())
    private val DAY = Sky(0xFF38BDF8.toInt(), 0xFFBAE6FD.toInt(), 0xFF86EFAC.toInt(), 0xFF22C55E.toInt(), 0xF2FFFFFF.toInt())
    private val GOLDEN = Sky(0xFF6D28D9.toInt(), 0xFFFB923C.toInt(), 0xFF65A30D.toInt(), 0xFF3F6212.toInt(), 0x99FFE4E6.toInt())

    fun isNight(hour: Float): Boolean = hour < 5f || hour >= 20f

    private fun skyFor(hour: Float): Sky = when {
        isNight(hour) -> NIGHT
        hour < 8f -> DAWN
        hour < 17f -> DAY
        else -> GOLDEN
    }

    fun draw(
        density: Float,
        wDp: Int,
        hDp: Int,
        hour: Float,
        now: Long,
        them: Bear,
        me: Bear,
        share: Float,
        raining: Boolean,
        streak: Int,
        visitor: Int,
        cheered: Boolean,
        together: Boolean,
        weather: String,
        meadow: IntArray,
        reaction: String,
        surface: String,
        season: String,
        occasion: String
    ): Bitmap {
        /* 1.5x, not the screen's density: the picture rides in the update's
           binder transaction, and a full-density one can be too big. The
           illustration is soft by nature, so the scale-up does not show. */
        val scale = min(density, 1.5f)
        val w = (wDp * scale).roundToInt().coerceIn(240, 720)
        val h = (hDp * scale).roundToInt().coerceIn(140, 420)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val W = w.toFloat()
        val H = h.toFloat()
        val u = scale // one dp
        val sky = weathered(skyFor(hour), weather)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val overcast = weather == "rain" || weather == "storm" || weather == "snow" || weather == "fog"

        val night = isNight(hour)
        val grass = seasonGrass(season, night)
        val backdrop = surface == "sky"
        val glass = surface == "glass"

        /* On a sky card, the card itself, rounded like every widget on the
           launcher. Without one the picture is transparent: the scene floats
           on the wallpaper, and only the island and the sky's things show. */
        if (backdrop) {
            val radius = 22f * u
            val card = Path().apply { addRoundRect(RectF(0f, 0f, W, H), radius, radius, Path.Direction.CW) }
            c.clipPath(card)
            paint.shader = LinearGradient(0f, 0f, 0f, H, sky.top, sky.bottom, Shader.TileMode.CLAMP)
            c.drawRect(0f, 0f, W, H, paint)
            paint.shader = null
        }
        if (glass) glassPane(c, paint, sky, W, H, u)

        // Stars, placed the same way every night so they do not jump about.
        if (backdrop && night) {
            val rnd = java.util.Random(7L)
            paint.color = Color.WHITE
            repeat(34) {
                val x = rnd.nextFloat() * W
                val y = rnd.nextFloat() * H * 0.55f
                paint.alpha = 90 + rnd.nextInt(150)
                c.drawCircle(x, y, (0.6f + rnd.nextFloat() * 1.1f) * u, paint)
            }
            paint.alpha = 255
        }

        // Sun or moon, travelling across the sky with the hour — hidden by overcast.
        val arc = if (night) ((if (hour >= 20f) hour - 20f else hour + 4f) / 9f) else ((hour - 5f) / 15f)
        val bx = W * (0.3f + 0.4f * arc.coerceIn(0f, 1f))
        val by = H * (0.3f - 0.14f * sin(PI.toFloat() * arc.coerceIn(0f, 1f)))
        if (overcast) {
            // No sun or moon through heavy cloud.
        } else if (night) {
            paint.color = 0xFFFEF3C7.toInt()
            paint.setShadowLayer(10f * u, 0f, 0f, 0x88FEF3C7.toInt())
            c.drawCircle(bx, by, 11f * u, paint)
            paint.clearShadowLayer()
            // The crescent's bite: sky on a card, cut clean on the wallpaper;
            // on glass it stays a full moon, so the pane is never holed.
            if (backdrop) {
                paint.color = sky.top
                c.drawCircle(bx + 5f * u, by - 3f * u, 9.5f * u, paint)
            } else if (!glass) {
                paint.xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.CLEAR)
                c.drawCircle(bx + 5f * u, by - 3f * u, 9.5f * u, paint)
                paint.xfermode = null
            }
        } else {
            val sun = if (hour >= 17f) 0xFFFDBA74.toInt() else 0xFFFDE047.toInt()
            paint.color = sun
            paint.alpha = 70
            c.drawCircle(bx, by, 20f * u, paint)
            paint.alpha = 255
            c.drawCircle(bx, by, 12f * u, paint)
        }

        // Clouds drifting slowly with the minutes.
        val drift = ((now / 60_000L) % 60L) / 60f
        // Kept clear of the title in the top-left corner.
        cloud(c, paint, sky.cloud, W * (0.4f + 0.45f * drift), H * 0.15f, 1.0f * u)
        cloud(c, paint, sky.cloud, W * (0.4f + 0.45f * ((drift + 0.5f) % 1f)), H * 0.08f, 0.8f * u)
        weatherArt(c, paint, weather, W, H, u, drift)

        // A rainbow over the hill on a day both bears are full.
        if (them.met && me.met) {
            val bands = intArrayOf(
                0xFFEF4444.toInt(), 0xFFF97316.toInt(), 0xFFFACC15.toInt(),
                0xFF22C55E.toInt(), 0xFF3B82F6.toInt(), 0xFF8B5CF6.toInt()
            )
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 3.2f * u
            bands.forEachIndexed { i, color ->
                paint.color = color
                paint.alpha = 150
                val r = W * 0.36f - i * 3.2f * u
                c.drawArc(RectF(W / 2f - r, H * 0.66f - r, W / 2f + r, H * 0.66f + r), 180f, 180f, false, paint)
            }
            paint.alpha = 255
            paint.style = Paint.Style.FILL
        }

        // Seasonal things in the air: petals, leaves, or a special day's art.
        seasonAir(c, paint, season, W, H, u)
        occasionArt(c, paint, occasion, W, H, u)

        // The ground: two soft hills on a card, or a floating island.
        if (!backdrop) island(c, paint, grass, W, H, u)
        if (backdrop) {
        paint.color = grass[0]
        c.drawPath(Path().apply {
            moveTo(0f, H * 0.64f)
            quadTo(W * 0.3f, H * 0.5f, W * 0.62f, H * 0.62f)
            quadTo(W * 0.85f, H * 0.7f, W, H * 0.58f)
            lineTo(W, H); lineTo(0f, H); close()
        }, paint)
        }
        // The meadow: flowers the earlier days of this week left on the back hill.
        meadowArt(c, paint, meadow, W, H, u)

        if (backdrop) {
            paint.color = grass[1]
            c.drawPath(Path().apply {
                moveTo(0f, H * 0.72f)
                quadTo(W * 0.5f, H * 0.62f, W, H * 0.72f)
                lineTo(W, H); lineTo(0f, H); close()
            }, paint)
            if (season == "winter") {
                paint.color = 0xF2FFFFFF.toInt()
                c.drawPath(Path().apply {
                    moveTo(0f, H * 0.72f)
                    quadTo(W * 0.5f, H * 0.62f, W, H * 0.72f)
                    lineTo(W, H * 0.745f)
                    quadTo(W * 0.5f, H * 0.655f, 0f, H * 0.745f)
                    close()
                }, paint)
            }
        }
        seasonGround(c, paint, season, W, H, u)

        // The bears, leaning back to pull; whoever is ahead leans harder.
        val bh = H * 0.44f
        val bw = bh / 1.24f
        val feet = H * 0.71f
        val leftX = W * 0.17f
        val rightX = W * 0.83f
        val themLean = -(5f + 16f * max(0f, share - 0.5f))
        val meLean = 5f + 16f * max(0f, 0.5f - share)
        // Today's visitor: a butterfly in the sky, the others on the grass.
        visitorArt(c, paint, visitor, W, H, u)

        // Each 250 ml plants a flower by its bear, in the colour of that drink.
        garden(c, paint, them, leftX, feet, bw, u)
        garden(c, paint, me, rightX, feet, bw, u)

        bear(c, them, BearArt.THEIRS, leftX, feet, bw, bh, themLean, now, streak, season)
        bear(c, me, BearArt.MINE, rightX, feet, bw, bh, meLean, now, streak, season)

        // The rope, sagging between their paws, with the flag where the pull is.
        val ropeY = feet - bh * 0.42f
        val x0 = leftX + bw * 0.34f
        val x1 = rightX - bw * 0.34f
        val sag = H * 0.05f
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.color = 0xFF92400E.toInt()
        paint.strokeWidth = 3f * u
        val rope = Path().apply { moveTo(x0, ropeY); quadTo((x0 + x1) / 2f, ropeY + sag * 2f, x1, ropeY) }
        c.drawPath(rope, paint)
        paint.color = 0xFFFCD34D.toInt()
        paint.strokeWidth = 1f * u
        paint.pathEffect = android.graphics.DashPathEffect(floatArrayOf(3f * u, 3f * u), 0f)
        c.drawPath(rope, paint)
        paint.pathEffect = null
        paint.style = Paint.Style.FILL

        // The flag sits at their share of the pull — left when they lead.
        val t = (1f - share).coerceIn(0.08f, 0.92f)
        val fx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2f) + t * t * x1
        val fy = (1 - t) * (1 - t) * ropeY + 2 * (1 - t) * t * (ropeY + sag * 2f) + t * t * ropeY
        paint.color = 0xFF7C2D12.toInt()
        paint.strokeWidth = 1.6f * u
        paint.style = Paint.Style.STROKE
        c.drawLine(fx, fy, fx, fy - 14f * u, paint)
        paint.style = Paint.Style.FILL
        paint.color = 0xFFEF4444.toInt()
        c.drawPath(Path().apply {
            moveTo(fx, fy - 14f * u); lineTo(fx + 10f * u, fy - 10.5f * u); lineTo(fx, fy - 7f * u); close()
        }, paint)
        paint.color = 0xFFDC2626.toInt()
        c.drawCircle(fx, fy, 2.6f * u, paint)

        // A clink over the rope when they sipped together just now.
        if (together) cheers(c, paint, (x0 + x1) / 2f, ropeY - H * 0.2f, u)

        // A little rain cloud over their bear, right after they drink.
        if (raining) {
            cloud(c, paint, 0xF2FFFFFF.toInt(), leftX - 10f * u, feet - bh - 12f * u, 0.7f * u)
        }

        // Confetti over any bear at its goal.
        if (them.met || me.met) {
            val rnd = java.util.Random(11L)
            val colors = intArrayOf(0xFFF472B6.toInt(), 0xFFFDE047.toInt(), 0xFF60A5FA.toInt(), 0xFF34D399.toInt(), 0xFFF97316.toInt())
            repeat(26) {
                paint.color = colors[it % colors.size]
                val x = rnd.nextFloat() * W
                val y = rnd.nextFloat() * H * 0.6f
                c.save()
                c.rotate(rnd.nextFloat() * 180f, x, y)
                c.drawRect(x, y, x + 3f * u, y + 1.6f * u, paint)
                c.restore()
            }
        }

        // Hearts around my bear when they have just splashed me.
        if (cheered) {
            val spots = arrayOf(floatArrayOf(-0.62f, 0.2f, 5f), floatArrayOf(0.6f, 0.32f, 4f), floatArrayOf(-0.5f, 0.62f, 3.4f), floatArrayOf(0.66f, 0.7f, 3f))
            for (s in spots) heart(c, paint, rightX + s[0] * bw, feet - bh * (1f - s[1]), s[2] * u)
        }

        // Names and amounts on the grass under each bear.
        label(c, them.label + " · " + them.amount, leftX, feet + 11f * u, u)
        label(c, me.label + " · " + me.amount, rightX, feet + 11f * u, u)

        // Their reaction, in a bubble over my bear.
        if (reaction.isNotBlank()) bubble(c, reaction, rightX - bw * 0.62f, feet - bh - 2f * u, u)
        return bmp
    }

    /**
     * The glance: the two bears side by side on a small island, on the same
     * surface as the scene, with a little flag between them leaning toward
     * whoever has drunk more. Sized to the 2 x 2 widget.
     */
    fun drawGlance(
        density: Float,
        wDp: Int,
        hDp: Int,
        hour: Float,
        now: Long,
        them: Bear,
        me: Bear,
        share: Float,
        streak: Int,
        surface: String,
        season: String
    ): Bitmap {
        val scale = min(density, 1.5f)
        val w = (wDp * scale).roundToInt().coerceIn(160, 480)
        val h = (hDp * scale).roundToInt().coerceIn(160, 480)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val W = w.toFloat()
        val H = h.toFloat()
        val u = scale
        val sky = skyFor(hour)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        when (surface) {
            "glass" -> glassPane(c, paint, sky, W, H, u)
            "sky" -> {
                val radius = 22f * u
                c.clipPath(Path().apply { addRoundRect(RectF(0f, 0f, W, H), radius, radius, Path.Direction.CW) })
                paint.shader = LinearGradient(0f, 0f, 0f, H, sky.top, sky.bottom, Shader.TileMode.CLAMP)
                c.drawRect(0f, 0f, W, H, paint)
                paint.shader = null
            }
        }
        // Sun or moon between the bears' heads, crossing with the hour, and a
        // cloud drifting with the minutes — the small square still keeps time.
        val night = isNight(hour)
        val arc = (if (night) ((if (hour >= 20f) hour - 20f else hour + 4f) / 9f) else ((hour - 5f) / 15f)).coerceIn(0f, 1f)
        val sx = W * (0.34f + 0.32f * arc)
        val sy = H * (0.3f - 0.07f * sin(PI.toFloat() * arc))
        if (night) {
            paint.color = 0xFFFEF3C7.toInt()
            paint.setShadowLayer(8f * u, 0f, 0f, 0x88FEF3C7.toInt())
            c.drawCircle(sx, sy, 7f * u, paint)
            paint.clearShadowLayer()
        } else {
            paint.color = if (hour >= 17f) 0xFFFDBA74.toInt() else 0xFFFDE047.toInt()
            paint.alpha = 70
            c.drawCircle(sx, sy, 13f * u, paint)
            paint.alpha = 255
            c.drawCircle(sx, sy, 8f * u, paint)
        }
        val drift = ((now / 60_000L) % 60L) / 60f
        cloud(c, paint, sky.cloud, W * (0.25f + 0.5f * drift), H * 0.36f, 0.6f * u)
        if (them.met && me.met) {
            // Both full: a small rainbow over the hill.
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 3f * u
            val bands = intArrayOf(0xCCEF4444.toInt(), 0xCCF59E0B.toInt(), 0xCC22C55E.toInt(), 0xCC3B82F6.toInt())
            for ((k, col) in bands.withIndex()) {
                paint.color = col
                val r = W * 0.36f - k * 3f * u
                c.drawArc(RectF(W / 2f - r, H * 0.62f - r, W / 2f + r, H * 0.62f + r), 180f, 180f, false, paint)
            }
            paint.style = Paint.Style.FILL
        }
        island(c, paint, seasonGrass(season, night), W, H, u)

        val bh = H * 0.42f
        val bw = bh / 1.24f
        val feet = H * 0.71f
        bear(c, them, BearArt.THEIRS, W * 0.3f, feet, bw, bh, -(3f + 10f * max(0f, share - 0.5f)), now, streak, season)
        bear(c, me, BearArt.MINE, W * 0.7f, feet, bw, bh, 3f + 10f * max(0f, 0.5f - share), now, streak, season)

        // The flag between them, leaning toward whoever is ahead.
        val fx = W * (0.5f - (share - 0.5f) * 0.3f)
        val fy = feet - bh * 0.18f
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.6f * u
        paint.color = 0xFF7C2D12.toInt()
        c.drawLine(fx, fy, fx, fy - 16f * u, paint)
        paint.style = Paint.Style.FILL
        paint.color = 0xFFEF4444.toInt()
        val dir = if (share > 0.5f) -1f else 1f
        c.drawPath(Path().apply {
            moveTo(fx, fy - 16f * u); lineTo(fx + dir * 10f * u, fy - 12.5f * u); lineTo(fx, fy - 9f * u); close()
        }, paint)
        return bmp
    }

    private fun bear(c: Canvas, b: Bear, theme: BearArt.Theme, cx: Float, feet: Float, bw: Float, bh: Float, lean: Float, now: Long, streak: Int, season: String) {
        c.save()
        c.rotate(lean, cx, feet)
        c.translate(cx - bw / 2f, feet - bh)
        c.scale(bw / 100f, bw / 100f)
        if (streak >= 30) wings(c)
        BearArt.drawInto(c, b.pct, b.layers, b.met, theme, now)
        if (season == "winter") scarf(c)
        outfit(c, streak)
        c.restore()
    }

    /** A cosy red scarf for the winter, in the bear's own box. */
    private fun scarf(c: Canvas) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = 0xFFDC2626.toInt()
        c.drawRoundRect(RectF(28f, 62f, 72f, 70f), 4f, 4f, p)
        c.drawRoundRect(RectF(56f, 66f, 64f, 86f), 3f, 3f, p)
        p.color = 0xFFFCA5A5.toInt()
        for (k in 0 until 4) c.drawRect(32f + k * 10f, 62f, 35f + k * 10f, 70f, p)
    }

    /** Grass colours for the season, back then front; night dims them. */
    private fun seasonGrass(season: String, night: Boolean): IntArray {
        val g = when (season) {
            "spring" -> intArrayOf(0xFFBBF7D0.toInt(), 0xFF4ADE80.toInt())
            "autumn" -> intArrayOf(0xFFD9DB82.toInt(), 0xFF9CA84A.toInt())
            "winter" -> intArrayOf(0xFFE2E8F0.toInt(), 0xFFA7C4A0.toInt())
            else -> intArrayOf(0xFF86EFAC.toInt(), 0xFF22C55E.toInt())
        }
        return if (night) intArrayOf(mixColor(g[0], 0xFF0F172A.toInt(), 0.45f), mixColor(g[1], 0xFF0F172A.toInt(), 0.45f)) else g
    }

    /**
     * The floating island the bears stand on when there is no sky card: a
     * grassy top in the season's colours over an earthy underside with a few
     * hanging roots, and snow on it in winter.
     */
    private fun island(c: Canvas, paint: Paint, grass: IntArray, W: Float, H: Float, u: Float) {
        val l = W * 0.06f
        val r = W * 0.94f
        val top = H * 0.7f
        // A soft shadow beneath, so it floats rather than sits.
        paint.shader = android.graphics.RadialGradient(W / 2f, H * 0.985f, W * 0.3f, 0x40000000, 0x00000000, Shader.TileMode.CLAMP)
        c.drawOval(RectF(W * 0.2f, H * 0.955f, W * 0.8f, H * 1.01f), paint)
        paint.shader = null
        // Rocky underside tapering to a point, with a lighter band of topsoil.
        val earth = Path().apply {
            moveTo(l, top)
            quadTo(W * 0.1f, H * 0.8f, W * 0.24f, H * 0.83f)
            quadTo(W * 0.3f, H * 0.9f, W * 0.4f, H * 0.9f)
            quadTo(W * 0.46f, H * 0.97f, W * 0.52f, H * 0.95f)
            quadTo(W * 0.6f, H * 0.9f, W * 0.68f, H * 0.88f)
            quadTo(W * 0.8f, H * 0.84f, W * 0.86f, H * 0.79f)
            quadTo(W * 0.92f, H * 0.76f, r, top)
            close()
        }
        paint.shader = LinearGradient(0f, top, 0f, H * 0.97f, 0xFF92400E.toInt(), 0xFF3F1D0B.toInt(), Shader.TileMode.CLAMP)
        c.drawPath(earth, paint)
        paint.shader = null
        c.save()
        c.clipPath(earth)
        paint.color = 0xFFB45309.toInt()
        c.drawOval(RectF(l, top - H * 0.02f, r, top + H * 0.07f), paint)
        paint.color = 0x2E000000
        c.drawOval(RectF(W * 0.16f, H * 0.8f, W * 0.84f, H * 0.845f), paint)
        c.drawOval(RectF(W * 0.28f, H * 0.87f, W * 0.72f, H * 0.9f), paint)
        c.restore()
        // A couple of hanging roots and vines.
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeWidth = 1.1f * u
        paint.color = 0xFF6B3F1D.toInt()
        c.drawPath(Path().apply { moveTo(W * 0.33f, H * 0.89f); quadTo(W * 0.32f, H * 0.95f, W * 0.34f, H * 0.985f) }, paint)
        paint.color = 0xFF4D7C0F.toInt()
        c.drawPath(Path().apply { moveTo(W * 0.72f, H * 0.87f); quadTo(W * 0.74f, H * 0.93f, W * 0.72f, H * 0.96f) }, paint)
        c.drawPath(Path().apply { moveTo(W * 0.16f, H * 0.79f); quadTo(W * 0.15f, H * 0.84f, W * 0.17f, H * 0.87f) }, paint)
        paint.style = Paint.Style.FILL
        // The grassy top: a lighter far rim, the near surface, and tufts along the front edge.
        paint.color = grass[0]
        c.drawOval(RectF(l, H * 0.615f, r, H * 0.745f), paint)
        paint.color = grass[1]
        c.drawOval(RectF(l, H * 0.635f, r, H * 0.765f), paint)
        paint.color = grass[1]
        var x = l + 6f * u
        while (x < r - 6f * u) {
            val t = (x - W / 2f) / ((r - l) / 2f)
            val y = H * 0.7f + H * 0.065f * kotlin.math.sqrt(max(0f, 1f - t * t))
            c.drawPath(Path().apply { moveTo(x - 2.2f * u, y); lineTo(x, y + 3.2f * u); lineTo(x + 2.2f * u, y); close() }, paint)
            x += 5f * u
        }
    }

    /** Petals in spring, leaves in autumn, flakes in winter, drifting in the air. */
    private fun seasonAir(c: Canvas, paint: Paint, season: String, W: Float, H: Float, u: Float) {
        val rnd = java.util.Random(31L)
        when (season) {
            "spring" -> repeat(12) {
                paint.color = if (it % 2 == 0) 0xFFF9A8D4.toInt() else 0xFFFBCFE8.toInt()
                val x = rnd.nextFloat() * W
                val y = rnd.nextFloat() * H * 0.55f
                c.save(); c.rotate(rnd.nextFloat() * 180f, x, y)
                c.drawOval(RectF(x - 2.4f * u, y - 1.3f * u, x + 2.4f * u, y + 1.3f * u), paint)
                c.restore()
            }
            "autumn" -> repeat(12) {
                paint.color = intArrayOf(0xFFF97316.toInt(), 0xFFDC2626.toInt(), 0xFFF59E0B.toInt())[it % 3]
                val x = rnd.nextFloat() * W
                val y = rnd.nextFloat() * H * 0.55f
                c.save(); c.rotate(rnd.nextFloat() * 360f, x, y)
                c.drawPath(Path().apply {
                    moveTo(x, y - 3f * u); quadTo(x + 3f * u, y, x, y + 3f * u); quadTo(x - 3f * u, y, x, y - 3f * u); close()
                }, paint)
                c.restore()
            }
            "winter" -> {
                paint.color = Color.WHITE
                repeat(18) { c.drawCircle(rnd.nextFloat() * W, rnd.nextFloat() * H * 0.55f, (0.8f + rnd.nextFloat() * 0.8f) * u, paint) }
            }
        }
    }

    /** Blossoms in spring grass, sunflowers in summer, fallen leaves in autumn. */
    private fun seasonGround(c: Canvas, paint: Paint, season: String, W: Float, H: Float, u: Float) {
        when (season) {
            "autumn" -> {
                val rnd = java.util.Random(47L)
                repeat(16) {
                    paint.color = intArrayOf(0xFFEA580C.toInt(), 0xFFDC2626.toInt(), 0xFFF59E0B.toInt())[it % 3]
                    val lx = W * (0.1f + rnd.nextFloat() * 0.8f)
                    val ly = H * (0.655f + rnd.nextFloat() * 0.08f)
                    c.save(); c.rotate(rnd.nextFloat() * 360f, lx, ly)
                    c.drawOval(RectF(lx - 2f * u, ly - 1f * u, lx + 2f * u, ly + 1f * u), paint)
                    c.restore()
                }
            }
            "spring" -> {
                val rnd = java.util.Random(41L)
                repeat(14) {
                    paint.color = if (it % 3 == 0) Color.WHITE else 0xFFF9A8D4.toInt()
                    c.drawCircle(W * (0.08f + rnd.nextFloat() * 0.84f), H * (0.66f + rnd.nextFloat() * 0.07f), 1.1f * u, paint)
                }
            }
            "summer" -> for (x in floatArrayOf(W * 0.04f, W * 0.95f)) {
                val y = H * 0.66f
                paint.color = 0xFF15803D.toInt()
                c.drawRect(x - 0.6f * u, y - 12f * u, x + 0.6f * u, y + 2f * u, paint)
                paint.color = 0xFFFACC15.toInt()
                for (k in 0 until 8) {
                    val a = k * 45f * (PI.toFloat() / 180f)
                    c.drawCircle(x + cos(a) * 3.4f * u, y - 13f * u + sin(a) * 3.4f * u, 1.9f * u, paint)
                }
                paint.color = 0xFF78350F.toInt()
                c.drawCircle(x, y - 13f * u, 2.2f * u, paint)
            }
        }
    }

    /** New Year's fireworks, Valentine's hearts, or our bond's hearts. */
    private fun occasionArt(c: Canvas, paint: Paint, occasion: String, W: Float, H: Float, u: Float) {
        when (occasion) {
            "newyear" -> {
                val bursts = arrayOf(floatArrayOf(0.3f, 0.2f), floatArrayOf(0.62f, 0.12f), floatArrayOf(0.82f, 0.3f))
                val colors = intArrayOf(0xFFF472B6.toInt(), 0xFFFDE047.toInt(), 0xFF60A5FA.toInt())
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 1.3f * u
                paint.strokeCap = Paint.Cap.ROUND
                bursts.forEachIndexed { i, b ->
                    paint.color = colors[i]
                    for (k in 0 until 10) {
                        val a = k * 36f * (PI.toFloat() / 180f)
                        val x = W * b[0]
                        val y = H * b[1]
                        c.drawLine(x + cos(a) * 3f * u, y + sin(a) * 3f * u, x + cos(a) * 9f * u, y + sin(a) * 9f * u, paint)
                    }
                }
                paint.style = Paint.Style.FILL
            }
            "valentine", "bond" -> {
                val rnd = java.util.Random(53L)
                repeat(9) {
                    heart(c, paint, W * (0.15f + rnd.nextFloat() * 0.7f), H * (0.08f + rnd.nextFloat() * 0.35f), (2.2f + rnd.nextFloat() * 2f) * u)
                }
            }
        }
    }

    /**
     * What a streak earns: sunglasses from three days, a crown from seven.
     * Drawn in the bear's own 100 x 124 box, so it leans with the bear.
     */
    private fun outfit(c: Canvas, streak: Int) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        if (streak >= 3) {
            p.color = 0xF0111827.toInt()
            c.drawRoundRect(RectF(32f, 36f, 47f, 47f), 4f, 4f, p)
            c.drawRoundRect(RectF(53f, 36f, 68f, 47f), 4f, 4f, p)
            p.style = Paint.Style.STROKE
            p.strokeWidth = 2.2f
            c.drawLine(47f, 40f, 53f, 40f, p)
            p.style = Paint.Style.FILL
            p.color = 0x99FFFFFF.toInt()
            c.drawRoundRect(RectF(34f, 38f, 39f, 41f), 1.5f, 1.5f, p)
            c.drawRoundRect(RectF(55f, 38f, 60f, 41f), 1.5f, 1.5f, p)
        }
        if (streak >= 14) {
            // Party hat: a striped cone with a pom-pom, tipped at a jaunty angle.
            c.save()
            c.rotate(12f, 52f, 12f)
            val cone = Path().apply { moveTo(41f, 14f); lineTo(63f, 14f); lineTo(52f, -10f); close() }
            p.color = 0xFF8B5CF6.toInt()
            c.drawPath(cone, p)
            c.save()
            c.clipPath(cone)
            p.color = 0xFFFDE047.toInt()
            for (k in 0 until 4) c.drawRect(38f, -10f + k * 7f, 66f, -7f + k * 7f, p)
            c.restore()
            p.color = 0xFFF472B6.toInt()
            c.drawCircle(52f, -10f, 3.4f, p)
            c.restore()
        } else if (streak >= 7) {
            p.color = 0xFFFACC15.toInt()
            c.drawPath(Path().apply {
                moveTo(36f, 13f); lineTo(38f, 1f); lineTo(44f, 8f); lineTo(50f, -2f)
                lineTo(56f, 8f); lineTo(62f, 1f); lineTo(64f, 13f); close()
            }, p)
            p.color = 0xFFEF4444.toInt()
            c.drawCircle(50f, 8f, 2.2f, p)
        }
    }

    /** Little white wings behind the bear, for a thirty-day streak. */
    private fun wings(c: Canvas) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = 0xF2FFFFFF.toInt()
        for (side in intArrayOf(-1, 1)) {
            val x = 50f + side * 36f
            c.drawPath(Path().apply {
                moveTo(50f + side * 26f, 70f)
                quadTo(x + side * 22f, 52f, x + side * 12f, 86f)
                quadTo(x, 96f, 50f + side * 30f, 90f)
                close()
            }, p)
        }
        p.style = Paint.Style.STROKE
        p.strokeWidth = 1.5f
        p.color = 0x66A5B4FC
        for (side in intArrayOf(-1, 1)) {
            val x = 50f + side * 36f
            c.drawPath(Path().apply { moveTo(50f + side * 30f, 76f); quadTo(x + side * 12f, 70f, x + side * 10f, 84f) }, p)
        }
    }

    /**
     * Flowers by a bear, one per 250 ml, up to six — three each side, the
     * nearest first — each in the colour of the drink at its place in the
     * bear, so a juice afternoon grows orange flowers.
     */
    private fun garden(c: Canvas, paint: Paint, b: Bear, cx: Float, feet: Float, bw: Float, u: Float) {
        val n = min(6L, b.ml / 250L).toInt()
        if (n <= 0) return
        for (i in 0 until n) {
            val side = if (i % 2 == 0) -1f else 1f
            val step = i / 2
            val x = cx + side * (bw * 0.52f + step * 7.5f * u)
            val ground = feet + 1.5f * u
            val stem = (8f + (i % 3) * 1.5f) * u
            val color = colorAt(b, (i + 0.5f) / n)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1.2f * u
            paint.color = 0xFF15803D.toInt()
            c.drawLine(x, ground, x, ground - stem, paint)
            paint.style = Paint.Style.FILL
            c.drawOval(RectF(x, ground - stem * 0.55f, x + 3.2f * u, ground - stem * 0.35f), paint)
            paint.color = color
            val top = ground - stem
            for (k in 0 until 5) {
                val a = k * 72f * (PI.toFloat() / 180f)
                c.drawCircle(x + cos(a) * 2.2f * u, top + sin(a) * 2.2f * u, 1.7f * u, paint)
            }
            paint.color = 0xFFFDE68A.toInt()
            c.drawCircle(x, top, 1.3f * u, paint)
        }
    }

    /** The drink colour at a fraction of a bear's fill, bottom to top. */
    private fun colorAt(b: Bear, f: Float): Int {
        if (b.layers.isEmpty()) return 0xFF38BDF8.toInt()
        val at = f * b.pct
        for ((color, top) in b.layers) if (at <= top) return color
        return b.layers.last().first
    }

    /** Today's visitor: 0 butterfly, 1 ladybug, 2 mushroom, 3 snail. */
    private fun visitorArt(c: Canvas, paint: Paint, kind: Int, W: Float, H: Float, u: Float) {
        when (kind) {
            0 -> {
                val x = W * 0.63f
                val y = H * 0.38f
                paint.color = 0xFFF472B6.toInt()
                c.drawOval(RectF(x - 7f * u, y - 5f * u, x - 0.5f * u, y + 1f * u), paint)
                c.drawOval(RectF(x + 0.5f * u, y - 5f * u, x + 7f * u, y + 1f * u), paint)
                paint.color = 0xFFFB923C.toInt()
                c.drawOval(RectF(x - 5f * u, y, x - 0.5f * u, y + 4f * u), paint)
                c.drawOval(RectF(x + 0.5f * u, y, x + 5f * u, y + 4f * u), paint)
                paint.color = 0xFF3F3F46.toInt()
                c.drawRoundRect(RectF(x - 0.7f * u, y - 4f * u, x + 0.7f * u, y + 4f * u), u, u, paint)
            }
            1 -> {
                val x = W * 0.5f
                val y = H * 0.73f
                paint.color = 0xFFEF4444.toInt()
                c.drawArc(RectF(x - 5f * u, y - 5f * u, x + 5f * u, y + 5f * u), 180f, 180f, true, paint)
                paint.color = 0xFF111827.toInt()
                c.drawCircle(x - 5.5f * u, y - 1.2f * u, 2f * u, paint)
                c.drawCircle(x - 1.8f * u, y - 2.6f * u, 0.9f * u, paint)
                c.drawCircle(x + 2f * u, y - 3f * u, 0.9f * u, paint)
                c.drawCircle(x + 1f * u, y - 0.9f * u, 0.8f * u, paint)
            }
            2 -> {
                val x = W * 0.5f
                val y = H * 0.74f
                paint.color = 0xFFFEF3C7.toInt()
                c.drawRoundRect(RectF(x - 2f * u, y - 6f * u, x + 2f * u, y), u, u, paint)
                paint.color = 0xFFDC2626.toInt()
                c.drawArc(RectF(x - 7f * u, y - 12f * u, x + 7f * u, y - 2f * u), 180f, 180f, true, paint)
                paint.color = Color.WHITE
                c.drawCircle(x - 3f * u, y - 8.5f * u, 1.1f * u, paint)
                c.drawCircle(x + 2.5f * u, y - 9.5f * u, 1f * u, paint)
            }
            else -> {
                val x = W * 0.5f
                val y = H * 0.74f
                paint.color = 0xFFFDE68A.toInt()
                c.drawRoundRect(RectF(x - 7f * u, y - 2.5f * u, x + 5f * u, y), 1.5f * u, 1.5f * u, paint)
                c.drawCircle(x + 5f * u, y - 3.5f * u, 1.8f * u, paint)
                paint.color = 0xFFB45309.toInt()
                c.drawCircle(x - 2f * u, y - 5f * u, 4.2f * u, paint)
                paint.color = 0xFFF59E0B.toInt()
                c.drawCircle(x - 2f * u, y - 5f * u, 2.2f * u, paint)
            }
        }
    }

    private fun cloud(c: Canvas, paint: Paint, color: Int, x: Float, y: Float, s: Float) {
        paint.color = color
        c.drawCircle(x, y, 9f * s, paint)
        c.drawCircle(x + 10f * s, y - 5f * s, 11f * s, paint)
        c.drawCircle(x + 22f * s, y, 9f * s, paint)
        c.drawRoundRect(RectF(x - 6f * s, y - 2f * s, x + 28f * s, y + 8f * s), 6f * s, 6f * s, paint)
    }

    /** Two glasses tipped together, with a burst where they meet. */
    private fun cheers(c: Canvas, paint: Paint, cx: Float, cy: Float, u: Float) {
        for (side in intArrayOf(-1, 1)) {
            c.save()
            c.rotate(side * 16f, cx + side * 7f * u, cy + 12f * u)
            val l = cx + side * 7f * u - 5f * u
            val glass = Path().apply {
                moveTo(l, cy); lineTo(l + 10f * u, cy); lineTo(l + 8.5f * u, cy + 13f * u); lineTo(l + 1.5f * u, cy + 13f * u); close()
            }
            paint.color = 0xCCFFFFFF.toInt()
            c.drawPath(glass, paint)
            c.save()
            c.clipPath(glass)
            paint.color = 0xFF38BDF8.toInt()
            c.drawRect(l, cy + 5f * u, l + 10f * u, cy + 14f * u, paint)
            c.restore()
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1f * u
            paint.color = 0xFF0369A1.toInt()
            c.drawPath(glass, paint)
            paint.style = Paint.Style.FILL
            c.restore()
        }
        paint.color = 0xFFFDE047.toInt()
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.4f * u
        paint.strokeCap = Paint.Cap.ROUND
        for (k in 0 until 5) {
            val a = (-150f + k * 30f) * (PI.toFloat() / 180f)
            c.drawLine(cx + cos(a) * 4f * u, cy - 3f * u + sin(a) * 4f * u, cx + cos(a) * 8f * u, cy - 3f * u + sin(a) * 8f * u, paint)
        }
        paint.style = Paint.Style.FILL
    }

    /**
     * Liquid glass: a see-through pane tinted faintly to the hour's sky,
     * brighter at the top, with a sheen across its upper part, a couple of
     * caustic lights, a soft glow at the bottom and a light-catching rim —
     * then everything after is clipped to it. No blur: a widget cannot blur
     * the wallpaper behind it, so the glass is made of light instead.
     */
    private fun glassPane(c: Canvas, paint: Paint, sky: Sky, W: Float, H: Float, u: Float) {
        val radius = 24f * u
        val rect = RectF(0.75f * u, 0.75f * u, W - 0.75f * u, H - 0.75f * u)
        val pane = Path().apply { addRoundRect(rect, radius, radius, Path.Direction.CW) }

        /* The body: smoky frost first — it quiets a busy wallpaper and gives
           white text its contrast — then a whisper of the sky's colour, then
           light, top to bottom. */
        paint.color = 0x61141B2D
        c.drawPath(pane, paint)
        paint.color = Color.argb(56, Color.red(sky.bottom), Color.green(sky.bottom), Color.blue(sky.bottom))
        c.drawPath(pane, paint)
        paint.shader = LinearGradient(
            0f, 0f, 0f, H,
            intArrayOf(0x47FFFFFF, 0x12FFFFFF, 0x21FFFFFF),
            floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP
        )
        c.drawPath(pane, paint)
        paint.shader = null

        c.save()
        c.clipPath(pane)
        // A sheen curving across the top, as light lies on a lens.
        paint.shader = LinearGradient(0f, 0f, W * 0.2f, H * 0.5f, 0x61FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP)
        c.drawOval(RectF(-W * 0.15f, -H * 0.55f, W * 1.1f, H * 0.42f), paint)
        // Caustics: soft pools of light the glass throws.
        paint.shader = android.graphics.RadialGradient(W * 0.12f, H * 0.34f, 34f * u, 0x33FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP)
        c.drawCircle(W * 0.12f, H * 0.34f, 34f * u, paint)
        paint.shader = android.graphics.RadialGradient(W * 0.88f, H * 0.82f, 26f * u, 0x2EFFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP)
        c.drawCircle(W * 0.88f, H * 0.82f, 26f * u, paint)
        // A soft glow pooling at the bottom edge.
        paint.shader = LinearGradient(0f, H * 0.72f, 0f, H, 0x00FFFFFF, 0x24FFFFFF, Shader.TileMode.CLAMP)
        c.drawRect(0f, H * 0.72f, W, H, paint)
        paint.shader = null
        c.restore()

        // The rim: bright where the light comes from, fading round the edge.
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.4f * u
        paint.shader = LinearGradient(
            0f, 0f, W, H,
            intArrayOf(0xF2FFFFFF.toInt(), 0x55FFFFFF, 0x2EFFFFFF, 0xB3FFFFFF.toInt()),
            floatArrayOf(0f, 0.35f, 0.7f, 1f),
            Shader.TileMode.CLAMP
        )
        c.drawRoundRect(rect, radius, radius, paint)
        paint.shader = null
        paint.strokeWidth = 0.8f * u
        paint.color = 0x24FFFFFF
        val inner = RectF(rect.left + 2.2f * u, rect.top + 2.2f * u, rect.right - 2.2f * u, rect.bottom - 2.2f * u)
        c.drawRoundRect(inner, radius - 2f * u, radius - 2f * u, paint)
        paint.style = Paint.Style.FILL

        // Everything after lives inside the glass.
        c.clipPath(pane)
    }

    private fun mixColor(a: Int, b: Int, t: Float): Int = Color.argb(
        Color.alpha(a),
        (Color.red(a) + (Color.red(b) - Color.red(a)) * t).roundToInt(),
        (Color.green(a) + (Color.green(b) - Color.green(a)) * t).roundToInt(),
        (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t).roundToInt()
    )

    /** The hour's sky, greyed or darkened for the weather. */
    private fun weathered(s: Sky, weather: String): Sky {
        val (tone, t) = when (weather) {
            "cloudy" -> 0xFF94A3B8.toInt() to 0.3f
            "fog" -> 0xFFE2E8F0.toInt() to 0.45f
            "rain" -> 0xFF64748B.toInt() to 0.45f
            "storm" -> 0xFF334155.toInt() to 0.6f
            "snow" -> 0xFFCBD5E1.toInt() to 0.4f
            else -> return s
        }
        return Sky(mixColor(s.top, tone, t), mixColor(s.bottom, tone, t), s.hillBack, s.hillFront, 0xF2E2E8F0.toInt())
    }

    /** Extra cloud, fog, a lightning bolt, or settled snow, by the weather. */
    private fun weatherArt(c: Canvas, paint: Paint, weather: String, W: Float, H: Float, u: Float, drift: Float) {
        when (weather) {
            "cloudy", "rain", "storm" -> {
                val grey = if (weather == "cloudy") 0xE6F1F5F9.toInt() else 0xE6CBD5E1.toInt()
                cloud(c, paint, grey, W * (0.15f + 0.3f * drift), H * 0.1f, 1.2f * u)
                cloud(c, paint, grey, W * 0.7f, H * 0.18f, 1.1f * u)
                cloud(c, paint, grey, W * 0.45f, H * 0.04f, 0.9f * u)
                if (weather == "storm") {
                    paint.color = 0xFFFDE047.toInt()
                    c.drawPath(Path().apply {
                        val x = W * 0.72f
                        val y = H * 0.24f
                        moveTo(x, y); lineTo(x - 5f * u, y + 11f * u); lineTo(x - 1f * u, y + 11f * u)
                        lineTo(x - 4f * u, y + 21f * u); lineTo(x + 5f * u, y + 7f * u); lineTo(x + 1f * u, y + 7f * u); close()
                    }, paint)
                }
            }
            "fog" -> {
                paint.shader = LinearGradient(0f, H * 0.35f, 0f, H * 0.8f, 0x00FFFFFF, 0xB3FFFFFF.toInt(), Shader.TileMode.CLAMP)
                c.drawRect(0f, H * 0.35f, W, H * 0.8f, paint)
                paint.shader = null
            }
            "snow" -> {
                val rnd = java.util.Random(23L)
                paint.color = Color.WHITE
                repeat(30) { c.drawCircle(rnd.nextFloat() * W, rnd.nextFloat() * H * 0.6f, (0.8f + rnd.nextFloat()) * u, paint) }
            }
        }
    }

    /**
     * The week's meadow on the back hill: one small cluster per earlier day,
     * Monday at the left, a flower for every 250 ml either of us drank.
     */
    private fun meadowArt(c: Canvas, paint: Paint, meadow: IntArray, W: Float, H: Float, u: Float) {
        val colors = intArrayOf(0xFFF9A8D4.toInt(), 0xFFFDE68A.toInt(), 0xFFC4B5FD.toInt(), 0xFF93C5FD.toInt(), 0xFFFDBA74.toInt())
        for (day in 0 until 7) {
            val n = meadow[day]
            if (n <= 0) continue
            val cx = W * (0.08f + day * 0.14f)
            for (k in 0 until n) {
                val x = cx + ((k * 37) % 11 - 5) * 1.6f * u
                val y = H * 0.64f + ((k * 53) % 7) * 0.9f * u
                paint.color = 0xFF16A34A.toInt()
                c.drawRect(x - 0.35f * u, y, x + 0.35f * u, y + 3.5f * u, paint)
                paint.color = colors[(day + k) % colors.size]
                c.drawCircle(x, y, 1.5f * u, paint)
            }
        }
    }

    /** A speech bubble holding an emoji, pointing down at the bear. */
    private fun bubble(c: Canvas, emoji: String, x: Float, y: Float, u: Float) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = Color.WHITE
        p.setShadowLayer(3f * u, 0f, 1f * u, 0x55000000)
        val r = RectF(x - 14f * u, y - 22f * u, x + 14f * u, y)
        c.drawRoundRect(r, 10f * u, 10f * u, p)
        c.drawPath(Path().apply { moveTo(x + 4f * u, y - 1f * u); lineTo(x + 10f * u, y + 6f * u); lineTo(x + 11f * u, y - 3f * u); close() }, p)
        p.clearShadowLayer()
        p.textSize = 14f * u
        p.textAlign = Paint.Align.CENTER
        c.drawText(emoji, x, y - 6f * u, p)
    }

    private fun heart(c: Canvas, paint: Paint, x: Float, y: Float, r: Float) {
        paint.color = 0xFFF43F5E.toInt()
        c.drawCircle(x - r * 0.5f, y, r * 0.6f, paint)
        c.drawCircle(x + r * 0.5f, y, r * 0.6f, paint)
        c.drawPath(Path().apply {
            moveTo(x - r * 1.05f, y + r * 0.15f); lineTo(x, y + r * 1.25f); lineTo(x + r * 1.05f, y + r * 0.15f); close()
        }, paint)
    }

    private fun label(c: Canvas, text: String, cx: Float, y: Float, u: Float) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = Color.WHITE
        p.textSize = 10.5f * u
        p.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        p.textAlign = Paint.Align.CENTER
        p.setShadowLayer(3f * u, 0f, 1f * u, 0x99000000.toInt())
        c.drawText(text, cx, y, p)
    }
}

/**
 * The card's colours for a theme. "auto" reads the layout's own day/night
 * resources, which is what follows the system.
 */
object Palette {
    class Look(
        val bg: Int,
        val chip: Int,
        val text: Int,
        val secondary: Int,
        val water: Int,
        val steps: Int,
        val reps: Int
    )

    private val GLASS = Look(
        R.drawable.pt_bg_glass, R.drawable.pt_chip_glass,
        0xFFFFFFFF.toInt(), 0xC7FFFFFF.toInt(),
        0xFFBAE6FD.toInt(), 0xFFBBF7D0.toInt(), 0xFFFBCFE8.toInt()
    )
    private val SUNSET = Look(
        R.drawable.pt_bg_sunset, R.drawable.pt_chip_ocean,
        0xFFFFFFFF.toInt(), 0xFFF5D0FE.toInt(),
        0xFF7DD3FC.toInt(), 0xFF86EFAC.toInt(), 0xFFFDA4AF.toInt()
    )
    private val LIGHT = Look(
        R.drawable.pt_bg_light, R.drawable.pt_chip_light,
        0xFF000000.toInt(), 0xFF8A8A8E.toInt(),
        0xFF0A7CC4.toInt(), 0xFF248A3D.toInt(), 0xFFE0184A.toInt()
    )
    private val DARK = Look(
        R.drawable.pt_bg_dark, R.drawable.pt_chip_dark,
        0xFFFFFFFF.toInt(), 0xFF98989F.toInt(),
        0xFF64D2FF.toInt(), 0xFF30D158.toInt(), 0xFFFF375F.toInt()
    )
    private val OCEAN = Look(
        R.drawable.pt_bg_ocean, R.drawable.pt_chip_ocean,
        0xFFFFFFFF.toInt(), 0xFFC7D2FE.toInt(),
        0xFF7DD3FC.toInt(), 0xFF86EFAC.toInt(), 0xFFFDA4AF.toInt()
    )

    fun resolve(context: Context, theme: String): Look = when (theme) {
        "sunset" -> SUNSET
        "glass" -> GLASS
        "light" -> LIGHT
        "dark" -> DARK
        "ocean" -> OCEAN
        else -> Look(
            R.drawable.pt_bg, R.drawable.pt_chip,
            context.getColor(R.color.pt_text), context.getColor(R.color.pt_secondary),
            context.getColor(R.color.pt_water), context.getColor(R.color.pt_steps),
            context.getColor(R.color.pt_reps)
        )
    }

    fun apply(views: RemoteViews, look: Look, duo: Boolean) {
        views.setInt(R.id.pt_root, "setBackgroundResource", look.bg)
        views.setTextColor(R.id.pt_title, look.text)
        if (duo) {
            views.setTextColor(R.id.pt_footer, look.text)
            views.setTextColor(R.id.d_them_name, look.secondary)
            views.setTextColor(R.id.d_me_name, look.secondary)
            views.setTextColor(R.id.d_them_amt, look.text)
            views.setTextColor(R.id.d_me_amt, look.text)
            return
        }
        views.setTextColor(R.id.pt_footer, look.secondary)
        views.setTextColor(R.id.pt_water_value, look.water)
        views.setTextColor(R.id.pt_steps_value, look.steps)
        views.setTextColor(R.id.pt_reps_value, look.reps)
        for (id in intArrayOf(R.id.pt_water_goal, R.id.pt_steps_goal, R.id.pt_reps_goal)) {
            views.setTextColor(id, look.secondary)
        }
        for (id in intArrayOf(R.id.pt_water_you, R.id.pt_steps_you, R.id.pt_reps_you)) {
            views.setTextColor(id, look.secondary)
            views.setInt(id, "setBackgroundResource", look.chip)
        }
    }
}

/**
 * The bear — the same shapes as BearJar.tsx — drawn into a 100 x 124 box, in
 * its owner's colours and with a mood: asleep while empty, happy while it
 * fills, overjoyed at the goal.
 */
object BearArt {
    class Theme(val body: Int, val rim: Int, val tint: Int)

    /** Theirs is lavender, mine is pink — the same pair as on Home. */
    val THEIRS = Theme(Color.parseColor("#E6E8FF"), Color.parseColor("#A5B4FC"), Color.parseColor("#8B5CF6"))
    val MINE = Theme(Color.parseColor("#FFE4EC"), Color.parseColor("#F9A8C9"), Color.parseColor("#FB7185"))

    private const val TOP = 7f + 2f
    private const val BOTTOM = 119f + 2f
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
        listOf(
            Path().apply { addCircle(25f, 22f, 13f, Path.Direction.CW) },
            Path().apply { addCircle(75f, 22f, 13f, Path.Direction.CW) },
            Path().apply { addCircle(50f, 42f, 30f, Path.Direction.CW) },
            Path().apply { addOval(RectF(12f, 55f, 88f, 121f), Path.Direction.CW) }
        ).forEach { p.op(it, Path.Op.UNION) }
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

    /** A standalone bear, 50dp wide, for the duo. */
    fun bitmap(density: Float, pct: Float, layers: List<Pair<Int, Float>>, met: Boolean, theme: Theme, now: Long): Bitmap {
        val w = (50f * density).roundToInt().coerceIn(80, 200)
        val h = (w * 1.24f).roundToInt()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.scale(w / 100f, w / 100f)
        drawInto(c, pct, layers, met, theme, now)
        return bmp
    }

    fun drawInto(c: Canvas, pct: Float, layers: List<Pair<Int, Float>>, met: Boolean, theme: Theme, now: Long) {
        val BODY = theme.body
        val RIM = theme.rim
        val TINT = theme.tint
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
                val band = surface(y, if (i == layers.lastIndex) 2.4f else 1.2f, phase + i * 1.3f)
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
            val t = layers.last().second
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 2f
            paint.strokeCap = Paint.Cap.ROUND
            paint.color = Color.WHITE
            paint.alpha = 130
            c.drawPath(surface(BOTTOM - t * (BOTTOM - TOP), 2.4f, phase + layers.lastIndex * 1.3f), paint)
            paint.alpha = 255
            paint.style = Paint.Style.FILL
            c.restore()
        }

        // Glass shine.
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.color = Color.WHITE
        paint.alpha = 180
        paint.strokeWidth = 3.6f
        c.drawPath(Path().apply { moveTo(22f, 76f); quadTo(18f, 92f, 26f, 106f) }, paint)
        paint.alpha = 190
        paint.strokeWidth = 3f
        c.drawPath(Path().apply { moveTo(30f, 26f); quadTo(34f, 20f, 40f, 18f) }, paint)
        paint.alpha = 255
        paint.style = Paint.Style.FILL

        /* Face, always above the drink, with the bear's mood: asleep while
           empty, happy while it fills, overjoyed at the goal. */
        val asleep = pct <= 0f
        val joy = met
        paint.color = Color.WHITE
        paint.alpha = 217
        c.drawOval(RectF(40f, 45f, 60f, 59f), paint)
        paint.alpha = 255
        paint.color = INK
        c.drawOval(RectF(46.3f, 47.3f, 53.7f, 52.7f), paint)
        paint.strokeCap = Paint.Cap.ROUND
        when {
            asleep -> {
                // Closed eyes, a small mouth, and a drift of z's.
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 2.4f
                c.drawPath(Path().apply { moveTo(36f, 42f); quadTo(40f, 46.5f, 44f, 42f) }, paint)
                c.drawPath(Path().apply { moveTo(56f, 42f); quadTo(60f, 46.5f, 64f, 42f) }, paint)
                paint.strokeWidth = 1.6f
                c.drawPath(Path().apply { moveTo(48f, 55f); lineTo(52f, 55f) }, paint)
                paint.color = RIM
                paint.strokeWidth = 2f
                // A small z low, a bigger one drifting up and right — all inside the box.
                paint.strokeWidth = 1.6f
                c.drawPath(Path().apply { moveTo(81f, 11f); lineTo(86f, 11f); lineTo(81f, 16f); lineTo(86f, 16f) }, paint)
                paint.strokeWidth = 2f
                c.drawPath(Path().apply { moveTo(89f, 2f); lineTo(96f, 2f); lineTo(89f, 9f); lineTo(96f, 9f) }, paint)
                paint.style = Paint.Style.FILL
            }
            joy -> {
                // Happy-closed eyes and a big open smile.
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 2.6f
                c.drawPath(Path().apply { moveTo(36f, 44f); quadTo(40f, 37f, 44f, 44f) }, paint)
                c.drawPath(Path().apply { moveTo(56f, 44f); quadTo(60f, 37f, 64f, 44f) }, paint)
                paint.style = Paint.Style.FILL
                c.drawPath(Path().apply { moveTo(44.5f, 53.5f); quadTo(50f, 63f, 55.5f, 53.5f); close() }, paint)
                paint.color = Color.parseColor("#FB7185")
                c.drawOval(RectF(47.5f, 57f, 52.5f, 60f), paint)
            }
            else -> {
                c.drawOval(RectF(35.6f, 36.8f, 44.4f, 47.2f), paint)
                c.drawOval(RectF(55.6f, 36.8f, 64.4f, 47.2f), paint)
                paint.color = Color.WHITE
                c.drawCircle(41.6f, 40.2f, 1.6f, paint)
                c.drawCircle(61.6f, 40.2f, 1.6f, paint)
                paint.color = INK
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 1.8f
                c.drawPath(Path().apply { moveTo(46f, 54.5f); quadTo(50f, 58.5f, 54f, 54.5f) }, paint)
                paint.style = Paint.Style.FILL
            }
        }
        paint.color = TINT
        paint.alpha = 153
        c.drawOval(RectF(25f, 48.5f, 36f, 55.5f), paint)
        c.drawOval(RectF(64f, 48.5f, 75f, 55.5f), paint)
        paint.alpha = 255

        if (met) {
            paint.color = SPARK
            c.drawPath(star(90f, 10f, 9f), paint)
        }
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
                        prefs.putString(WaterWidgetProvider.KEY, WaterWidgetProvider.withMine(this, json))
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

/* ---------- Layout ---------- */

const metricRow = (key, value, goal, you, first) => `
        <LinearLayout
            android:id="@+id/pt_${key}_row"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="${first ? 6 : 3}dp"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <TextView
                android:id="@+id/pt_${key}_value"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="${value}"
                android:maxLines="1"
                android:textColor="@color/pt_${key}"
                android:textSize="17sp"
                android:fontFamily="sans-serif"
                android:textStyle="bold" />

            <TextView
                android:id="@+id/pt_${key}_goal"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:layout_marginStart="5dp"
                android:text="${goal}"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="@color/pt_secondary"
                android:textSize="11sp"
                android:fontFamily="sans-serif-medium" />

            <TextView
                android:id="@+id/pt_${key}_you"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="6dp"
                android:paddingStart="7dp"
                android:paddingEnd="7dp"
                android:paddingTop="1dp"
                android:paddingBottom="1dp"
                android:background="@drawable/pt_chip"
                android:text="${you}"
                android:maxLines="1"
                android:textColor="@color/pt_secondary"
                android:textSize="10sp"
                android:fontFamily="sans-serif-medium" />
        </LinearLayout>`;

const WATER_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- RemoteViews-safe views only. The ProgressBars stacked on the rings are
     the micro-animations: launchers run an indeterminate ProgressBar's
     drawable, which is the one way a widget can move without the app. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/pt_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="horizontal"
    android:gravity="center_vertical"
    android:padding="14dp"
    android:background="@drawable/pt_bg">

    <FrameLayout
        android:layout_width="118dp"
        android:layout_height="118dp">

        <ImageView
            android:id="@+id/pt_rings"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:scaleType="fitCenter"
            android:contentDescription="@string/pt_rings"
            android:src="@drawable/pt_preview" />

        <ProgressBar
            android:id="@+id/pt_orbit"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:indeterminate="true"
            android:indeterminateOnly="true"
            android:indeterminateDuration="2600"
            android:indeterminateDrawable="@drawable/pt_orbit"
            android:visibility="gone" />

        <ProgressBar
            android:id="@+id/pt_bubbles_high"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:indeterminate="true"
            android:indeterminateOnly="true"
            android:indeterminateDrawable="@drawable/pt_bubbles_high"
            android:visibility="gone" />

        <ProgressBar
            android:id="@+id/pt_bubbles_low"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:indeterminate="true"
            android:indeterminateOnly="true"
            android:indeterminateDrawable="@drawable/pt_bubbles_low"
            android:visibility="gone" />

        <ProgressBar
            android:id="@+id/pt_twinkle"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:indeterminate="true"
            android:indeterminateOnly="true"
            android:indeterminateDrawable="@drawable/pt_twinkle"
            android:visibility="gone" />
    </FrameLayout>

    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:layout_marginStart="14dp"
        android:orientation="vertical">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <TextView
                android:id="@+id/pt_title"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="@string/pt_preview_title"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="@color/pt_text"
                android:textSize="14sp"
                android:fontFamily="sans-serif"
                android:textStyle="bold" />

            <LinearLayout
                android:id="@+id/pt_live"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:paddingStart="6dp"
                android:paddingEnd="7dp"
                android:paddingTop="2dp"
                android:paddingBottom="2dp"
                android:background="@drawable/pt_live_pill">

                <ProgressBar
                    android:layout_width="8dp"
                    android:layout_height="8dp"
                    android:indeterminate="true"
                    android:indeterminateOnly="true"
                    android:indeterminateDrawable="@drawable/pt_live_pulse" />

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_marginStart="4dp"
                    android:text="@string/pt_live"
                    android:textColor="@color/pt_live"
                    android:textSize="9sp"
                    android:textStyle="bold"
                    android:letterSpacing="0.08" />
            </LinearLayout>
        </LinearLayout>
${metricRow('water', '1.25 L', 'of 2 L', 'You 1 L', true)}
${metricRow('steps', '5,820', 'of 8,000 steps', 'You 4,100', false)}
${metricRow('reps', '72', 'reps · Squat', 'You 40', false)}

        <TextView
            android:id="@+id/pt_footer"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="6dp"
            android:text="@string/pt_preview_footer"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="@color/pt_secondary"
            android:textSize="11sp" />
    </LinearLayout>
</LinearLayout>
`;

/* ---------- The duo layout ---------- */

const duoBear = (who) => `
            <LinearLayout
                android:layout_width="62dp"
                android:layout_height="wrap_content"
                android:orientation="vertical"
                android:gravity="center_horizontal">

                <FrameLayout
                    android:layout_width="52dp"
                    android:layout_height="64dp">

                    <ImageView
                        android:id="@+id/d_${who}_bear"
                        android:layout_width="match_parent"
                        android:layout_height="match_parent"
                        android:scaleType="fitCenter"
                        android:contentDescription="@null"
                        android:src="@drawable/pd_bear_${who}" />
${who === 'them' ? `
                    <ProgressBar
                        android:id="@+id/d_them_bubbles_high"
                        android:layout_width="match_parent"
                        android:layout_height="match_parent"
                        android:indeterminate="true"
                        android:indeterminateOnly="true"
                        android:indeterminateDrawable="@drawable/pd_bubbles_high"
                        android:visibility="gone" />

                    <ProgressBar
                        android:id="@+id/d_them_bubbles_low"
                        android:layout_width="match_parent"
                        android:layout_height="match_parent"
                        android:indeterminate="true"
                        android:indeterminateOnly="true"
                        android:indeterminateDrawable="@drawable/pd_bubbles_low"
                        android:visibility="gone" />
` : ''}
                    <ProgressBar
                        android:id="@+id/d_${who}_twinkle"
                        android:layout_width="match_parent"
                        android:layout_height="match_parent"
                        android:indeterminate="true"
                        android:indeterminateOnly="true"
                        android:indeterminateDrawable="@drawable/pt_twinkle"
                        android:visibility="gone" />
                </FrameLayout>

                <TextView
                    android:id="@+id/d_${who}_name"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="${who === 'them' ? 'Alex' : 'You'}"
                    android:maxLines="1"
                    android:ellipsize="end"
                    android:textColor="@color/pd_secondary"
                    android:textSize="10sp"
                    android:textStyle="bold" />

                <TextView
                    android:id="@+id/d_${who}_amt"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="${who === 'them' ? '1.4 L' : '1 L'}"
                    android:maxLines="1"
                    android:textColor="@color/pd_text"
                    android:textSize="12.5sp"
                    android:fontFamily="sans-serif-black" />
            </LinearLayout>`;

const duelRow = (key, icon, them, me, share, first) => `
            <LinearLayout
                android:id="@+id/d_${key}_row"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginTop="${first ? 0 : 6}dp"
                android:orientation="vertical">

                <LinearLayout
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:orientation="horizontal"
                    android:gravity="center_vertical">

                    <TextView
                        android:id="@+id/d_${key}_them"
                        android:layout_width="0dp"
                        android:layout_height="wrap_content"
                        android:layout_weight="1"
                        android:gravity="end"
                        android:text="${them}"
                        android:maxLines="1"
                        android:textColor="@color/pd_text"
                        android:textSize="12sp"
                        android:textStyle="bold" />

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:layout_marginStart="4dp"
                        android:layout_marginEnd="4dp"
                        android:text="${icon}"
                        android:textSize="11sp" />

                    <TextView
                        android:id="@+id/d_${key}_me"
                        android:layout_width="0dp"
                        android:layout_height="wrap_content"
                        android:layout_weight="1"
                        android:text="${me}"
                        android:maxLines="1"
                        android:textColor="@color/pd_secondary"
                        android:textSize="12sp"
                        android:textStyle="bold" />
                </LinearLayout>

                <ProgressBar
                    android:id="@+id/d_${key}_tug"
                    style="?android:attr/progressBarStyleHorizontal"
                    android:layout_width="match_parent"
                    android:layout_height="6dp"
                    android:layout_marginTop="2dp"
                    android:max="1000"
                    android:progress="${share}"
                    android:progressDrawable="@drawable/pd_tug" />
            </LinearLayout>`;

const DUO_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- The duo: both bears face to face, a tug-of-war per metric between them,
     the rivalry line, and a button to drink without opening the app. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/pt_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center_vertical"
    android:paddingStart="14dp"
    android:paddingEnd="14dp"
    android:paddingTop="12dp"
    android:paddingBottom="12dp"
    android:background="@drawable/pt_bg_sunset">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:id="@+id/pt_title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="@string/pd_preview_title"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="@color/pd_text"
            android:textSize="14sp"
            android:textStyle="bold" />

        <LinearLayout
            android:id="@+id/pt_live"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:paddingStart="6dp"
            android:paddingEnd="7dp"
            android:paddingTop="2dp"
            android:paddingBottom="2dp"
            android:background="@drawable/pt_live_pill">

            <ProgressBar
                android:layout_width="8dp"
                android:layout_height="8dp"
                android:indeterminate="true"
                android:indeterminateOnly="true"
                android:indeterminateDrawable="@drawable/pt_live_pulse" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="4dp"
                android:text="@string/pt_live"
                android:textColor="#4ADE80"
                android:textSize="9sp"
                android:textStyle="bold"
                android:letterSpacing="0.08" />
        </LinearLayout>
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:orientation="horizontal"
        android:gravity="center_vertical">
${duoBear('them')}

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginStart="6dp"
            android:layout_marginEnd="6dp"
            android:orientation="vertical">
${duelRow('water', '💧', '👑 1.4 L', '1 L', 583, true)}
${duelRow('steps', '👟', '👑 6,120', '4,100', 599, false)}
${duelRow('reps', '💪', '👑 112', '40', 737, false)}
        </LinearLayout>
${duoBear('me')}
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:id="@+id/pt_footer"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="@string/pd_preview_duel"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="@color/pd_text"
            android:textSize="11.5sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/d_drink"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="8dp"
            android:paddingStart="12dp"
            android:paddingEnd="12dp"
            android:paddingTop="5dp"
            android:paddingBottom="5dp"
            android:background="@drawable/pd_drink_pill"
            android:text="@string/pd_drink"
            android:textColor="#0369A1"
            android:textSize="12sp"
            android:textStyle="bold" />
    </LinearLayout>
</LinearLayout>
`;

/* Tug-of-war: mine (pink) is the track, theirs (violet) pulls from the left. */
const TUG_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:id="@android:id/background">
        <shape>
            <solid android:color="#F472B6" />
            <corners android:radius="3dp" />
        </shape>
    </item>
    <item android:id="@android:id/progress">
        <scale android:scaleWidth="100%" android:scaleGravity="left">
            <shape>
                <gradient android:startColor="#8B5CF6" android:endColor="#C4B5FD" android:angle="0" />
                <corners android:radius="3dp" />
            </shape>
        </scale>
    </item>
</layer-list>
`;

const DRINK_PILL_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#FFFFFF" />
    <corners android:radius="999dp" />
</shape>
`;

/* The duo bears' picker previews: the same bear, in each owner's colours. */
function duoBearPreview(body, rim, tint, liquid, level) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="52dp" android:height="64dp"
    android:viewportWidth="100" android:viewportHeight="124">
    <path android:fillColor="${rim}" android:strokeColor="${rim}" android:strokeWidth="5" android:pathData="${BEAR_SILHOUETTE}" />
    <path android:fillColor="${body}" android:pathData="${BEAR_SILHOUETTE}" />
    <group>
        <clip-path android:pathData="${BEAR_SILHOUETTE}" />
        <path android:fillColor="${liquid}" android:pathData="M0,${level} Q12,${level - 4} 25,${level} T50,${level} T75,${level} T100,${level} L100,124 L0,124 Z" />
    </group>
    <path android:fillColor="#1E293B" android:pathData="${circlePath(40, 42, 4)} ${circlePath(60, 42, 4)}" />
    <path android:fillColor="#FFFFFF" android:fillAlpha="0.85" android:pathData="${circlePath(50, 52, 8)}" />
    <path android:fillColor="#1E293B" android:pathData="${circlePath(50, 50, 3)}" />
    <path android:fillColor="${tint}" android:fillAlpha="0.55" android:pathData="${circlePath(31, 52, 4)} ${circlePath(69, 52, 4)}" />
</vector>
`;
}

/* Bubbles inside a duo bear, in the bear's own 100 x 124 box. */
function duoBubbleFrame(frame, { xs, from, to, size }) {
  const paths = xs
    .map((x, i) => {
      const p = (frame / BUBBLE_FRAMES + i / xs.length) % 1;
      const cy = from - p * (from - to);
      const cx = x + 1.6 * Math.sin(p * Math.PI * 4);
      const r = size * (0.7 + 0.6 * p);
      const alpha = p > 0.8 ? round(0.75 * (1 - (p - 0.8) / 0.2)) : 0.75;
      return `    <path android:fillColor="#FFFFFF" android:fillAlpha="${alpha}" android:pathData="${circlePath(cx, cy, r)}" />`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="52dp" android:height="64dp"
    android:viewportWidth="100" android:viewportHeight="124">
${paths}
</vector>
`;
}

const DUO_BUBBLES = {
  high: { xs: [36, 52, 64, 44, 58], from: 116, to: 72, size: 2.4 },
  low: { xs: [42, 50, 58], from: 118, to: 104, size: 1.9 },
};

function duoResources() {
  const files = {
    'layout/water_widget_duo.xml': DUO_LAYOUT_XML,
    'drawable/pd_tug.xml': TUG_XML,
    'drawable/pd_drink_pill.xml': DRINK_PILL_XML,
    'drawable/pd_bear_them.xml': duoBearPreview('#EEF0FF', '#A5B4FC', '#8B5CF6', '#FB923C', 64),
    'drawable/pd_bear_me.xml': duoBearPreview('#FFF0F5', '#F9A8C9', '#FB7185', '#38BDF8', 80),
    'drawable/pt_bg_sunset.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:startColor="#4C1D95" android:centerColor="#7E22CE" android:endColor="#BE185D" android:angle="315" />
    <corners android:radius="@dimen/widget_radius" />
</shape>
`,
    'values/pd_colors.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="pd_text">#FFFFFF</color>
    <color name="pd_secondary">#F5D0FE</color>
</resources>
`,
  };
  for (const [name, set] of Object.entries(DUO_BUBBLES)) {
    for (let f = 0; f < BUBBLE_FRAMES; f++) files[`drawable/pd_bubbles_${name}_${f}.xml`] = duoBubbleFrame(f, set);
    files[`drawable/pd_bubbles_${name}.xml`] = animationList(`pd_bubbles_${name}`, BUBBLE_FRAMES, 120);
  }
  return files;
}

/* ---------- The scene layout ---------- */

const wideVector = (body) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="200dp" android:height="104dp"
    android:viewportWidth="100" android:viewportHeight="52">
${body}
</vector>
`;

/* Night: a field of stars that swell and fade in turn, over the sky only. */
function sceneStars() {
  const files = {};
  const stars = [
    [34, 5], [41, 11], [47, 4], [53, 9], [59, 3], [65, 12], [38, 17], [62, 18], [8, 6], [92, 5], [28, 9], [72, 7],
  ];
  const frames = 8;
  for (let f = 0; f < frames; f++) {
    files[`drawable/ps_stars_${f}.xml`] = wideVector(
      stars
        .map(([x, y], i) => {
          const k = Math.sin(((f / frames + i / stars.length) % 1) * Math.PI);
          return `    <path android:fillColor="#FFFFFF" android:fillAlpha="${round(0.15 + 0.85 * k)}" android:pathData="${starPath(x, y, 0.5 + 1.1 * k)}" />`;
        })
        .join('\n'),
    );
  }
  files['drawable/ps_stars.xml'] = animationList('ps_stars', frames, 140);
  return files;
}

/* Rain on their bear, falling from the cloud the painter draws over it. */
function sceneRain() {
  const files = {};
  const drops = [12, 15, 18, 21, 24];
  const frames = 8;
  for (let f = 0; f < frames; f++) {
    files[`drawable/ps_rain_${f}.xml`] = wideVector(
      drops
        .map((x, i) => {
          const p = (f / frames + i / drops.length) % 1;
          const y = 13 + p * 14;
          return `    <path android:fillColor="#7DD3FC" android:fillAlpha="${round(0.9 * (1 - p * 0.6))}" android:pathData="M${x},${round(y)} q0.9,1.6 0,2.4 q-0.9,-0.8 0,-2.4 Z" />`;
        })
        .join('\n'),
    );
  }
  files['drawable/ps_rain.xml'] = animationList('ps_rain', frames, 90);
  return files;
}

/* The picker never runs the painter, so its preview is a layer-list: a day
   sky, a hill, and the two bears standing on it. */
const SCENE_PREVIEW_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <gradient android:startColor="#38BDF8" android:endColor="#BAE6FD" android:angle="270" />
            <corners android:radius="@dimen/widget_radius" />
        </shape>
    </item>
    <item android:gravity="bottom" android:height="46dp">
        <shape android:shape="rectangle">
            <solid android:color="#22C55E" />
            <corners android:bottomLeftRadius="@dimen/widget_radius" android:bottomRightRadius="@dimen/widget_radius" />
        </shape>
    </item>
    <item android:gravity="bottom|left" android:left="26dp" android:bottom="34dp" android:width="52dp" android:height="64dp" android:drawable="@drawable/pd_bear_them" />
    <item android:gravity="bottom|right" android:right="26dp" android:bottom="34dp" android:width="52dp" android:height="64dp" android:drawable="@drawable/pd_bear_me" />
</layer-list>
`;

const SCENE_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- The scene: one painted picture (the real sky, a hill, both bears in a
     tug-of-war), the sky's animations over it, and the words on top. -->
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/pt_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/s_scene"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:contentDescription="@string/ps_scene"
        android:src="@drawable/ps_preview" />

    <ProgressBar
        android:id="@+id/s_stars"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:indeterminate="true"
        android:indeterminateOnly="true"
        android:indeterminateDrawable="@drawable/ps_stars"
        android:visibility="gone" />

    <ProgressBar
        android:id="@+id/s_rain"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:indeterminate="true"
        android:indeterminateOnly="true"
        android:indeterminateDrawable="@drawable/ps_rain"
        android:visibility="gone" />

    <ProgressBar
        android:id="@+id/s_rainfall"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:indeterminate="true"
        android:indeterminateOnly="true"
        android:indeterminateDrawable="@drawable/ps_rainfall"
        android:visibility="gone" />

    <ProgressBar
        android:id="@+id/s_snowfall"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:indeterminate="true"
        android:indeterminateOnly="true"
        android:indeterminateDrawable="@drawable/ps_snowfall"
        android:visibility="gone" />

    <!-- Their bear, the left third: tap to send a reaction. Beneath the
         words, so the buttons on top keep their own taps. -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="horizontal">

        <LinearLayout
            android:id="@+id/s_tap_them"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="36"
            android:contentDescription="@string/ps_react_label"
            android:orientation="horizontal" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="64"
            android:orientation="horizontal" />
    </LinearLayout>

    <ProgressBar
        android:id="@+id/s_hearts"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:indeterminate="true"
        android:indeterminateOnly="true"
        android:indeterminateDrawable="@drawable/ps_hearts"
        android:visibility="gone" />

    <ProgressBar
        android:id="@+id/s_confetti"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:indeterminate="true"
        android:indeterminateOnly="true"
        android:indeterminateDrawable="@drawable/pt_twinkle"
        android:visibility="gone" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:paddingStart="14dp"
        android:paddingEnd="12dp"
        android:paddingTop="11dp"
        android:paddingBottom="10dp">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <TextView
                android:id="@+id/pt_title"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="@string/pd_preview_title"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="#FFFFFF"
                android:textSize="14sp"
                android:textStyle="bold"
                android:shadowColor="#80000000"
                android:shadowRadius="4"
                android:shadowDy="1" />

            <TextView
                android:id="@+id/s_temp"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginEnd="6dp"
                android:paddingStart="8dp"
                android:paddingEnd="8dp"
                android:paddingTop="2dp"
                android:paddingBottom="2dp"
                android:background="@drawable/ps_glass"
                android:text="☀️ 24°"
                android:textColor="#FFFFFF"
                android:textSize="11sp"
                android:textStyle="bold"
                android:visibility="gone" />

            <TextView
                android:id="@+id/s_streak"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginEnd="6dp"
                android:paddingStart="8dp"
                android:paddingEnd="8dp"
                android:paddingTop="2dp"
                android:paddingBottom="2dp"
                android:background="@drawable/ps_glass"
                android:text="🔥 3"
                android:textColor="#FDE68A"
                android:textSize="11sp"
                android:textStyle="bold" />

            <LinearLayout
                android:id="@+id/pt_live"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:paddingStart="6dp"
                android:paddingEnd="7dp"
                android:paddingTop="2dp"
                android:paddingBottom="2dp"
                android:background="@drawable/ps_glass">

                <ProgressBar
                    android:layout_width="8dp"
                    android:layout_height="8dp"
                    android:indeterminate="true"
                    android:indeterminateOnly="true"
                    android:indeterminateDrawable="@drawable/pt_live_pulse" />

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_marginStart="4dp"
                    android:text="@string/pt_live"
                    android:textColor="#4ADE80"
                    android:textSize="9sp"
                    android:textStyle="bold"
                    android:letterSpacing="0.08" />
            </LinearLayout>
        </LinearLayout>

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="3dp"
            android:orientation="horizontal"
            android:gravity="center_horizontal">

            <TextView
                android:id="@+id/s_steps"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:paddingStart="8dp"
                android:paddingEnd="8dp"
                android:paddingTop="2dp"
                android:paddingBottom="2dp"
                android:background="@drawable/ps_glass"
                android:text="👟 👑 6,120  ·  4,100"
                android:maxLines="1"
                android:textColor="#FFFFFF"
                android:textSize="10.5sp"
                android:textStyle="bold" />

            <TextView
                android:id="@+id/s_reps"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="6dp"
                android:paddingStart="8dp"
                android:paddingEnd="8dp"
                android:paddingTop="2dp"
                android:paddingBottom="2dp"
                android:background="@drawable/ps_glass"
                android:text="💪 👑 112  ·  40"
                android:maxLines="1"
                android:textColor="#FFFFFF"
                android:textSize="10.5sp"
                android:textStyle="bold" />
        </LinearLayout>

        <FrameLayout
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1" />

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <TextView
                android:id="@+id/pt_footer"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:paddingStart="10dp"
                android:paddingEnd="10dp"
                android:paddingTop="4dp"
                android:paddingBottom="4dp"
                android:background="@drawable/ps_glass"
                android:text="@string/pd_preview_duel"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="#FFFFFF"
                android:textSize="11sp"
                android:textStyle="bold" />

            <TextView
                android:id="@+id/d_splash"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="6dp"
                android:paddingStart="10dp"
                android:paddingEnd="10dp"
                android:paddingTop="5dp"
                android:paddingBottom="5dp"
                android:background="@drawable/ps_splash_pill"
                android:text="@string/ps_splash"
                android:contentDescription="@string/ps_splash_label"
                android:textSize="12sp" />

            <TextView
                android:id="@+id/d_drink"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="8dp"
                android:paddingStart="12dp"
                android:paddingEnd="12dp"
                android:paddingTop="5dp"
                android:paddingBottom="5dp"
                android:background="@drawable/pd_drink_pill"
                android:text="@string/pd_drink"
                android:textColor="#0369A1"
                android:textSize="12sp"
                android:textStyle="bold" />
        </LinearLayout>
    </LinearLayout>
</FrameLayout>
`;

/* Hearts rising over my bear after a splash, on the right-hand side. */
function sceneHearts() {
  const files = {};
  const hearts = [
    [80, 0.9],
    [87, 0.7],
    [76, 0.6],
    [91, 0.8],
  ];
  const frames = 10;
  const heart = (x, y, r) =>
    `M${round(x)},${round(y + r * 1.2)} C${round(x - r * 2)},${round(y - r * 0.2)} ${round(x - r * 0.9)},${round(y - r * 1.4)} ${round(x)},${round(y - r * 0.4)} C${round(x + r * 0.9)},${round(y - r * 1.4)} ${round(x + r * 2)},${round(y - r * 0.2)} ${round(x)},${round(y + r * 1.2)} Z`;
  for (let f = 0; f < frames; f++) {
    files[`drawable/ps_hearts_${f}.xml`] = wideVector(
      hearts
        .map(([x, size], i) => {
          const p = (f / frames + i / hearts.length) % 1;
          const y = 40 - p * 30;
          const alpha = p > 0.75 ? round(1 - (p - 0.75) / 0.25) : 1;
          return `    <path android:fillColor="#F43F5E" android:fillAlpha="${alpha}" android:pathData="${heart(x + Math.sin(p * Math.PI * 3) * 1.2, y, size * (0.8 + 0.4 * p))}" />`;
        })
        .join('\n'),
    );
  }
  files['drawable/ps_hearts.xml'] = animationList('ps_hearts', frames, 110);
  return files;
}

/* Weather over the whole scene: rain streaks, or snow drifting down. */
function sceneWeather() {
  const files = {};
  const frames = 8;
  const cols = Array.from({ length: 14 }, (_, i) => 4 + i * 7);
  for (let f = 0; f < frames; f++) {
    files[`drawable/ps_rainfall_${f}.xml`] = wideVector(
      cols
        .map((x, i) => {
          const p = (f / frames + ((i * 3) % 7) / 7) % 1;
          const y = p * 48;
          return `    <path android:strokeColor="#DBEAFE" android:strokeAlpha="0.75" android:strokeWidth="0.45" android:strokeLineCap="round" android:pathData="M${x},${round(y)} l-0.8,3" />`;
        })
        .join('\n'),
    );
    files[`drawable/ps_snowfall_${f}.xml`] = wideVector(
      cols
        .map((x, i) => {
          const p = (f / frames + ((i * 5) % 7) / 7) % 1;
          const y = p * 48;
          const dx = Math.sin((p + i) * Math.PI * 2) * 1.5;
          return `    <path android:fillColor="#FFFFFF" android:fillAlpha="0.9" android:pathData="${circlePath(x + dx, y, 0.7)}" />`;
        })
        .join('\n'),
    );
  }
  files['drawable/ps_rainfall.xml'] = animationList('ps_rainfall', frames, 70);
  files['drawable/ps_snowfall.xml'] = animationList('ps_snowfall', frames, 160);
  return files;
}

function sceneResources() {
  return {
    ...sceneHearts(),
    ...sceneWeather(),
    'drawable/ps_splash_pill.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#E0F2FE" />
    <corners android:radius="999dp" />
</shape>
`,
    'layout/water_widget_scene.xml': SCENE_LAYOUT_XML,
    'drawable/ps_preview.xml': SCENE_PREVIEW_XML,
    'drawable/ps_glass.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#47000000" />
    <corners android:radius="999dp" />
</shape>
`,
    ...sceneStars(),
    ...sceneRain(),
  };
}

const WATER_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/water_widget_scene"
    android:previewLayout="@layout/water_widget_scene"
    android:description="@string/water_widget_description"
    android:minWidth="280dp"
    android:minHeight="140dp"
    android:minResizeWidth="250dp"
    android:minResizeHeight="130dp"
    android:maxResizeWidth="420dp"
    android:maxResizeHeight="220dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="1800000" />
`;

/* A plain system card, the iOS widget idiom: white by day, graphite by night,
   no gradient competing with the rings. */
const BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/pt_bg" />
    <corners android:radius="@dimen/widget_radius" />
</shape>
`;

const solidCard = (color) => `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="${color}" />
    <corners android:radius="@dimen/widget_radius" />
</shape>
`;

const pill = (color) => `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="${color}" />
    <corners android:radius="999dp" />
</shape>
`;

/* Pinned themes. Ocean is the deep blue the water reads best on. */
const THEME_DRAWABLES = {
  'drawable/pt_bg_light.xml': solidCard('#FFFFFF'),
  'drawable/pt_bg_dark.xml': solidCard('#1C1C1E'),
  'drawable/pt_bg_ocean.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:startColor="#1E1B4B" android:centerColor="#1E3A8A" android:endColor="#0C4A6E" android:angle="315" />
    <corners android:radius="@dimen/widget_radius" />
</shape>
`,
  'drawable/pt_chip_light.xml': pill('#F2F2F7'),
  'drawable/pt_chip_dark.xml': pill('#2C2C2E'),
  'drawable/pt_chip_ocean.xml': pill('#26FFFFFF'),
  'drawable/pt_chip_glass.xml': pill('#33FFFFFF'),
  /* Liquid glass for the Duo and Rings layouts: a see-through pane, lighter
     at the top, with a bright rim — the scene paints its own, richer one. */
  'drawable/pt_bg_glass.xml': `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <gradient android:startColor="#52FFFFFF" android:centerColor="#1AFFFFFF" android:endColor="#29FFFFFF" android:angle="270" />
            <corners android:radius="@dimen/widget_radius" />
        </shape>
    </item>
    <item android:bottom="60dp">
        <shape android:shape="rectangle">
            <gradient android:startColor="#40FFFFFF" android:endColor="#00FFFFFF" android:angle="270" />
            <corners android:topLeftRadius="@dimen/widget_radius" android:topRightRadius="@dimen/widget_radius" />
        </shape>
    </item>
    <item>
        <shape android:shape="rectangle">
            <stroke android:width="1.4dp" android:color="#B3FFFFFF" />
            <corners android:radius="@dimen/widget_radius" />
        </shape>
    </item>
</layer-list>
`,
};

const CHIP_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/pt_chip" />
    <corners android:radius="999dp" />
</shape>
`;

const LIVE_PILL_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/pt_live_bg" />
    <corners android:radius="999dp" />
</shape>
`;

/* iOS system colours. Text uses the deeper variants in light mode, where the
   ring hues are too pale to read at 4.5:1 on white. */
const COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="pt_bg">#FFFFFF</color>
    <color name="pt_text">#000000</color>
    <color name="pt_secondary">#8A8A8E</color>
    <color name="pt_chip">#F2F2F7</color>
    <color name="pt_water">#0A7CC4</color>
    <color name="pt_steps">#248A3D</color>
    <color name="pt_reps">#E0184A</color>
    <color name="pt_live">#248A3D</color>
    <color name="pt_live_bg">#2234C759</color>
</resources>
`;

const COLORS_NIGHT_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="pt_bg">#1C1C1E</color>
    <color name="pt_text">#FFFFFF</color>
    <color name="pt_secondary">#98989F</color>
    <color name="pt_chip">#2C2C2E</color>
    <color name="pt_water">#64D2FF</color>
    <color name="pt_steps">#30D158</color>
    <color name="pt_reps">#FF375F</color>
    <color name="pt_live">#30D158</color>
    <color name="pt_live_bg">#2630D158</color>
</resources>
`;

const WATER_STRINGS = {
  water_widget_label: 'Partner today',
  water_widget_description: 'Your bears in a tug-of-war under the real sky — water, steps and reps, live. Drink right from the widget.',
  pd_title_empty: 'Partner vs you',
  pd_new_day: 'New day — first sip wins ☀️',
  pd_partner: 'Partner',
  pd_drink: '💧 +250',
  pd_you: 'You',
  glance_label: 'Bear glance',
  glance_description: 'Your bear and theirs, side by side — a small window on today’s water.',
  glance_scene: 'Your bear and your partner’s, side by side',
  glance_drink: 'Log 250 ml',
  ps_splash: '💦',
  ps_splash_label: 'Splash your partner',
  ps_react_label: 'React to your partner',
  ps_scene: 'You and your partner in a tug-of-war over water',
  pd_preview_title: 'Alex vs you',
  pd_preview_duel: 'Alex just had a juice 🧃 — your move!',
  pt_title_empty: 'Partner · Today',
  pt_empty: 'Pair up to see their day here',
  pt_new_day: 'A new day — nothing yet',
  pt_live: 'LIVE',
  pt_you: 'You %1$s',
  pt_rings: 'Your partner’s water, steps and reps rings',
  pt_preview_title: 'Alex · Today',
  pt_preview_footer: '☕ Coffee · 250 ml · 3:42 PM',
};

/** Every resource file the widget needs, keyed by path under res/. */
function waterResources() {
  const files = {
    'drawable/pt_bg.xml': BG_XML,
    'drawable/pt_chip.xml': CHIP_XML,
    'drawable/pt_live_pill.xml': LIVE_PILL_XML,
    'drawable/pt_preview.xml': previewRings(),
    'values/pt_colors.xml': COLORS_XML,
    'values-night/pt_colors.xml': COLORS_NIGHT_XML,
    ...THEME_DRAWABLES,
    ...duoResources(),
    ...sceneResources(),
    ...glintDrawable(),
    ...twinkleDrawables(),
    ...pulseDrawables(),
  };
  for (const [name, set] of Object.entries(BUBBLE_SETS)) {
    for (let f = 0; f < BUBBLE_FRAMES; f++) files[`drawable/pt_bubbles_${name}_${f}.xml`] = bubbleFrame(f, set);
    files[`drawable/pt_bubbles_${name}.xml`] = animationList(`pt_bubbles_${name}`, BUBBLE_FRAMES, 120);
  }
  return files;
}

/* Files an earlier version of this widget wrote, removed on prebuild so a
   non-clean regenerate does not carry dead resources into the APK. */
const OBSOLETE_RESOURCES = [
  'drawable/water_widget_bg.xml',
  'drawable/water_progress.xml',
  'drawable/water_live_pill.xml',
  'drawable/water_bear_preview.xml',
  'drawable/water_live_pulse.xml',
  'drawable/water_bubbles_high.xml',
  'drawable/water_bubbles_low.xml',
  'values/water_widget_colors.xml',
  ...Array.from({ length: 6 }, (_, i) => `drawable/water_pulse_${i}.xml`),
  ...Array.from({ length: 10 }, (_, i) => `drawable/water_bubble_high_${i}.xml`),
  ...Array.from({ length: 10 }, (_, i) => `drawable/water_bubble_low_${i}.xml`),
];

/* ---------- The glance: a 2 x 2 companion ---------- */

const GLANCE_PROVIDER_KT = (pkg) => `package ${pkg}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Bear glance: the two bears side by side in a 2 x 2 — the same payload as
 * the scene (it is refreshed with it), on the same surface, with both
 * amounts, the streak and a button to drink.
 */
class GlanceWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { render(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        render(context, manager, id)
    }

    companion object {
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, GlanceWidgetProvider::class.java))
            ids.forEach { render(context, manager, it) }
        }

        private fun ml(v: Long): String =
            if (v >= 1000L) String.format(Locale.US, "%.1f L", v / 1000.0).replace(".0 L", " L") else "$v ml"

        /** One short line that makes the square worth a glance: who leads, by how much, or what to do next. */
        private fun glanceLine(who: String, a: Long, b: Long, hasMe: Boolean, themMet: Boolean, meMet: Boolean): String = when {
            themMet && meMet -> "Both full today 🥂"
            !hasMe -> if (a > 0L) "$who is sipping 💧" else "Waiting for $who's first sip"
            a == 0L && b == 0L -> "Sip to wake your bear ☀️"
            meMet -> "You're full — cheer $who on 💦"
            themMet -> "$who is full — catch up 💧"
            b > a -> "You lead by " + ml(b - a) + " 👑"
            a > b -> "$who leads by " + ml(a - b)
            else -> "Neck and neck 🤝"
        }

        private fun layersOf(snap: JSONObject?, key: String): List<Pair<Int, Float>> {
            val out = ArrayList<Pair<Int, Float>>()
            val arr = snap?.optJSONArray(key) ?: return out
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val color = try { Color.parseColor(o.optString("c")) } catch (e: Exception) { continue }
                out.add(color to o.optDouble("t", 0.0).toFloat().coerceIn(0f, 1f))
            }
            return out
        }

        fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.glance_widget)
            val raw = context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
                .getString(WaterWidgetProvider.KEY, null)
            val stored = try { if (raw.isNullOrBlank()) null else JSONObject(raw) } catch (e: Exception) { null }
            val now = System.currentTimeMillis()
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
            val snap = if (stored != null && stored.optString("day") == today) stored else null
            val hasMe = snap?.optBoolean("hasMe", false) ?: false

            val name = stored?.optString("name")?.takeIf { it.isNotBlank() }
            views.setTextViewText(R.id.g_title, (name ?: context.getString(R.string.pd_partner)) + " & you")
            views.setTextViewText(R.id.g_them, snap?.optString("amount") ?: "0 ml")
            views.setTextViewText(R.id.g_me, if (hasMe) snap?.optString("meWater") ?: "—" else "—")
            val streak = if (hasMe) snap?.optInt("streak", 0) ?: 0 else 0
            views.setViewVisibility(R.id.g_streak, if (streak > 0) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.g_streak, "🔥 " + streak)

            val a = snap?.optLong("waterMl", 0L) ?: 0L
            val b = if (hasMe) snap?.optLong("meWaterMl", 0L) ?: 0L else 0L
            val share = if (a + b > 0L) a.toFloat() / (a + b).toFloat() else 0.5f
            val themMet = snap?.optBoolean("met", false) ?: false
            val meMet = hasMe && (snap?.optBoolean("meMet", false) ?: false)
            val who = name ?: context.getString(R.string.pd_partner)
            views.setTextViewText(R.id.g_line, glanceLine(who, a, b, hasMe, themMet, meMet))
            val cal = java.util.Calendar.getInstance()
            val hour = cal.get(java.util.Calendar.HOUR_OF_DAY) + cal.get(java.util.Calendar.MINUTE) / 60f
            val options = manager.getAppWidgetOptions(id)
            val wDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0).takeIf { it > 0 } ?: 170
            val hDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0).takeIf { it > 0 } ?: 170
            views.setImageViewBitmap(
                R.id.g_scene,
                SceneArt.drawGlance(
                    context.resources.displayMetrics.density, wDp, hDp, hour, now,
                    SceneArt.Bear(
                        (snap?.optDouble("pct", 0.0) ?: 0.0).toFloat().coerceIn(0f, 1f),
                        layersOf(snap, "layers"), snap?.optBoolean("met", false) ?: false, "", "", a
                    ),
                    SceneArt.Bear(
                        if (hasMe) (snap?.optDouble("mePct", 0.0) ?: 0.0).toFloat().coerceIn(0f, 1f) else 0f,
                        if (hasMe) layersOf(snap, "meLayers") else emptyList(),
                        hasMe && (snap?.optBoolean("meMet", false) ?: false), "", "", b
                    ),
                    share, streak,
                    stored?.optString("surface", "glass") ?: "glass",
                    stored?.optString("season", "summer") ?: "summer"
                )
            )

            fun link(uri: String, code: Int) = PendingIntent.getActivity(
                context, code,
                Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.g_root, link("repchamp://couple/partner", 7310))
            views.setOnClickPendingIntent(R.id.g_drink, link("repchamp://drink?ml=250", 7311))
            manager.updateAppWidget(id, views)
        }
    }
}
`;

const GLANCE_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/g_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/g_scene"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:contentDescription="@string/glance_scene"
        android:src="@drawable/ps_preview" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:padding="10dp">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <TextView
                android:id="@+id/g_title"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="Alex &amp; you"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="#FFFFFF"
                android:textSize="12sp"
                android:textStyle="bold"
                android:shadowColor="#80000000"
                android:shadowRadius="4"
                android:shadowDy="1" />

            <TextView
                android:id="@+id/g_streak"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:paddingStart="6dp"
                android:paddingEnd="6dp"
                android:paddingTop="1dp"
                android:paddingBottom="1dp"
                android:background="@drawable/ps_glass"
                android:text="🔥 3"
                android:textColor="#FDE68A"
                android:textSize="10sp"
                android:textStyle="bold" />
        </LinearLayout>

        <TextView
            android:id="@+id/g_line"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="1dp"
            android:text="Sip to wake your bear ☀️"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="#E6FFFFFF"
            android:textSize="10sp"
            android:shadowColor="#80000000"
            android:shadowRadius="3"
            android:shadowDy="1" />

        <FrameLayout
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1" />

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <TextView
                android:id="@+id/g_them"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:gravity="center"
                android:text="1.4 L"
                android:maxLines="1"
                android:textColor="#FFFFFF"
                android:textSize="12sp"
                android:textStyle="bold"
                android:shadowColor="#99000000"
                android:shadowRadius="3"
                android:shadowDy="1" />

            <TextView
                android:id="@+id/g_drink"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:paddingStart="9dp"
                android:paddingEnd="9dp"
                android:paddingTop="4dp"
                android:paddingBottom="4dp"
                android:background="@drawable/pd_drink_pill"
                android:text="💧"
                android:contentDescription="@string/glance_drink"
                android:textSize="12sp" />

            <TextView
                android:id="@+id/g_me"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:gravity="center"
                android:text="1 L"
                android:maxLines="1"
                android:textColor="#FFFFFF"
                android:textSize="12sp"
                android:textStyle="bold"
                android:shadowColor="#99000000"
                android:shadowRadius="3"
                android:shadowDy="1" />
        </LinearLayout>
    </LinearLayout>
</FrameLayout>
`;

const GLANCE_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/glance_widget"
    android:previewLayout="@layout/glance_widget"
    android:description="@string/glance_description"
    android:minWidth="110dp"
    android:minHeight="110dp"
    android:minResizeWidth="110dp"
    android:minResizeHeight="110dp"
    android:maxResizeWidth="260dp"
    android:maxResizeHeight="260dp"
    android:targetCellWidth="2"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="1800000" />
`;

module.exports = {
  GLANCE_PROVIDER_KT,
  GLANCE_LAYOUT_XML,
  GLANCE_INFO_XML,
  WATER_PROVIDER_KT,
  MESSAGING_KT,
  WATER_LAYOUT_XML,
  WATER_INFO_XML,
  WATER_STRINGS,
  waterResources,
  OBSOLETE_RESOURCES,
};
