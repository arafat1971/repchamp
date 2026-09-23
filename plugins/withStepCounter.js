/**
 * Android step counting, via the hardware sensor.
 *
 * `expo-sensors`' Pedometer gives `getStepCountAsync` on iOS only, and its
 * Android `watchStepCount` reports deltas *while subscribed* — which is why
 * steps shipped iPhone-only at first. This reads the sensor underneath,
 * `TYPE_STEP_COUNTER`, directly.
 *
 * Caveat, unverified: Android documents that this sensor "should only count
 * steps while the sensor listener is registered". This module registers only
 * for a one-shot read, so unless something else on the device keeps the sensor
 * active, steps walked between reads may not be counted. It is also subject to
 * Android 9+'s rule that background apps receive no sensor events, so it only
 * works while the app is in the foreground.
 *
 * The counter is cumulative since the device last booted, so it has no notion
 * of a day. `src/domain/stepBaseline.ts` owns that arithmetic — including the
 * reboot case, where the count resets and the pre-reboot steps are gone. This
 * module deliberately does none of that: it returns the raw reading and lets
 * the tested TypeScript decide what it means.
 *
 * Follows `withPartnerWidget`'s shape: the plugin writes the Kotlin during
 * prebuild, because `android/` is gitignored and regenerated.
 */

const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MODULE_CLASS = 'StepCounterModule';
const PACKAGE_CLASS = 'StepCounterPackage';

const MODULE_KT = (pkg) => `package ${pkg}

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * One reading of the hardware step counter.
 *
 * TYPE_STEP_COUNTER is an on-change sensor: it does not tick on a schedule, it
 * reports when the value changes. So a one-shot read registers, waits for the
 * first event, and unregisters. Whether the count advances while nothing is
 * registered is device-dependent and unverified here; Android documents that
 * it should only count while a listener is registered.
 */
class ${MODULE_CLASS}(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "StepCounter"

    private fun hasPermission(): Boolean {
        // ACTIVITY_RECOGNITION became a runtime permission in Android 10.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return reactApplicationContext.checkSelfPermission(
            android.Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
    }

    /** Whether this device has the sensor at all. */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        val manager =
            reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        promise.resolve(manager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)
    }

    @ReactMethod
    fun hasPermissionAsync(promise: Promise) {
        promise.resolve(hasPermission())
    }

    /**
     * Steps since the device booted, or a rejection naming why not.
     *
     * Rejects rather than resolving 0 for every failure: a zero is a claim
     * that the athlete has not moved, and the JS side turns each of these
     * reasons into its own honest line instead.
     */
    @ReactMethod
    fun readAsync(promise: Promise) {
        if (!hasPermission()) {
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

        /* SENSOR_DELAY_FASTEST so the first event arrives promptly — this is a
           one-shot read, not a subscription, so the rate costs nothing. */
        manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_FASTEST)

        /* An on-change sensor emits its current value on registration in
           practice, but the contract does not guarantee a deadline. Give up
           after three seconds rather than leaving the promise pending
           forever, which would hang the caller's await. */
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            if (!settled) {
                settled = true
                manager.unregisterListener(listener)
                promise.reject("E_TIMEOUT", "Step counter did not report in time")
            }
        }, 3000)
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

class ${PACKAGE_CLASS} : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = mutableListOf(${MODULE_CLASS}(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()
}
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
      const javaDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...pkg.split('.'),
      );
      write(path.join(javaDir, `${MODULE_CLASS}.kt`), MODULE_KT(pkg));
      write(path.join(javaDir, `${PACKAGE_CLASS}.kt`), PACKAGE_KT(pkg));
      return cfg;
    },
  ]);

/** ACTIVITY_RECOGNITION — required to read the counter from Android 10. */
const withPermission = (config) =>
  withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, [
      'android.permission.ACTIVITY_RECOGNITION',
    ]);
    return cfg;
  });

const withPackageRegistration = (config) =>
  withMainApplication(config, (cfg) => {
    const marker = `${PACKAGE_CLASS}()`;
    if (cfg.modResults.contents.includes(marker)) return cfg;

    /* Same seam the widget plugin uses: Expo ships the registration point as a
       commented example, and anchoring on that comment survives SDK changes to
       the surrounding method signature better than matching the signature. */
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

module.exports = (config) =>
  withPackageRegistration(withPermission(withSources(config)));
