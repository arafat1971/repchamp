/**
 * The Android home-screen widget, as a config plugin.
 *
 * `android/` is generated and gitignored, so anything hand-edited there is
 * destroyed by the next `expo prebuild --clean` — the same reason
 * `withUploadSigning` exists. Everything this widget needs (Kotlin provider,
 * layouts, drawables, strings, manifest entry) is written during prebuild
 * instead, so it survives every regeneration.
 *
 * ## How the data gets across a process boundary
 *
 * The widget runs inside the launcher, in a different process from the app. It
 * cannot read MMKV, hold a Firestore listener, or run a line of this app's
 * JavaScript. So the app writes a small flat snapshot into `SharedPreferences`
 * while it is alive, and the provider reads it. See `domain/widgetSnapshot` for
 * the payload and why it carries no identifiers.
 *
 * iOS is deliberately not attempted here. A WidgetKit extension needs a real
 * Xcode target, an app group entitlement and a provisioning profile, none of
 * which this plugin can honestly fake — see WIDGET_SETUP.md.
 */

const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const water = require('./waterWidgetTemplates');

/**
 * Every widget this plugin installs.
 *
 * One entry per widget: the JS name (what `services/widgets.ts` passes), the
 * Kotlin provider class, the SharedPreferences key holding its payload, and
 * the layout/info resource names. The bridge, the manifest receivers and the
 * Kotlin `when` branches are all generated from this list, so a third widget
 * is an entry here rather than a parallel copy of the file.
 *
 * `id` is a wire contract shared with `src/domain/widgetSnapshot.ts`; a test
 * there reads this file and asserts the keys agree.
 */
const WIDGETS = [
  {
    id: 'partner',
    className: 'PartnerWidgetProvider',
    prefsKey: 'repchamp.widget.partner.v1',
    layout: 'partner_widget',
    info: 'partner_widget_info',
    /* The name in the launcher's widget picker; without one, every widget is
       listed under the app's name and they cannot be told apart. */
    label: 'widget_label_week',
    /* `provider`, `layoutXml` and `infoXml` are attached further down, once
       those templates are declared — they are large enough that inlining
       them here would bury the registry they belong to. */
  },
  {
    /* The partner's bear, filling live — see waterWidgetTemplates.js. */
    id: 'water',
    className: 'WaterWidgetProvider',
    prefsKey: 'repchamp.widget.water.v1',
    layout: 'water_widget',
    info: 'water_widget_info',
    label: 'water_widget_label',
  },
];

/** The first widget, still referenced by the single-widget templates below. */
const WIDGET_CLASS = WIDGETS[0].className;

/** `"partner" -> PartnerWidgetProvider::class.java` branches for the bridge. */
const PROVIDER_CASES = WIDGETS.map(
  (w) => `        "${w.id}" -> ${w.className}::class.java`,
).join('\n');

/** `"partner" -> "repchamp.widget.partner.v1"` branches for the bridge. */
const KEY_CASES = WIDGETS.map((w) => `        "${w.id}" -> "${w.prefsKey}"`).join('\n');

/* The provider. Reads the snapshot the app left in SharedPreferences and draws
   it; never computes anything itself, because everything it would compute is
   already tested in `domain/widgetSnapshot`. */
