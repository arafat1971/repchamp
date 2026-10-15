/**
 * The Steps widget: you and your partner on two bars to today's goal, who
 * leads, and one line on what to do about it. Unpaired, it is just you and the
 * pace coach. A tap opens the Steps screen (`repchamp://steps`).
 *
 * The app writes the payload (see `domain/stepsWidget`). A partner's silent
 * `partner-water` push — which already carries their step count as `stepsN` —
 * also lands here natively via `partnerPush`, so their bar moves with the app
 * closed.
 *
 * Kept in its own file, like the reps widget, so the week widget's key-contract
 * test stays scoped; `stepsWidget.test.ts` checks this file's keys instead.
 */

const bar = (id, drawable, top) => `
    <ProgressBar
        android:id="@+id/${id}"
        style="@android:style/Widget.ProgressBar.Horizontal"
        android:layout_width="match_parent"
        android:layout_height="8dp"
        android:layout_marginTop="${top}dp"
        android:max="1000"
        android:progress="0"
        android:progressDrawable="@drawable/${drawable}" />`;

const row = (prefix, label, top) => `
    <LinearLayout
        android:id="@+id/${prefix}_row"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="${top}dp"
        android:orientation="horizontal"
        android:gravity="bottom">

        <TextView
            android:id="@+id/${prefix}_name"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="${label}"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="#E6FFFFFF"
            android:textSize="12sp"
            android:fontFamily="sans-serif-medium" />

        <TextView
            android:id="@+id/${prefix}_count"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="—"
            android:maxLines="1"
            android:textColor="#FFFFFF"
            android:textSize="20sp"
            android:fontFamily="sans-serif"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/${prefix}_goal"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="4dp"
            android:text=""
            android:maxLines="1"
            android:textColor="#CCFFFFFF"
            android:textSize="11sp"
            android:fontFamily="sans-serif-medium" />
    </LinearLayout>`;

const LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/sw_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center_vertical"
    android:background="@drawable/sw_bg"
    android:padding="14dp"
    android:contentDescription="@string/sw_description">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:id="@+id/sw_title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="@string/sw_title_solo"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="#FFFFFF"
            android:textSize="11sp"
            android:letterSpacing="0.12"
            android:fontFamily="sans-serif"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/sw_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:background="@drawable/sw_pill"
            android:paddingStart="8dp"
            android:paddingEnd="8dp"
            android:paddingTop="2dp"
            android:paddingBottom="2dp"
            android:text=""
            android:maxLines="1"
            android:textColor="#FFFFFF"
            android:textSize="10.5sp"
            android:fontFamily="sans-serif"
            android:textStyle="bold"
            android:visibility="gone" />
    </LinearLayout>
${row('sw_me', '@string/sw_you', 6)}
${bar('sw_me_bar', 'sw_bar_me', 4)}
${row('sw_them', '', 8)}
${bar('sw_them_bar', 'sw_bar_them', 4)}

    <TextView
        android:id="@+id/sw_line"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="@string/sw_open"
        android:maxLines="2"
        android:ellipsize="end"
        android:textColor="#F2FFFFFF"
        android:textSize="11.5sp"
        android:fontFamily="sans-serif-medium" />
</LinearLayout>
`;

const BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:startColor="#FF9F43"
        android:centerColor="#FF6B2C"
        android:endColor="#E11D48"
        android:angle="315" />
    <corners android:radius="@dimen/widget_radius" />
</shape>
`;

const PILL_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#33FFFFFF" />
    <corners android:radius="999dp" />
</shape>
`;

const barXml = (fill) => `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:id="@android:id/background">
        <shape android:shape="rectangle">
            <solid android:color="#40FFFFFF" />
            <corners android:radius="4dp" />
        </shape>
    </item>
    <item android:id="@android:id/progress">
        <clip>
            <shape android:shape="rectangle">
                <solid android:color="${fill}" />
                <corners android:radius="4dp" />
            </shape>
        </clip>
    </item>
