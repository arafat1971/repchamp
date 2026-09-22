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
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WIDGET_CLASS = 'PartnerWidgetProvider';

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

    @ReactMethod
    fun setSnapshot(json: String) {
        val ctx = reactApplicationContext
        ctx.getSharedPreferences("repchamp.widget", Context.MODE_PRIVATE)
            .edit()
            .putString("repchamp.widget.partner.v1", json)
            .apply()

        // Nudge every placed instance; without this the launcher waits for its
        // own 30-minute cycle and the card looks stale right after a set.
        val manager = AppWidgetManager.getInstance(ctx)
        val ids = manager.getAppWidgetIds(ComponentName(ctx, ${WIDGET_CLASS}::class.java))
        if (ids.isNotEmpty()) {
            val intent = android.content.Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            intent.component = ComponentName(ctx, ${WIDGET_CLASS}::class.java)
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            ctx.sendBroadcast(intent)
        }
    }

    /** How many instances the athlete has actually placed. */
    @ReactMethod
    fun count(promise: com.facebook.react.bridge.Promise) {
        val ctx = reactApplicationContext
        val manager = AppWidgetManager.getInstance(ctx)
        promise.resolve(
            manager.getAppWidgetIds(ComponentName(ctx, ${WIDGET_CLASS}::class.java)).size
        )
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
<!-- RemoteViews-safe views only (LinearLayout, TextView, ImageView, View): a
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
            android:textColor="#A7F3D0"
            android:textSize="10sp"
            android:textStyle="bold"
            android:letterSpacing="0.14" />

        <View
            android:id="@+id/widget_dot"
            android:layout_width="7dp"
            android:layout_height="7dp"
            android:layout_marginEnd="5dp"
            android:background="@drawable/widget_dot" />

        <TextView
            android:id="@+id/widget_live"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="@string/widget_today"
            android:textColor="#4ADE80"
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
        android:textColor="#FFFFFF"
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
            android:paddingTop="7dp"
            android:paddingBottom="7dp"
            android:background="@drawable/widget_stat_bg">
            <TextView
                android:id="@+id/widget_their_days"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="4"
                android:textColor="#FFFFFF"
                android:textSize="20sp"
                android:textStyle="bold" />
            <TextView
                android:id="@+id/widget_their_label"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="@string/widget_partner_short"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="#BBF7D0"
                android:textSize="9sp" />
        </LinearLayout>

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginEnd="6dp"
            android:orientation="vertical"
            android:gravity="center"
            android:paddingTop="7dp"
            android:paddingBottom="7dp"
            android:background="@drawable/widget_stat_bg">
            <TextView
                android:id="@+id/widget_my_days"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="5"
                android:textColor="#FFFFFF"
                android:textSize="20sp"
                android:textStyle="bold" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="@string/widget_you"
                android:textColor="#BBF7D0"
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
            android:paddingTop="7dp"
            android:paddingBottom="7dp"
            android:background="@drawable/widget_stat_bg">
            <TextView
                android:id="@+id/widget_shared_days"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="3"
                android:textColor="#FDE047"
                android:textSize="20sp"
                android:textStyle="bold" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="@string/widget_together"
                android:textColor="#FDE68A"
                android:textSize="9sp" />
        </LinearLayout>
    </LinearLayout>

    <TextView
        android:id="@+id/widget_stale"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="@string/widget_stale"
        android:textColor="#FDE68A"
        android:textSize="9sp"
        android:visibility="gone" />
</LinearLayout>
`;

const INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/partner_widget"
    android:minWidth="180dp"
    android:minHeight="110dp"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/widget_description"
    android:previewLayout="@layout/partner_widget"
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
        android:startColor="#16A34A"
        android:endColor="#065f46"
        android:angle="315" />
    <corners android:radius="24dp" />
</shape>
`;

/* A translucent pill behind each stat, so the numbers read as deliberate
   objects rather than text floating on a gradient. */
const STAT_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#26FFFFFF" />
    <corners android:radius="14dp" />
</shape>
`;

/* The live dot — small, bright, and only drawn when the claim is about today. */
const DOT_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="#4ADE80" />
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

      write(path.join(javaDir, `${WIDGET_CLASS}.kt`), PROVIDER_KT(pkg));
      write(path.join(javaDir, 'PartnerWidgetModule.kt'), BRIDGE_KT(pkg));
      write(path.join(javaDir, 'PartnerWidgetPackage.kt'), PACKAGE_KT(pkg));
      write(path.join(res, 'layout/partner_widget.xml'), LAYOUT_XML);
      write(path.join(res, 'xml/partner_widget_info.xml'), INFO_XML);
      write(path.join(res, 'drawable/widget_bg.xml'), BG_XML);
      write(path.join(res, 'drawable/widget_stat_bg.xml'), STAT_BG_XML);
      write(path.join(res, 'drawable/widget_dot.xml'), DOT_XML);

      /* Strings are merged rather than overwritten — `strings.xml` already
         carries the app name and Expo's own entries. */
      const stringsPath = path.join(res, 'values/strings.xml');
      let xml = fs.existsSync(stringsPath)
        ? fs.readFileSync(stringsPath, 'utf8')
        : '<resources></resources>';
      for (const [name, value] of Object.entries(STRINGS)) {
        if (xml.includes(`name="${name}"`)) continue;
        const escaped = value.replace(/&/g, '&amp;').replace(/'/g, "\\'");
        xml = xml.replace('</resources>', `  <string name="${name}">${escaped}</string>\n</resources>`);
      }
      write(stringsPath, xml);

      return cfg;
    },
  ]);

/** Registers the provider so the launcher offers it in the widget picker. */
const withWidgetManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.receiver = app.receiver ?? [];

    const name = `.${WIDGET_CLASS}`;
    if (app.receiver.some((r) => r.$?.['android:name'] === name)) return cfg;

    app.receiver.push({
      $: { 'android:name': name, 'android:exported': 'false' },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/partner_widget_info',
          },
        },
      ],
    });

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
  withWidgetPackage(withWidgetManifest(withWidgetSources(config)));
