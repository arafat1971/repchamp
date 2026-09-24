/**
 * Android step counting: a foreground service that keeps the step sensor on.
 *
 * Why a service. Android documents that TYPE_STEP_COUNTER "should only count
 * steps while the sensor listener is registered", and on the test Pixel 7a
 * nothing held it active — so a one-shot read from the app records only what
 * happened while something else happened to be listening. And since Android 9,
 * apps in the background receive no events from on-change sensors, so neither
 * a midnight job nor any background task can read it. Android's documented
 * answer for both is a foreground service: while it runs, the sensor stays
 * registered and the service is allowed to receive its events.
 *
 * What the service does, and deliberately no more:
 *   - holds the sensor registered, which is what makes the counter count
 *   - anchors the day's baseline at midnight using the last reading from
 *     before it, so the day's total is complete even if the app is not opened
 *     until the afternoon
 *   - detects a reboot by Android's boot count and marks that day partial
 *
 * All interpretation of the numbers — the day's total, the partial label, the
 * copy — stays in `src/domain/stepBaseline.ts`, which is tested. The service
 * and the app share one SharedPreferences entry for the baseline; its shape is
 * `StepBaseline` in that file, and a test asserts the keys agree.
 *
 * Cost, stated plainly: a persistent low-importance notification while it
 * runs, and a Play Console declaration for the `health` foreground service
 * type before release. It starts only once the athlete has granted
 * ACTIVITY_RECOGNITION, and can be turned off in Settings.
 *
 * Written by a config plugin because `android/` is gitignored and regenerated
 * by prebuild, like `withPartnerWidget`.
 */

const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/* Shared with src/services/pedometer.ts and asserted by a test there. */
const PREFS_FILE = 'repchamp.steps';
const BASELINE_KEY = 'baseline.v1';

const PREFS_KT = (pkg) => `package ${pkg}

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

/** Storage and checks shared by the service, the boot receiver and the bridge. */
object StepPrefs {
    const val FILE = "${PREFS_FILE}"
    const val BASELINE = "${BASELINE_KEY}"
    /** The latest reading the service saw: day, reading, boot. */
    const val LAST = "last.v1"
    /** Whether the athlete wants background counting. Read by the boot receiver. */
    const val ENABLED = "enabled"

    fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun hasPermission(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ctx.checkSelfPermission(android.Manifest.permission.ACTIVITY_RECOGNITION) ==
            PackageManager.PERMISSION_GRANTED
    }

    /** Android's boot count, or -1 when the device will not say. */
    fun bootCount(ctx: Context): Int =
        try {
            Settings.Global.getInt(ctx.contentResolver, Settings.Global.BOOT_COUNT)
        } catch (e: Exception) {
            -1
        }
}
`;