</layer-list>
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
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The Steps widget. The app writes
 * { day, mine, myGoal, name, theirs, theirGoal, badge, line, updatedAt }
 * — every sentence already phrased — and this draws it. A partner's silent
 * push patches \`theirs\` through \`partnerPush\` so their bar moves while the
 * app is closed.
 */
class StepsWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { render(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) {
        render(context, manager, id)
    }

    companion object {
        const val KEY = "repchamp.widget.steps.v1"

        private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        private fun fmt(n: Long): String = NumberFormat.getIntegerInstance(Locale.US).format(n)

        private fun permille(n: Long, goal: Long): Int =
            if (n <= 0L || goal <= 0L) 0 else Math.min(1000L, n * 1000L / goal).toInt()

        private fun read(context: Context): JSONObject? {
            val raw = context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE).getString(KEY, null)
            return try {
                if (raw.isNullOrBlank()) null else JSONObject(raw)
            } catch (e: Exception) {
                null
            }
        }

        fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.steps_widget)
            val snap = read(context)
            val fresh = snap != null && snap.optString("day") == today()

            val mine = if (fresh) snap!!.optLong("mine", -1L) else -1L
            val myGoal = snap?.optLong("myGoal", 8000L) ?: 8000L
            views.setTextViewText(R.id.sw_me_count, if (mine >= 0L) fmt(mine) else "—")
            views.setTextViewText(R.id.sw_me_goal, context.getString(R.string.sw_of_goal, fmt(myGoal)))
            views.setProgressBar(R.id.sw_me_bar, 1000, permille(mine, myGoal), false)

            val name = snap?.optString("name") ?: ""
            if (name.isBlank()) {
                views.setViewVisibility(R.id.sw_them_row, View.GONE)
                views.setViewVisibility(R.id.sw_them_bar, View.GONE)
                views.setTextViewText(R.id.sw_title, context.getString(R.string.sw_title_solo))
            } else {
                val theirs = if (fresh) snap!!.optLong("theirs", -1L) else -1L
                val theirGoal = snap?.optLong("theirGoal", 8000L) ?: 8000L
                views.setViewVisibility(R.id.sw_them_row, View.VISIBLE)
                views.setViewVisibility(R.id.sw_them_bar, View.VISIBLE)
                views.setTextViewText(R.id.sw_title, context.getString(R.string.sw_title_duo))
                views.setTextViewText(R.id.sw_them_name, name)
                views.setTextViewText(R.id.sw_them_count, if (theirs >= 0L) fmt(theirs) else "—")
                views.setTextViewText(R.id.sw_them_goal, context.getString(R.string.sw_of_goal, fmt(theirGoal)))
                views.setProgressBar(R.id.sw_them_bar, 1000, permille(theirs, theirGoal), false)
            }

            val badge = if (fresh) snap!!.optString("badge") else ""
            views.setViewVisibility(R.id.sw_badge, if (badge.isBlank()) View.GONE else View.VISIBLE)
            views.setTextViewText(R.id.sw_badge, badge)

            val line = if (fresh) snap!!.optString("line") else ""
            views.setTextViewText(R.id.sw_line, if (line.isBlank()) context.getString(R.string.sw_open) else line)

            val open = Intent(Intent.ACTION_VIEW, Uri.parse("repchamp://steps"))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            views.setOnClickPendingIntent(
                R.id.sw_root,
                PendingIntent.getActivity(
                    context, 7500, open,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            manager.updateAppWidget(id, views)
        }

        /**
         * A partner's water-widget push carries their steps (\`stepsN\`) and
         * day. Patch only the count, and only for today's snapshot — the
         * phrased line waits for the app, but the bar and number go live.
         */
        fun partnerPush(context: Context, widget: JSONObject) {
            try {
                val snap = read(context) ?: return
                if (snap.optString("name").isBlank()) return
                val day = widget.optString("day")
                if (day != today() || snap.optString("day") != day) return
                val steps = widget.optLong("stepsN", -1L)
                if (steps < 0L || steps == snap.optLong("theirs", -1L)) return
                snap.put("theirs", steps)
                context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
                    .edit().putString(KEY, snap.toString()).apply()
                refresh(context)
            } catch (e: Exception) {
                // A malformed push changes nothing.
            }
        }

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, StepsWidgetProvider::class.java))
            ids.forEach { render(context, manager, it) }
        }
    }
}
`;

const INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/steps_widget"
    android:previewLayout="@layout/steps_widget"
    android:description="@string/sw_description"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:minResizeWidth="180dp"
    android:minResizeHeight="110dp"
    android:maxResizeWidth="420dp"
    android:maxResizeHeight="220dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="1800000" />
`;

const STEPS_STRINGS = {
  steps_widget_label: 'Steps together',
  sw_description: 'Your steps and your partner’s, live — tap for the full picture',
  sw_title_solo: 'STEPS TODAY',
  sw_title_duo: 'STEPS TOGETHER',
  sw_you: 'You',
  sw_of_goal: '/ %1$s',
  sw_open: 'Open RepChamp to update your steps',
};

/** Resource files: res-relative path → contents. */
function stepsResources() {
  return {
    'drawable/sw_bg.xml': BG_XML,
    'drawable/sw_pill.xml': PILL_XML,
    'drawable/sw_bar_me.xml': barXml('#FFFFFF'),
    'drawable/sw_bar_them.xml': barXml('#E9D5FF'),
  };
}

module.exports = { PROVIDER_KT, LAYOUT_XML, INFO_XML, STEPS_STRINGS, stepsResources };
