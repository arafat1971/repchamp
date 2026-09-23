# iOS daily widget — the remaining manual step

The Swift for the "Today" widget is written by `plugins/withDailyWidgetIOS.js`
on every `expo prebuild`, into `ios/RepChampDailyWidget/`. It is
version-controlled through the plugin, so a prebuild never loses it.

**The Xcode target is not created by the plugin, and that is deliberate.**

## Why

Two things block it, and neither can be faked:

1. **The target itself.** Adding an App Extension target means rewriting
   `project.pbxproj` — an undocumented format where a malformed edit corrupts
   the project rather than failing loudly. A plugin that got this subtly wrong
   would break the iOS build on a machine that is not this one, at a moment
   nobody is looking at it.

2. **The App Group.** An extension runs in its own process with its own
   container, so `UserDefaults.standard` in the widget is *not* the app's. The
   payload crosses through an App Group suite
   (`group.gg.repchamp.app`), and registering an App Group requires an Apple
   Developer team. `app.json` has no `appleTeamId` and the Xcode project has
   no `DEVELOPMENT_TEAM`, so any target written today could not be signed.

Until the group is registered, `SnapshotStore.defaults()` falls back to
`UserDefaults.standard`. The widget therefore **builds and renders**, showing
its preview data — it simply never sees the app's real numbers. That is the
one inert step.

## Steps, once a team id exists

1. Add `"appleTeamId": "XXXXXXXXXX"` under `expo.ios` in `app.json`.
2. In the Apple Developer portal, register the App Group
   `group.gg.repchamp.app` and add it to both the app id and the widget's.
3. In Xcode: **File → New → Target → Widget Extension**, named
   `RepChampDailyWidget`. Uncheck "Include Configuration Intent".
4. Delete the stub files Xcode generates and add the plugin-written ones from
   `ios/RepChampDailyWidget/` to the target instead.
5. Set the target's entitlements file to the plugin-written
   `RepChampDailyWidget.entitlements`, and enable **App Groups** on *both*
   the app target and the widget target.
6. Add the same App Group capability to the main app target, or the app can
   write a payload the widget will never read.

Alternatively, `expo-apple-targets` automates 3–5 once a team id is set;
it still needs steps 1 and 2 done by hand.

## Where the logic lives

Nothing in the Swift decides what the athlete reads. Every label, threshold
and piece of copy comes from `src/domain/dashboardSnapshot.ts`, which is unit
tested — a string built in Swift cannot be tested from this repo, which is why
`buildDashboardSnapshot` returns pre-formatted strings rather than raw numbers.

The payload key (`repchamp.widget.dashboard.v1`) is duplicated between the
plugin and the domain module by necessity; a test asserts they agree.

## Verifying without a team id

The widget can still be built and previewed against the Simulator, which needs
no signing:

```bash
xcodebuild -workspace ios/RepChamp.xcworkspace -scheme RepChampDailyWidget -sdk iphonesimulator -configuration Debug build
```

It will render `DashboardSnapshot.preview` — the same values the widget
gallery shows — which exercises the layout, the rings and the stale branch,
but not the app→widget bridge.
