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
  {
    /* The 2 x 2 companion: reads the same payload as the scene. */
    id: 'glance',
    className: 'GlanceWidgetProvider',
    prefsKey: 'repchamp.widget.water.v1',
    layout: 'glance_widget',
    info: 'glance_widget_info',
    label: 'glance_label',
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

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) {
        render(context, manager, id)
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
        val views = RemoteViews(context.packageName, R.layout.partner_widget)
        val options = manager.getAppWidgetOptions(id)
        val wDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0).takeIf { it > 0 } ?: 250
        val hDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0).takeIf { it > 0 } ?: 180
        val density = context.resources.displayMetrics.density
        val cal = java.util.Calendar.getInstance()
        val hour = cal.get(java.util.Calendar.HOUR_OF_DAY) + cal.get(java.util.Calendar.MINUTE) / 60f
        views.setImageViewBitmap(R.id.widget_pane, SceneArt.drawPane(density, wDp, hDp, hour))

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
                views.setTextViewText(R.id.widget_counts, snap.optString("statsLine", ""))
                val strip = snap.optString("strip", "")
                views.setViewVisibility(R.id.widget_strip, if (strip.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE)
                if (strip.isNotEmpty()) {
                    views.setImageViewBitmap(
                        R.id.widget_strip,
                        SceneArt.drawWeekStrip(density, wDp - 24, 58, strip, snap.optString("letters", ""))
                    )
                }

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

        // Tapping opens Today, together — the two of you, live.
        val launch = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("repchamp://couple/partner"))
            .setPackage(context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        run {
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
        // The glance shares the water payload.
        if (widget == "water") GlanceWidgetProvider.refresh(ctx)
    }

    /**
     * Ask the launcher to place a widget — the system's own "add to home
     * screen" sheet. Resolves false where the launcher cannot pin (Android
     * before 8, or a launcher that opts out), so the app can fall back to
     * showing the gesture instead.
     */
    @ReactMethod
    fun requestPin(widget: String, promise: com.facebook.react.bridge.Promise) {
        val ctx = reactApplicationContext
        val provider = providerFor(widget)
        if (provider == null || android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) {
            promise.resolve(false)
            return
        }
        val manager = AppWidgetManager.getInstance(ctx)
        if (!manager.isRequestPinAppWidgetSupported) {
            promise.resolve(false)
            return
        }
        promise.resolve(manager.requestPinAppWidget(ComponentName(ctx, provider), null, null))
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
<!-- RemoteViews-safe views only (FrameLayout, LinearLayout, TextView,
     ImageView): a widget cannot host arbitrary layouts, and an unsupported
     view makes the whole thing fail to inflate rather than degrading.

     The glass and the week strip are painted bitmaps (SceneArt.drawPane and
     drawWeekStrip); the words stay real text, phrased by the app.

     Every field the provider fills carries a preview default, because the
     widget picker renders this layout raw — it never calls onUpdate. -->
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/widget_pane"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:contentDescription="@null"
        android:src="@drawable/week_pane_preview" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:paddingStart="14dp"
        android:paddingEnd="14dp"
        android:paddingTop="12dp"
        android:paddingBottom="10dp">

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
                android:text="@string/widget_week_title"
                android:textColor="#CCFFFFFF"
                android:textSize="10sp"
                android:textStyle="bold"
                android:letterSpacing="0.14" />

            <!-- ImageView, not View: a bare android.view.View is not allowed
                 in RemoteViews and fails the whole widget. -->
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
                android:textColor="#86EFAC"
                android:textSize="9sp"
                android:textStyle="bold"
                android:letterSpacing="0.1" />
        </LinearLayout>

        <!-- The sentence. This is what the athlete actually reads. -->
        <TextView
            android:id="@+id/widget_headline"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="3dp"
            android:text="@string/widget_preview_headline"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="#FFFFFF"
            android:textSize="16sp"
            android:textStyle="bold"
            android:shadowColor="#66000000"
            android:shadowRadius="4"
            android:shadowDy="1" />

        <LinearLayout
            android:id="@+id/widget_stats"
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1"
            android:orientation="vertical">

            <ImageView
                android:id="@+id/widget_strip"
                android:layout_width="match_parent"
                android:layout_height="0dp"
                android:layout_weight="1"
                android:layout_marginTop="4dp"
                android:scaleType="fitCenter"
                android:src="@drawable/week_strip_preview"
                android:contentDescription="@string/widget_week_strip" />

            <TextView
                android:id="@+id/widget_counts"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:gravity="center"
                android:text="@string/widget_preview_counts"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="#D9FFFFFF"
                android:textSize="10sp"
                android:textStyle="bold" />
        </LinearLayout>

        <!-- The reason-to-act line. Hidden when empty: filler trains the
             athlete to stop reading the line that does mean something. -->
        <TextView
            android:id="@+id/widget_nudge"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="4dp"
            android:gravity="center"
            android:text="@string/widget_preview_nudge"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="#FDE68A"
            android:textSize="11sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/widget_stale"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_gravity="center_horizontal"
            android:layout_marginTop="2dp"
            android:text="@string/widget_stale"
            android:textColor="#B3FFFFFF"
            android:textSize="9sp"
            android:visibility="gone" />
    </LinearLayout>
</FrameLayout>
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
const STRIP_PREVIEW_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- The week strip as the picker shows it: the picker renders the layout raw
     and never runs the painter, so a sample week is drawn here as a vector. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="280dp"
    android:height="58dp"
    android:viewportWidth="280"
    android:viewportHeight="58">
    <path android:fillColor="#FFA78BFA" android:pathData="M10.7,13.9a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#33FFFFFF" android:pathData="M10.7,34.8a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFFBBF24" android:pathData="M55.8,13.9h8.4v20.9h-8.4Z" />
    <path android:fillColor="#FFA78BFA" android:pathData="M50.7,13.9a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFF472B6" android:pathData="M50.7,34.8a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFFDE68A" android:pathData="M60.0,30.7C48.5,22.6 55.4,15.7 60.0,21.8C64.6,15.7 71.5,22.6 60.0,30.7Z" />
    <path android:fillColor="#33FFFFFF" android:pathData="M90.7,13.9a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFF472B6" android:pathData="M90.7,34.8a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#33FFFFFF" android:pathData="M130.7,13.9a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#33FFFFFF" android:pathData="M130.7,34.8a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFFBBF24" android:pathData="M175.8,13.9h8.4v20.9h-8.4Z" />
    <path android:fillColor="#FFA78BFA" android:pathData="M170.7,13.9a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFF472B6" android:pathData="M170.7,34.8a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFFDE68A" android:pathData="M180.0,30.7C168.5,22.6 175.4,15.7 180.0,21.8C184.6,15.7 191.5,22.6 180.0,30.7Z" />
    <path android:fillColor="#33FFFFFF" android:pathData="M210.7,13.9a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFF472B6" android:pathData="M210.7,34.8a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#26FFFFFF" android:pathData="M243.2,1h33.6v56.0h-33.6Z" />
    <path android:fillColor="#FFFBBF24" android:pathData="M255.8,13.9h8.4v20.9h-8.4Z" />
    <path android:fillColor="#FFA78BFA" android:pathData="M250.7,13.9a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFF472B6" android:pathData="M250.7,34.8a9.3,9.3 0 1,0 18.6,0a9.3,9.3 0 1,0 -18.6,0Z" />
    <path android:fillColor="#FFFDE68A" android:pathData="M260.0,30.7C248.5,22.6 255.4,15.7 260.0,21.8C264.6,15.7 271.5,22.6 260.0,30.7Z" />
</vector>
`;

/* The glass as the picker shows it — a smoky, rimmed pane; on the home screen
   the painter's liquid glass replaces it. */
const PANE_PREVIEW_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:startColor="#B3475569"
        android:endColor="#99334155"
        android:angle="270" />
    <stroke android:width="1dp" android:color="#80FFFFFF" />
    <corners android:radius="@dimen/widget_radius" />
</shape>
`;

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
  widget_week_title: 'YOUR WEEK TOGETHER',
  widget_week_strip: 'Who trained each day this week',
  widget_preview_counts: 'Alex 4 · You 5 · Together 3 🔥',
  widget_you: 'You',
  widget_together: 'Together',
  widget_empty: 'Pair with someone to see their week here.',
  widget_stale: 'Open RepChamp to refresh',
  widget_description: 'Seven days together, live — a gold heart for every day you both trained.',
  widget_preview_headline: 'You both trained today',
  widget_partner_short: 'Partner',
  widget_today: 'TODAY',
  widget_preview_nudge: '3 shared days this week',
  widget_label_week: 'Your week together',
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
      write(path.join(res, 'drawable/week_pane_preview.xml'), PANE_PREVIEW_XML);
      write(path.join(res, 'drawable/week_strip_preview.xml'), STRIP_PREVIEW_XML);
      write(path.join(res, 'drawable/widget_stat_bg.xml'), STAT_BG_XML);
      write(path.join(res, 'drawable/widget_dot.xml'), DOT_XML);
      write(path.join(res, 'values/widget_colors.xml'), COLORS_XML);
      write(path.join(res, 'values-night/widget_colors.xml'), COLORS_NIGHT_XML);
      write(path.join(res, 'values/widget_dimens.xml'), DIMENS_XML);
      write(path.join(res, 'values-v31/widget_dimens.xml'), DIMENS_V31_XML);

      /* The water widget's drawables and the FCM service that feeds it. */
      for (const file of water.OBSOLETE_RESOURCES) {
        fs.rmSync(path.join(res, file), { force: true });
      }
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
        const escaped = value.replace(/&/g, '&amp;').replace(/'/g, "\\'");
        const line = `<string name="${name}">${escaped}</string>`;
        const existing = new RegExp(`<string name="${name}">[^<]*</string>`);
        /* Replace, not skip: a string this plugin wrote before may have
           changed wording since, and a stale one would outlive the change. */
        xml = existing.test(xml)
          ? xml.replace(existing, line)
          : xml.replace('</resources>', `  ${line}\n</resources>`);
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
WIDGETS[2].provider = water.GLANCE_PROVIDER_KT;
WIDGETS[2].layoutXml = water.GLANCE_LAYOUT_XML;
WIDGETS[2].infoXml = water.GLANCE_INFO_XML;

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
