/**
 * The Reps widget: your athlete — a man or a woman, chosen in the app — doing
 * squats on the wallpaper, with today's reps under them. A tap opens the app
 * straight into a rep session (`repchamp://reps`, which applies the same
 * free-rep allowance as Home).
 *
 * The squat is a frame animation (the one way a widget moves without the
 * app), drawn from `athleteArt.js`.
 */

const athlete = require('./athleteArt');

const round = (n) => Math.round(n * 100) / 100;

function part(p) {
  const attrs = [`android:pathData="${p.d}"`];
  let inner = '';
  const fill = p.fill ?? 'none';
  if (fill.startsWith('grad:')) {
    const g = athlete.GRADIENTS[fill.slice(5)];
    const [cx, cy, r] = g.relative && p.box ? [p.box[0] - p.box[2] * 0.3, p.box[1] - p.box[2] * 0.35, p.box[2] * 1.35] : [g.cx, g.cy, g.r];
    const items = g.stops
      .map(([o, c, a]) => {
        const color = a == null ? c : `#${Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase()}${c.slice(1)}`;
        return `                <item android:offset="${o}" android:color="${color}" />`;
      })
      .join('\n');
    inner = `
        <aapt:attr name="android:fillColor">
            <gradient android:type="radial" android:centerX="${round(cx)}" android:centerY="${round(cy)}" android:gradientRadius="${round(r)}">
${items}
            </gradient>
        </aapt:attr>
    `;
  } else if (fill !== 'none') {
    attrs.push(`android:fillColor="${fill}"`);
  }
  if (p.stroke) attrs.push(`android:strokeColor="${p.stroke}"`, `android:strokeWidth="${p.width}"`, 'android:strokeLineCap="round"', 'android:strokeLineJoin="round"');
  if (p.opacity != null) {
    attrs.push(`android:fillAlpha="${p.opacity}"`);
    if (p.stroke) attrs.push(`android:strokeAlpha="${p.opacity}"`);
  }
  return inner ? `    <path ${attrs.join(' ')}>${inner}</path>` : `    <path ${attrs.join(' ')} />`;
}

function vector(parts) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="110dp" android:height="143dp"
    android:viewportWidth="${athlete.W}" android:viewportHeight="${athlete.H}">
${parts.map(part).join('\n')}
</vector>
`;
}

/* One squat: down smoothly, a beat at the bottom, up, a breath at the top. */
const SQUAT = [
  [0, 420],
  [0.25, 90],
  [0.55, 90],
  [0.85, 90],
  [1, 220],
  [0.85, 90],
  [0.55, 90],
  [0.25, 90],
];

function repsResources() {
  const files = { 'layout/reps_widget.xml': LAYOUT_XML };
  for (const sex of ['male', 'female']) {
    const items = SQUAT.map(([k, ms], i) => {
      files[`drawable/rw_${sex}_${i}.xml`] = vector(athlete.figure(sex, k));
      return `    <item android:drawable="@drawable/rw_${sex}_${i}" android:duration="${ms}" />`;
    });
    files[`drawable/rw_${sex}.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<animation-list xmlns:android="http://schemas.android.com/apk/res/android" android:oneshot="false">
${items.join('\n')}
</animation-list>
`;
    files[`drawable/rw_${sex}_still.xml`] = vector(athlete.figure(sex, 0));
  }
  return files;
}

const anim = (id, src, visible) => `
            <ProgressBar
                android:id="@+id/${id}"
                android:layout_width="match_parent"
                android:layout_height="match_parent"
                android:indeterminate="true"
                android:indeterminateOnly="true"
                android:indeterminateDrawable="@drawable/${src}"
                android:visibility="${visible ? 'visible' : 'gone'}" />`;

const LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/rw_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:contentDescription="@string/rw_description">

    <FrameLayout
        android:layout_width="96dp"
        android:layout_height="125dp">
${anim('rw_male', 'rw_male', true)}
${anim('rw_female', 'rw_female', false)}
    </FrameLayout>

    <TextView
        android:id="@+id/rw_reps"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:text="@string/rw_start"
        android:maxLines="1"
        android:textColor="#FFFFFF"
        android:textSize="13sp"
        android:fontFamily="sans-serif-medium"
        android:textStyle="bold"
        android:shadowColor="#99000000"
        android:shadowDy="1"
        android:shadowRadius="4" />

    <TextView
        android:id="@+id/rw_hint"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="@string/rw_hint"
        android:maxLines="1"
        android:textColor="#E6FFFFFF"
        android:textSize="11sp"
        android:shadowColor="#99000000"
        android:shadowDy="1"
        android:shadowRadius="3" />
</LinearLayout>
`;

const PROVIDER_KT = (pkg) => `package ${pkg}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The Reps widget: my athlete squatting, today's reps, and a tap that opens
 * a rep session. The app writes { sex, day, reps } whenever they change.
 */
class RepsWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { render(context, manager, it) }
    }

    companion object {
        const val KEY = "repchamp.widget.reps.v1"

        fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.reps_widget)
            val raw = context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE).getString(KEY, null)
            val snap = try {
                if (raw.isNullOrBlank()) null else JSONObject(raw)
            } catch (e: Exception) {
                null
            }
            val female = snap?.optString("sex") == "female"
            views.setViewVisibility(R.id.rw_male, if (female) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.rw_female, if (female) View.VISIBLE else View.GONE)

            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            val reps = if (snap?.optString("day") == today) snap.optInt("reps", 0) else 0
            views.setTextViewText(
                R.id.rw_reps,
                if (reps > 0) context.getString(R.string.rw_reps, reps) else context.getString(R.string.rw_start)
            )

            val open = Intent(Intent.ACTION_VIEW, Uri.parse("repchamp://reps"))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            views.setOnClickPendingIntent(
                R.id.rw_root,
                PendingIntent.getActivity(
                    context, 7400, open,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            manager.updateAppWidget(id, views)
        }

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, RepsWidgetProvider::class.java))
            ids.forEach { render(context, manager, it) }
        }
    }
}
`;

const INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/reps_widget"
    android:previewLayout="@layout/reps_widget"
    android:description="@string/rw_description"
    android:minWidth="110dp"
    android:minHeight="150dp"
    android:minResizeWidth="110dp"
    android:minResizeHeight="130dp"
    android:maxResizeWidth="260dp"
    android:maxResizeHeight="260dp"
    android:targetCellWidth="2"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="1800000" />
`;

const REPS_STRINGS = {
  reps_widget_label: 'Reps',
  rw_description: 'Your athlete doing squats — tap to start a rep session',
  rw_start: 'Tap to train',
  rw_reps: '%1$d reps today',
  rw_hint: 'Tap to do reps',
};

module.exports = { PROVIDER_KT, LAYOUT_XML, INFO_XML, REPS_STRINGS, repsResources };