const PROVIDER_KT = (pkg) => `package ${pkg}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Draws the partner's week on the launcher.
 *
 * Everything shown here was computed and phrased by the app in
 * \`domain/widgetSnapshot\` and written to SharedPreferences. This class does no
 * arithmetic and builds no sentences: a string built here could not be unit
 * tested from the JS repo, and the widget and the in-app card must never drift
 * into saying different things about the same day.
 */
class ${WIDGET_CLASS} : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        manager: AppWidgetManager,
        ids: IntArray
    ) {
        ids.forEach { id -> render(context, manager, id) }
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
        val views = RemoteViews(context.packageName, R.layout.partner_widget)

        // Expo's MMKV is not reachable from this process; the app mirrors a flat
        // snapshot here instead.
        val prefs = context.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
        val raw = prefs.getString("repchamp.widget.partner.v1", null)

        if (raw.isNullOrBlank()) {
            // Never paired, or the app has not run since install. Say so plainly
            // rather than drawing zeroes that look like a bad week.
            views.setTextViewText(R.id.widget_headline, context.getString(R.string.widget_empty))
            views.setViewVisibility(R.id.widget_stats, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_dot, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_live, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_nudge, android.view.View.GONE)
        } else {
            try {
                val snap = JSONObject(raw)
                views.setViewVisibility(R.id.widget_stats, android.view.View.VISIBLE)
                views.setTextViewText(R.id.widget_headline, snap.optString("headline"))
                views.setTextViewText(R.id.widget_their_days, snap.optInt("theirDays").toString())
                views.setTextViewText(R.id.widget_my_days, snap.optInt("myDays").toString())
                views.setTextViewText(R.id.widget_shared_days, snap.optInt("sharedDays").toString())
                views.setTextViewText(
                    R.id.widget_their_label,
                    snap.optString("partnerName", context.getString(R.string.widget_partner))
                )

                val nudge = snap.optString("nudge", "")
                views.setTextViewText(R.id.widget_nudge, nudge)
                views.setViewVisibility(
                    R.id.widget_nudge,
                    if (nudge.isBlank()) android.view.View.GONE else android.view.View.VISIBLE
                )

                // The live dot is a claim about *today*, so it appears only when
                // the headline is one. A dot that is always lit says nothing.
                val fresh = snap.optBoolean("freshToday", false)
                val liveVis = if (fresh) android.view.View.VISIBLE else android.view.View.GONE
                views.setViewVisibility(R.id.widget_dot, liveVis)
                views.setViewVisibility(R.id.widget_live, liveVis)

                // A widget that silently shows week-old numbers is worse than one
                // that admits it is stale — the athlete cannot tell otherwise.
                val updatedAt = snap.optLong("updatedAt", 0L)
                val stale = updatedAt > 0L &&
                    System.currentTimeMillis() - updatedAt > 12L * 60L * 60L * 1000L
                views.setViewVisibility(
                    R.id.widget_stale,
                    if (stale) android.view.View.VISIBLE else android.view.View.GONE
                )
            } catch (e: Exception) {
                // A malformed payload must not crash the launcher.
                views.setTextViewText(R.id.widget_headline, context.getString(R.string.widget_empty))
                views.setViewVisibility(R.id.widget_stats, android.view.View.GONE)
                views.setViewVisibility(R.id.widget_dot, android.view.View.GONE)
                views.setViewVisibility(R.id.widget_live, android.view.View.GONE)
                views.setViewVisibility(R.id.widget_nudge, android.view.View.GONE)
            }
        }

        // Tapping opens the app. The deep link lands on the bond tracker.
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launch != null) {
            val pending = PendingIntent.getActivity(
                context, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pending)
        }

        manager.updateAppWidget(id, views)
    }
}
`;


/* A minimal native module so JS can write the snapshot where the widget can
   read it. MMKV stores its own binary format in the app's files dir, which an
   AppWidgetProvider cannot open — SharedPreferences is the supported bridge,
   and this is the smallest possible surface for it: one setter, no reads. */
const BRIDGE_KT = (pkg) => `package ${pkg}

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Writes the widget snapshot and asks the launcher to redraw.
 *
 * Deliberately write-only. The widget is a mirror of app state, never a source
 * of it, so there is no reader here and nothing the launcher can tell the app.
 */
class PartnerWidgetModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "PartnerWidget"

    /**
     * Which provider a widget id refers to, and which key holds its payload.
     *
     * The JS side names a widget rather than addressing a class, so adding a
     * third means one entry in the plugin's WIDGETS list — not a second
     * native module, a second ReactPackage and a second insertion into
     * MainApplication's registration seam.
     *
     * An unknown id is ignored rather than throwing: a JS bundle newer than
     * the native build will name widgets this APK has never heard of, and
     * that should cost a missing card, not a crash.
     */
    private fun providerFor(widget: String): Class<*>? = when (widget) {
${PROVIDER_CASES}
        else -> null
    }

    private fun keyFor(widget: String): String? = when (widget) {
${KEY_CASES}
        else -> null
    }

    @ReactMethod
    fun setSnapshot(widget: String, json: String) {
        val ctx = reactApplicationContext
        val key = keyFor(widget) ?: return
        val provider = providerFor(widget) ?: return

        // The water widget also hears the partner's pushes; keep the newest.
        if (widget == "water" && !WaterWidgetProvider.accept(ctx, json)) return

        ctx.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
            .edit()
            .putString(key, json)
            .apply()

        // Nudge every placed instance; without this the launcher waits for its
        // own 30-minute cycle and the card looks stale right after a set.
        val manager = AppWidgetManager.getInstance(ctx)
        val ids = manager.getAppWidgetIds(ComponentName(ctx, provider))
        if (ids.isNotEmpty()) {
            val intent = android.content.Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            intent.component = ComponentName(ctx, provider)
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            ctx.sendBroadcast(intent)
        }
    }

    /** How many instances of one widget the athlete has actually placed. */
    @ReactMethod
    fun count(widget: String, promise: com.facebook.react.bridge.Promise) {
        val ctx = reactApplicationContext
        val provider = providerFor(widget)
        if (provider == null) {
            promise.resolve(0)
            return
        }
        val manager = AppWidgetManager.getInstance(ctx)
        promise.resolve(manager.getAppWidgetIds(ComponentName(ctx, provider)).size)
    }
}
`;

