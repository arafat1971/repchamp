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
            "mePct", "meMet", "meLayers"
        )
        private val STYLE_KEYS = arrayOf("styled", "layout", "theme", "showSteps", "showReps", "showMine", "motion")

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
        }

        private fun fraction(snap: JSONObject?, key: String): Float =
            (snap?.optDouble(key, 0.0) ?: 0.0).toFloat().coerceIn(0f, 1f)

        fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val stored = stored(context)
            val duo = (stored?.optString("layout", "duo") ?: "duo") != "rings"
            val views = RemoteViews(
                context.packageName,
                if (duo) R.layout.water_widget_duo else R.layout.water_widget
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
            Palette.apply(views, palette, duo)

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

const WATER_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/water_widget_duo"
    android:previewLayout="@layout/water_widget_duo"
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
  water_widget_description: 'Your bear vs theirs — water, steps and reps as a live tug-of-war. Drink right from the widget.',
  pd_title_empty: 'Partner vs you',
  pd_new_day: 'New day — first sip wins ☀️',
  pd_partner: 'Partner',
  pd_drink: '💧 +250',
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

module.exports = {
  WATER_PROVIDER_KT,
  MESSAGING_KT,
  WATER_LAYOUT_XML,
  WATER_INFO_XML,
  WATER_STRINGS,
  waterResources,
  OBSOLETE_RESOURCES,
};