const SERVICE_KT = (pkg) => `package ${pkg}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject

/**
 * Keeps the step counter registered so it counts, and anchors each day.
 *
 * The sensor is registered with a five-minute report latency. The hardware
 * still counts every step; batching only delays delivery, which lets the main
 * processor sleep instead of waking per step. The counter is cumulative, so a
 * late batch loses nothing.
 */
class StepCounterService : Service(), SensorEventListener {

    private var manager: SensorManager? = null
    private var last: JSONObject? = null
    private var lastPersistedAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android 14 rejects a health-type service without the runtime permission.
        if (!StepPrefs.hasPermission(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val notification = buildNotification()
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            /* Started from the background (not allowed since Android 12), or the
               permission was revoked between the check and here. Nothing to count
               with, so stop rather than run without a notification. */
            stopSelf()
            return START_NOT_STICKY
        }
        register()
        return START_STICKY
    }

    private fun register() {
        if (manager != null) return
        val sensors = getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        val sensor = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (sensor == null) {
            stopSelf()
            return
        }
        sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL, MAX_REPORT_LATENCY_US)
        manager = sensors
    }

    override fun onSensorChanged(event: SensorEvent) {
        val reading = event.values.firstOrNull()?.toDouble() ?: return
        val boot = StepPrefs.bootCount(this)

        /* Which day the step happened on, from the event's own timestamp rather
           than the time it was delivered — a batch delivered at 00:03 can hold
           steps from 23:58, and those belong to yesterday. */
        val ageMs = ((SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1_000_000L).coerceAtLeast(0L)
        val day = dayOf(System.currentTimeMillis() - ageMs)

        val prefs = StepPrefs.prefs(this)
        val prev = last ?: parse(prefs.getString(StepPrefs.LAST, null))
        val baseline = parse(prefs.getString(StepPrefs.BASELINE, null))
        val baselineDay = baseline?.optString("day", "") ?: ""

        if (day > baselineDay) {
            prefs.edit().putString(StepPrefs.BASELINE, anchorForNewDay(day, reading, boot, prev).toString()).apply()
        } else if (day == baselineDay && baseline != null && boot >= 0) {
            val baselineBoot = baseline.optInt("boot", -1)
            if (baselineBoot == -1) {
                /* Written by the app, which does not know the boot count. Adopt
                   this boot without claiming anything about the day. */
                baseline.put("boot", boot)
                prefs.edit().putString(StepPrefs.BASELINE, baseline.toString()).apply()
            } else if (baselineBoot != boot) {
                /* Rebooted after steps were already counted today. Those are
                   gone; count from the reboot and mark the day partial. */
                val reanchored = JSONObject()
                    .put("day", day).put("reading", 0.0).put("partial", true).put("boot", boot)
                prefs.edit().putString(StepPrefs.BASELINE, reanchored.toString()).apply()
            }
        }

        val next = JSONObject().put("day", day).put("reading", reading).put("boot", boot)
        last = next
        val now = SystemClock.elapsedRealtime()
        if (now - lastPersistedAt > 60_000L || prev?.optString("day") != day) {
            prefs.edit().putString(StepPrefs.LAST, next.toString()).apply()
            lastPersistedAt = now
        }
    }

    /**
     * The first baseline of a new day.
     *
     * While the service runs, every step produces an event. So if the previous
     * event was in this same boot, no steps happened between it and midnight,
     * and its reading is the exact start of the day.
     */
    private fun anchorForNewDay(day: String, reading: Double, boot: Int, prev: JSONObject?): JSONObject {
        val anchor = JSONObject().put("day", day).put("boot", boot)
        val prevReading = prev?.optDouble("reading", -1.0) ?: -1.0
        val sameBoot = prev != null && boot >= 0 && prev.optInt("boot", -2) == boot
        val bootedToday = dayOf(System.currentTimeMillis() - SystemClock.elapsedRealtime()) == day
        return when {
            sameBoot && prevReading >= 0 && prevReading <= reading -> anchor.put("reading", prevReading)
            // The phone started today, so everything since boot is today's.
            bootedToday -> anchor.put("reading", 0.0)
            // No earlier reading to anchor on — the day starts here.
            else -> anchor.put("reading", reading)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onDestroy() {
        manager?.unregisterListener(this)
        manager = null
        last?.let { StepPrefs.prefs(this).edit().putString(StepPrefs.LAST, it.toString()).apply() }
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(CHANNEL_ID, "Step counting", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Shown while RepChamp counts your steps."
            channel.setShowBadge(false)
            nm.createNotificationChannel(channel)
        }
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val tap = if (launch != null) {
            PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        } else null
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_steps)
            .setContentTitle("Counting your steps")
            .setContentText("Keeps your daily total complete.")
            .setOngoing(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_SERVICE)
            .apply { if (tap != null) setContentIntent(tap) }
            .build()
    }

    private fun dayOf(epochMs: Long): String =
        Instant.ofEpochMilli(epochMs).atZone(ZoneId.systemDefault()).toLocalDate().toString()

    private fun parse(raw: String?): JSONObject? =
        if (raw == null) null else try { JSONObject(raw) } catch (e: Exception) { null }

    companion object {
        const val CHANNEL_ID = "step-counting"
        const val NOTIFICATION_ID = 4102
        const val MAX_REPORT_LATENCY_US = 300_000_000

        /** Start it, if the athlete wants it and has granted the permission. */
        fun start(ctx: Context): Boolean {
            if (!StepPrefs.hasPermission(ctx)) return false
            return try {
                ctx.startForegroundService(Intent(ctx, StepCounterService::class.java))
                true
            } catch (e: Exception) {
                false
            }
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, StepCounterService::class.java))
        }
    }
}
`;

const BOOT_KT = (pkg) => `package ${pkg}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts counting after a reboot or an app update.
 *
 * Both broadcasts are exempt from Android 12's ban on starting foreground
 * services from the background, and the health type is not among those
 * Android 15 bars from BOOT_COMPLETED. Only runs if the athlete left
 * background counting on.
 */
class StepCounterBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (!StepPrefs.prefs(context).getBoolean(StepPrefs.ENABLED, false)) return
        StepCounterService.start(context)
    }
}
`;