const PACKAGE_KT = (pkg) => `package ${pkg}

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class PartnerWidgetPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = mutableListOf(PartnerWidgetModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()
}
`;

const LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- RemoteViews-safe views only (LinearLayout, TextView, ImageView): a
     widget cannot host arbitrary layouts, and an unsupported view makes the
     whole thing fail to inflate rather than degrading gracefully.

     Every field the provider fills carries a preview default, because the
     widget picker renders this layout raw — it never calls onUpdate — so an
     empty field shows a hollow card at the exact moment someone is deciding
     whether to add it. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp"
    android:minWidth="48dp"
    android:minHeight="48dp"
    android:background="@drawable/widget_bg">

    <!-- Eyebrow row: the label, and a live dot that appears only when the
         headline is a claim about today. -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:id="@+id/widget_title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="@string/widget_partner"
            android:textColor="@color/widget_eyebrow"
            android:textSize="10sp"
            android:textStyle="bold"
            android:letterSpacing="0.14" />

        <!-- ImageView, not View. RemoteViews permits a fixed set of classes and
             a bare android.view.View is not among them: it inflates fine in
             the app but the launcher rejects it with "Class not allowed to be
             inflated", and the whole widget fails rather than losing the dot. -->
        <ImageView
            android:id="@+id/widget_dot"
            android:layout_width="7dp"
            android:layout_height="7dp"
            android:layout_marginEnd="5dp"
            android:contentDescription="@null"
            android:src="@drawable/widget_dot" />

        <TextView
            android:id="@+id/widget_live"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="@string/widget_today"
            android:textColor="@color/widget_live"
            android:textSize="9sp"
            android:textStyle="bold"
            android:letterSpacing="0.1" />
    </LinearLayout>

    <!-- The sentence. This is what the athlete actually reads. -->
    <TextView
        android:id="@+id/widget_headline"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="@string/widget_preview_headline"
        android:maxLines="2"
        android:ellipsize="end"
        android:textColor="@color/widget_headline"
        android:textSize="17sp"
        android:textStyle="bold"
        android:lineSpacingExtra="1dp" />

    <LinearLayout
        android:id="@+id/widget_stats"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="12dp"
        android:orientation="horizontal">

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginEnd="6dp"
            android:orientation="vertical"
            android:gravity="center"
            android:minHeight="48dp"
            android:paddingTop="7dp"
            android:paddingBottom="7dp"
            android:background="@drawable/widget_stat_bg">
            <TextView
                android:id="@+id/widget_their_days"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="4"
                android:textColor="@color/widget_headline"
                android:textSize="20sp"
                android:textStyle="bold" />
            <!-- One line always: a stat label that wraps breaks the alignment
                 of the three pills. Width is bounded rather than wrap_content
                 so a long display name ellipsises inside its pill instead of
                 pushing the other two out of shape. -->
            <TextView
                android:id="@+id/widget_their_label"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:gravity="center"
                android:paddingStart="2dp"
                android:paddingEnd="2dp"
                android:text="@string/widget_partner_short"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="@color/widget_stat_label"
                android:textSize="9sp" />
        </LinearLayout>

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginEnd="6dp"
            android:orientation="vertical"
            android:gravity="center"
            android:minHeight="48dp"
            android:paddingTop="7dp"
            android:paddingBottom="7dp"
            android:background="@drawable/widget_stat_bg">
            <TextView
                android:id="@+id/widget_my_days"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="5"
                android:textColor="@color/widget_headline"
                android:textSize="20sp"
                android:textStyle="bold" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="@string/widget_you"
                android:textColor="@color/widget_stat_label"
                android:textSize="9sp" />
        </LinearLayout>

        <!-- Together is the one that matters: it is the only status that
             advances the shared streak, so it gets the brightest number. -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical"
            android:gravity="center"
            android:minHeight="48dp"
            android:paddingTop="7dp"
            android:paddingBottom="7dp"
            android:background="@drawable/widget_stat_bg">
            <TextView
                android:id="@+id/widget_shared_days"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="3"
                android:textColor="@color/widget_shared_value"
                android:textSize="20sp"
                android:textStyle="bold" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="@string/widget_together"
                android:textColor="@color/widget_shared_label"
                android:textSize="9sp" />
        </LinearLayout>
    </LinearLayout>

    <!-- The reason-to-act line. Hidden when empty: filler trains the athlete
         to stop reading the line that does mean something.

         Two lines, not one. At 11sp in a 3-cell widget a single line holds
         about 32 characters and the longest branch is 44 — "Your turn — train
         to make it a shared day" came out as "…make it a shar…". Shortening the
         copy to fit would have blunted the one sentence doing the persuading,
         and there is clearly vertical room below the stat row. Still capped at
         two with an ellipsis, so a longer string in future degrades instead of
         pushing the card taller. -->
    <TextView
        android:id="@+id/widget_nudge"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="9dp"
        android:text="@string/widget_preview_nudge"
        android:maxLines="2"
        android:ellipsize="end"
        android:lineSpacingExtra="1dp"
        android:textColor="@color/widget_nudge"
        android:textSize="11sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_stale"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="@string/widget_stale"
        android:textColor="@color/widget_shared_label"
        android:textSize="9sp"
        android:visibility="gone" />
</LinearLayout>
`;

const INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Sized and described to Android's widget quality guidelines rather than to
     taste. targetCellWidth / targetCellHeight are the Android 12+ way to
     ask for a grid size (3x2 here); minWidth / minHeight stay as the
     pre-12 fallback, and minResize* sets the floor below which the layout
     stops being readable rather than letting it be crushed. -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/partner_widget"
    android:previewLayout="@layout/partner_widget"
    android:description="@string/widget_description"
    android:minWidth="180dp"
    android:minHeight="110dp"
    android:minResizeWidth="180dp"
    android:minResizeHeight="110dp"
    android:maxResizeWidth="360dp"
    android:maxResizeHeight="200dp"
    android:targetCellWidth="3"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="1800000" />
`;

/* The app's signature surface: the same deep-green gradient as the paywall
   hero, the couple card and the Arena hero (`gradients.brandDeep`). A white box
   on a launcher reads as a system widget belonging to nobody; this one is
   recognisably RepChamp from across the room, which is the whole job of
   something that lives on a home screen. */
const BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:startColor="@color/widget_grad_start"
        android:endColor="@color/widget_grad_end"
        android:angle="315" />
    <!-- The system radius, not a number of my choosing: Android 12+ crops
         widget backgrounds to the launcher's own radius, and a hardcoded value
         either shows a corner seam or gets clipped. widget_radius resolves
         to the platform dimension on v31+ and a sane fallback below. -->
    <corners android:radius="@dimen/widget_radius" />
</shape>
`;

/* A translucent pill behind each stat, so the numbers read as deliberate
   objects rather than text floating on a gradient. */


/* Colours as named resources rather than literals in the layout, so a
   `values-night` variant can override them without a second layout. The brand
   green is deliberately kept in both themes — a widget that changes identity
   with the system theme stops being recognisable, which is the one thing it
   has to be. Only the contrast moves. */
const COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="widget_grad_start">#16A34A</color>
    <color name="widget_grad_end">#065F46</color>
    <color name="widget_eyebrow">#A7F3D0</color>
    <color name="widget_headline">#FFFFFF</color>
    <color name="widget_stat_value">#FFFFFF</color>
    <color name="widget_stat_label">#BBF7D0</color>
    <color name="widget_shared_value">#FDE047</color>
    <color name="widget_shared_label">#FDE68A</color>
    <color name="widget_nudge">#D1FAE5</color>
    <color name="widget_live">#4ADE80</color>
    <color name="widget_pill">#26FFFFFF</color>
</resources>
`;