const MODULE_KT = (pkg) => `package ${pkg}

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** The app's view of the step counter: read it, and control the service. */
class StepCounterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "StepCounter"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        val manager =
            reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        promise.resolve(manager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)
    }

    @ReactMethod
    fun hasPermissionAsync(promise: Promise) {
        promise.resolve(StepPrefs.hasPermission(reactApplicationContext))
    }

    /**
     * Steps since the device booted, or a rejection naming why not.
     *
     * Rejects rather than resolving 0: a zero is a claim that the athlete has
     * not moved, and the JS side turns each reason into its own honest line.
     */
    @ReactMethod
    fun readAsync(promise: Promise) {
        if (!StepPrefs.hasPermission(reactApplicationContext)) {
            promise.reject("E_PERMISSION", "Activity recognition permission not granted")
            return
        }
        val manager =
            reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val sensor = manager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (manager == null || sensor == null) {
            promise.reject("E_NO_SENSOR", "No step counter on this device")
            return
        }
        var settled = false
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (settled) return
                settled = true
                manager.unregisterListener(this)
                promise.resolve(event.values.firstOrNull()?.toDouble() ?: 0.0)
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_FASTEST)
        // No guaranteed deadline for the first event; never leave the await hanging.
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            if (!settled) {
                settled = true
                manager.unregisterListener(listener)
                promise.reject("E_TIMEOUT", "Step counter did not report in time")
            }
        }, 3000)
    }

    /** The shared day baseline as JSON, or null. The service writes it too. */
    @ReactMethod
    fun getBaseline(promise: Promise) {
        promise.resolve(StepPrefs.prefs(reactApplicationContext).getString(StepPrefs.BASELINE, null))
    }

    @ReactMethod
    fun setBaseline(json: String) {
        StepPrefs.prefs(reactApplicationContext).edit().putString(StepPrefs.BASELINE, json).apply()
    }

    /** Turn background counting on. Resolves whether the service started. */
    @ReactMethod
    fun startService(promise: Promise) {
        val ctx = reactApplicationContext
        StepPrefs.prefs(ctx).edit().putBoolean(StepPrefs.ENABLED, true).apply()
        promise.resolve(StepCounterService.start(ctx))
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        val ctx = reactApplicationContext
        StepPrefs.prefs(ctx).edit().putBoolean(StepPrefs.ENABLED, false).apply()
        StepCounterService.stop(ctx)
        promise.resolve(true)
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

class StepCounterPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = mutableListOf(StepCounterModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()
}
`;

/* Status-bar icons must be a single-colour silhouette; Android tints it. Two
   footprints, drawn as ellipses so there is no raster asset to keep in sync. */
const ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M5,8.5a3,4.5 0,1 0,6 0a3,4.5 0,1 0,-6 0z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M6,16a2,2.5 0,1 0,4 0a2,2.5 0,1 0,-4 0z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M13,11a3,4.5 0,1 0,6 0a3,4.5 0,1 0,-6 0z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M14,18.5a2,2.5 0,1 0,4 0a2,2.5 0,1 0,-4 0z"/>
</vector>
`;

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, 'utf8');
}

const withSources = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) return cfg;
      const root = cfg.modRequest.platformProjectRoot;
      const javaDir = path.join(root, 'app/src/main/java', ...pkg.split('.'));
      write(path.join(javaDir, 'StepPrefs.kt'), PREFS_KT(pkg));
      write(path.join(javaDir, 'StepCounterService.kt'), SERVICE_KT(pkg));
      write(path.join(javaDir, 'StepCounterBootReceiver.kt'), BOOT_KT(pkg));
      write(path.join(javaDir, 'StepCounterModule.kt'), MODULE_KT(pkg));
      write(path.join(javaDir, 'StepCounterPackage.kt'), PACKAGE_KT(pkg));
      write(path.join(root, 'app/src/main/res/drawable/ic_stat_steps.xml'), ICON_XML);
      return cfg;
    },
  ]);

const withManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, [
      'android.permission.ACTIVITY_RECOGNITION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_HEALTH',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ]);

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);

    app.service = app.service ?? [];
    if (!app.service.some((s) => s.$?.['android:name'] === '.StepCounterService')) {
      app.service.push({
        $: {
          'android:name': '.StepCounterService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'health',
        },
      });
    }

    app.receiver = app.receiver ?? [];
    if (!app.receiver.some((r) => r.$?.['android:name'] === '.StepCounterBootReceiver')) {
      app.receiver.push({
        $: { 'android:name': '.StepCounterBootReceiver', 'android:exported': 'false' },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
            ],
          },
        ],
      });
    }
    return cfg;
  });

const withPackageRegistration = (config) =>
  withMainApplication(config, (cfg) => {
    const marker = 'StepCounterPackage()';
    if (cfg.modResults.contents.includes(marker)) return cfg;
    const anchor = '// add(MyReactNativePackage())';
    if (!cfg.modResults.contents.includes(anchor)) {
      throw new Error(
        '[withStepCounter] MainApplication template changed — the package ' +
          'registration seam was not found. Update the anchor in this plugin.',
      );
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      anchor,
      `${anchor}\n          add(${marker})`,
    );
    return cfg;
  });

module.exports = (config) => withPackageRegistration(withManifest(withSources(config)));
module.exports.PREFS_FILE = PREFS_FILE;
module.exports.BASELINE_KEY = BASELINE_KEY;