/* Night: the same green identity, pushed darker so the card does not glow on a
   dark home screen, with the text lifted to keep contrast above 4.5:1. */
const COLORS_NIGHT_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="widget_grad_start">#15803D</color>
    <color name="widget_grad_end">#04352A</color>
    <color name="widget_eyebrow">#6EE7B7</color>
    <color name="widget_stat_label">#A7F3D0</color>
    <color name="widget_nudge">#A7F3D0</color>
    <color name="widget_pill">#1FFFFFFF</color>
</resources>
`;

const DIMENS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="widget_radius">20dp</dimen>
    <dimen name="widget_inner_radius">12dp</dimen>
</resources>
`;

const DIMENS_V31_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="widget_radius">@android:dimen/system_app_widget_background_radius</dimen>
    <dimen name="widget_inner_radius">@android:dimen/system_app_widget_inner_radius</dimen>
</resources>
`;

const STAT_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/widget_pill" />
    <corners android:radius="@dimen/widget_inner_radius" />
</shape>
`;

/* The live dot — small, bright, and only drawn when the claim is about today. */
const DOT_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="@color/widget_live" />
</shape>
`;

const STRINGS = {
  widget_partner: 'PARTNER',
  widget_you: 'You',
  widget_together: 'Together',
  widget_empty: 'Pair with someone to see their week here.',
  widget_stale: 'Open RepChamp to refresh',
  widget_description: "Your partner's training week, live.",
  widget_preview_headline: 'You both trained today',
  widget_partner_short: 'Partner',
  widget_today: 'TODAY',
  widget_preview_nudge: 'Your turn — train to make it a shared day',
  widget_label_week: 'Partner’s week',
};

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, 'utf8');
}

/** Writes the Kotlin, layouts, drawable and strings into the generated project. */
const withWidgetSources = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) return cfg;

      const root = cfg.modRequest.platformProjectRoot;
      const javaDir = path.join(root, 'app/src/main/java', ...pkg.split('.'));
      const res = path.join(root, 'app/src/main/res');

      /* One native module and one ReactPackage serve every widget — see the
         `when` branches in the bridge. A second module would mean a second
         insertion into MainApplication's registration seam, doubling the
         surface that breaks when Expo changes that template. */
      write(path.join(javaDir, 'PartnerWidgetModule.kt'), BRIDGE_KT(pkg));
      write(path.join(javaDir, 'PartnerWidgetPackage.kt'), PACKAGE_KT(pkg));

      /* Per-widget: a provider class, a layout, a picker-info file. Driven by
         WIDGETS so a second widget adds entries rather than a parallel copy
         of this block. */
      for (const widget of WIDGETS) {
        write(path.join(javaDir, `${widget.className}.kt`), widget.provider(pkg));
        write(path.join(res, `layout/${widget.layout}.xml`), widget.layoutXml);
        write(path.join(res, `xml/${widget.info}.xml`), widget.infoXml);
      }

      /* Shared by every widget, written exactly once. These are the files a
         second *plugin* would silently clobber — `write` overwrites without
         checking — which is why every widget lives in this one plugin and
         draws from this one palette rather than shipping its own. */
      write(path.join(res, 'drawable/widget_bg.xml'), BG_XML);
      write(path.join(res, 'drawable/widget_stat_bg.xml'), STAT_BG_XML);
      write(path.join(res, 'drawable/widget_dot.xml'), DOT_XML);
      write(path.join(res, 'values/widget_colors.xml'), COLORS_XML);
      write(path.join(res, 'values-night/widget_colors.xml'), COLORS_NIGHT_XML);
      write(path.join(res, 'values/widget_dimens.xml'), DIMENS_XML);
      write(path.join(res, 'values-v31/widget_dimens.xml'), DIMENS_V31_XML);

      /* The water widget's drawables and the FCM service that feeds it. */
      for (const [file, contents] of Object.entries(water.waterResources())) {
        write(path.join(res, file), contents);
      }
      write(path.join(javaDir, 'RepChampMessagingService.kt'), water.MESSAGING_KT(pkg));

      /* Strings are merged rather than overwritten — `strings.xml` already
         carries the app name and Expo's own entries. */
      const stringsPath = path.join(res, 'values/strings.xml');
      let xml = fs.existsSync(stringsPath)
        ? fs.readFileSync(stringsPath, 'utf8')
        : '<resources></resources>';
      for (const [name, value] of Object.entries({ ...STRINGS, ...water.WATER_STRINGS })) {
        if (xml.includes(`name="${name}"`)) continue;
        const escaped = value.replace(/&/g, '&amp;').replace(/'/g, "\\'");
        xml = xml.replace('</resources>', `  <string name="${name}">${escaped}</string>\n</resources>`);
      }
      write(stringsPath, xml);

      return cfg;
    },
  ]);

/* Bind each widget to the templates that draw it. Kept next to the hooks that
   consume them rather than inside WIDGETS above, so the registry stays a list
   of names and the templates stay where they are read. */
WIDGETS[0].provider = PROVIDER_KT;
WIDGETS[0].layoutXml = LAYOUT_XML;
WIDGETS[0].infoXml = INFO_XML;
WIDGETS[1].provider = water.WATER_PROVIDER_KT;
WIDGETS[1].layoutXml = water.WATER_LAYOUT_XML;
WIDGETS[1].infoXml = water.WATER_INFO_XML;

/** Registers the provider so the launcher offers it in the widget picker. */
const withWidgetManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.receiver = app.receiver ?? [];

    /* One receiver per widget. Idempotent on `android:name`, because prebuild
       may run against a manifest this plugin already touched.

       `android:exported="false"` is correct even though the launcher binds
       these: it goes through AppWidgetManager rather than a broadcast, and
       the app's own update broadcast is an explicit component intent from the
       same UID. */
    for (const widget of WIDGETS) {
      const name = `.${widget.className}`;
      const label = `@string/${widget.label}`;
      const existing = app.receiver.find((r) => r.$?.['android:name'] === name);
      if (existing) {
        existing.$['android:label'] = label;
        continue;
      }

      app.receiver.push({
        $: { 'android:name': name, 'android:exported': 'false', 'android:label': label },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': `@xml/${widget.info}`,
            },
          },
        ],
      });
    }

    /* The messaging service that feeds the water widget from a silent push.
       Priority 10 beats Expo's own service (-1): FCM delivers to the
       highest-priority match only, and ours hands everything that is not a
       widget update straight back to Expo. */
    app.service = app.service ?? [];
    const svc = '.RepChampMessagingService';
    if (!app.service.some((s) => s.$?.['android:name'] === svc)) {
      app.service.push({
        $: { 'android:name': svc, 'android:exported': 'false' },
        'intent-filter': [
          {
            $: { 'android:priority': '10' },
            action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
          },
        ],
      });
    }

    return cfg;
  });

/* The service subclasses Expo's, which extends FirebaseMessagingService —
   but expo-notifications takes firebase-messaging as `implementation`, so the
   app module cannot see it. Same version as expo-notifications pins. */
const withMessagingDependency = (config) =>
  withAppBuildGradle(config, (cfg) => {
    const dep = "implementation 'com.google.firebase:firebase-messaging:25.0.1'";
    if (cfg.modResults.contents.includes(dep)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /dependencies\s*\{/,
      (m) => `${m}\n    ${dep}`,
    );
    return cfg;
  });


/**
 * Registers the bridge package with React Native.
 *
 * `MainApplication.kt` is regenerated by prebuild like everything else under
 * `android/`, so the registration has to be re-applied here rather than edited
 * in once. Idempotent: a second prebuild must not add the line twice.
 */
const withWidgetPackage = (config) =>
  withMainApplication(config, (cfg) => {
    const marker = 'PartnerWidgetPackage()';
    if (cfg.modResults.contents.includes(marker)) return cfg;

    /* Expo's template ships the seam as a commented example inside
       `PackageList(this).packages.apply { … }`. Anchoring on that comment is
       safer than matching the method signature, which has changed shape
       between SDK versions. */
    const anchor = '// add(MyReactNativePackage())';
    if (!cfg.modResults.contents.includes(anchor)) {
      throw new Error(
        '[withPartnerWidget] MainApplication template changed — the package ' +
          'registration seam was not found. Update the anchor in this plugin.',
      );
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      anchor,
      `${anchor}\n          add(${marker})`,
    );
    return cfg;
  });

module.exports = (config) =>
  withMessagingDependency(withWidgetPackage(withWidgetManifest(withWidgetSources(config))));
