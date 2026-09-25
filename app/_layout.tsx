import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DialogHost } from '@/components/ui/DialogHost';
import { prepareAudio, releaseAudio } from '@/lib/feedback';
import { identify, track } from '@/lib/analytics';
import { dayKey } from '@/domain/progression';
import { returnVisit } from '@/domain/retention';
import { storage } from '@/lib/storage';
import { initAppCheck } from '@/lib/appCheck';
import { initCrashReporting, setCrashUser } from '@/lib/crash';
import {
  CHALLENGE_ACTION_DECLINE,
  installForegroundNudgeSuppressor,
  registerForPushNudges,
} from '@/lib/notifications';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { usePresenceHeartbeat } from '@/state/usePresenceHeartbeat';
import { useChallengeInviteSync } from '@/state/useIncomingDuelCount';
import { useNotificationSync } from '@/state/useNotificationSync';
import { useRivalPassedAlert } from '@/state/useRivalPassedAlert';
import { fontFamily } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { flushCoupleCreditOutbox } from '@/services/coupleCreditOutbox';
import { cancelDuel } from '@/services/duelService';
import {
  resumePendingLiveSettles,
} from '@/services/liveResultSettle';
import { emitRetention, retentionSnapshot } from '@/services/recordSessionWithRetention';
import { AppState } from 'react-native';

import { selectTotalReps, useProfileStore } from '@/state/profileStore';
import { isWalled } from '@/domain/hardPaywall';
import { isPurchasesConfigured } from '@/services/purchases';
import { preloadPoseModel } from '@/vision/modelCache';
/** Persisted visit markers for `day_n_return` — nothing else recorded a date. */
const RETENTION_FIRST_DAY = 'retention.firstDay';
const RETENTION_LAST_SEEN = 'retention.lastSeenDay';

// Hold the splash until fonts are ready, so the first frame never shows
// fallback system type in place of Plus Jakarta Sans.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    [fontFamily.regular]: PlusJakartaSans_400Regular,
    [fontFamily.medium]: PlusJakartaSans_500Medium,
    [fontFamily.semibold]: PlusJakartaSans_600SemiBold,
    [fontFamily.bold]: PlusJakartaSans_700Bold,
    [fontFamily.extrabold]: PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    // Hide on error too — shipping with system fonts beats a permanent splash.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void prepareAudio();
    return releaseAudio;
  }, []);

  // Tap handlers for local/push notifications (cold start + foreground).
  useEffect(() => {
    /* Decline runs with `opensAppToForeground: false`, so on a cold start this
     * handler can fire before `initializeAuth` has a signed-in user — and the
     * duels rule requires `isAuthed()`, so the delete is rejected. Both this
     * call and `cancelDuel` swallow their errors, so the invite would simply
     * reappear on the next poll with nothing logged.
     *
     * Wait for `ready` (set on success *and* on failure, so this cannot hang
     * forever) before deleting, and give up after 10s rather than holding a
     * subscription open on a launch that never authenticates. */
    const declineChallenge = async (duelId: string) => {
      const auth = useAuthStore.getState();
      if (!auth.ready) {
        const authed = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            unsub();
            resolve(false);
          }, 10_000);
          const unsub = useAuthStore.subscribe((s) => {
            if (!s.ready) return;
            clearTimeout(timer);
            unsub();
            resolve(true);
          });
        });
        if (!authed) return;
      }
      await cancelDuel(duelId).catch(() => {});
    };

    const routeFromData = (data: Record<string, unknown>) => {
      const type = data.type;
      /* Delivery is not engagement: this fires only when a nudge is actually
         tapped, which is the number that says whether the reminders earn their
         interruption or quietly train people to swipe them away. */
      if (typeof type === 'string') track('notification_opened', { kind: type });
      if (type === 'weekly-recap') {
        router.push('/modal/recap');
      } else if (type === 'challenge' && typeof data.duelId === 'string') {
        router.push({ pathname: '/duel/[id]', params: { id: data.duelId, role: 'guest' } });
      } else if (type === 'rival-passed') {
        router.push('/(tabs)/friends');
      } else if (
        type === 'workout-reminder' ||
        type === 'streak-reminder' ||
        type === 'dormant-reminder'
      ) {
        /* A reminder must not open a sales page.
         *
         * "Time to train" is the app asking for something; landing a walled
         * athlete on the paywall turns that into a pitch they did not ask for,
         * which is a worse thing to send someone than nothing at all. Home
         * still shows the wall and the way past it, and couple mode is right
         * there and never walled.
         *
         * `dormant-reminder` belongs here rather than in a branch of its own.
         * It shipped emitting its type with no arm in this chain at all, so a
         * tap fell through to no `router.push` and the athlete landed on
         * whatever screen was already mounted — the one person the slot exists
         * for getting the worst result of anyone. It is the same promise as the
         * other two ("come and train"), so it gets the same destination and the
         * same walled check; and since its copy is specifically about progress
         * already banked, dropping a lapsed athlete on a paywall instead is the
         * sharpest possible version of the mistake this branch guards. */
        const walled = isWalled({
          isPro: useProStore.getState().isPro,
          repsSoFar: selectTotalReps(useProfileStore.getState()),
          billingReady: isPurchasesConfigured(),
        });
        router.push(
          walled
            ? '/(tabs)'
            : { pathname: '/session', params: { exercise: 'push', mode: 'practice' } },
        );
      } else if (type === 'hydration-reminder') {
        /* Home, not a session. The water card is on Home and logging a glass
           is a one-tap action there — sending someone to the camera because
           they are behind on drinking would be answering a question nobody
           asked.

           Explicitly routed rather than left to fall through, which is the
           exact bug `dormant-reminder` shipped with above: a type emitted
           with no arm in this chain lands the athlete on whatever screen was
           already mounted. */
        router.push('/(tabs)');
      } else if (type === 'ritual-reminder') {
        /* Straight to the ritual: the ticks that are left are on that screen. */
        router.push('/couple/partner');
      } else if (type === 'couple-nudge') {
        router.push('/modal/couple-invite');
      }
    };

    const seen = new Set<string>();
    const handle = (response: Notifications.NotificationResponse) => {
      const key = response.notification.request.identifier;
      if (seen.has(key)) return;
      seen.add(key);
      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;

      /* Declining from the shade must not open the duel. Without this the
         action button fell through to the default tap route, so "Decline"
         did exactly what "Accept" did. Dismiss the challenge and stop. */
      if (response.actionIdentifier === CHALLENGE_ACTION_DECLINE) {
        // Same server call the inbox's Decline makes: drop the pending doc so
        // the invite does not come back on the next poll.
        if (typeof data.duelId === 'string') void declineChallenge(data.duelId);
        return;
      }

      routeFromData(data);
    };

    // Kill-state taps never hit the listener — read the last response once.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handle(response);
      void Notifications.clearLastNotificationResponseAsync();
    });
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [router]);

  // Establish the (anonymous) account and start cloud sync. Await App Check
  // first so early profile writes aren't rejected once enforcement is on.
  // A no-op that just marks itself ready when Firebase isn't provisioned yet.
  const initializeAuth = useAuthStore((s) => s.initialize);
  useEffect(() => {
    let cancelled = false;
    let stopAuth: (() => void) | undefined;
    void (async () => {
      await initAppCheck();
      if (cancelled) return;
      stopAuth = initializeAuth();
    })();
    return () => {
      cancelled = true;
      stopAuth?.();
    };
  }, [initializeAuth]);

  useEffect(() => {
    initCrashReporting();
    track('app_opened');

    /* First open of a calendar day, with `dayN` counted from install so D1/D7
       are computable. `app_opened` fires on every foreground, which conflates
       one commuter checking four times with four separate people; this fires
       once a day. The install-day open is included deliberately — `dayN: 0` is
       the baseline every retention ratio is divided by. */
    {
      const today = dayKey();
      const stored = storage.getString(RETENTION_FIRST_DAY);
      const firstDay = stored ?? today;
      if (!stored) storage.set(RETENTION_FIRST_DAY, today);

      const visit = returnVisit(firstDay, storage.getString(RETENTION_LAST_SEEN) ?? null);
      if (visit) {
        track('day_n_return', visit);
        storage.set(RETENTION_LAST_SEEN, today);
      }
    }
    // Warm MoveNet after first paint so session camera is not blocked on load.
    void preloadPoseModel().catch(() => {
      // Session hook retries; a failed preload must not crash the shell.
    });
  }, []);

  // Low-volume local reminders (≤1/day workout or streak + weekly summary).
  useNotificationSync();
  useRivalPassedAlert();
  // Challenge inbox banners + badge — app-wide, not Home-focus-gated.
  useChallengeInviteSync();

  // Once signed in, register this device for push nudges so a partner's poke can
  // reach it even when closed. No-ops until Firebase is provisioned.
  const uid = useAuthStore((s) => s.user?.uid);
  const initializePro = useProStore((s) => s.initialize);
  const refreshPro = useProStore((s) => s.refresh);
  usePresenceHeartbeat(uid);

  /* Re-check the entitlement whenever the app comes back to the foreground.
   *
   * RevenueCat's listener fires on purchases and renewals, but a subscription
   * that lapses while the app is closed produces no event — nothing happens, so
   * nothing is delivered. Without this the athlete keeps Pro until something
   * else forces a fetch, which for a locked exercise could be days.
   *
   * `refresh()` already existed and was never called from anywhere in the app.
   * It is one cached read on resume, and it fails closed via the store. */
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPro();
    });
    return () => sub.remove();
  }, [uid, refreshPro]);
  useEffect(() => {
    if (!uid) return;
    // Tie analytics + crash reports to this athlete across sessions.
    identify(uid);
    setCrashUser(uid);
    const stopTokenSync = registerForPushNudges(uid);
    const stopSuppressor = installForegroundNudgeSuppressor();
    // Configure billing and start following the live Pro entitlement.
    const stopPro = initializePro(uid);
    // Retry couple credits that failed while the session screen was open.
    void flushCoupleCreditOutbox();
    // Re-arm live-duel XP settles that survived process death.
    resumePendingLiveSettles((item, bank) => {
      if (useAuthStore.getState().user?.uid !== item.uid) return false;
      // A duel banked on cold resume is a real training day: it extends a real
      // streak and can move a real league. Snapshot before the write — after it
      // the state would be compared with itself and report nothing.
      const before = retentionSnapshot();
      useProfileStore.getState().recordSession({
        exercise: item.record.exercise,
        mode: item.record.sessionMode,
        reps: item.record.reps,
        opponentReps:
          item.record.sessionMode === 'versus' ? bank.opponentReps : null,
        opponentId: bank.opponentId ?? item.record.opponentId ?? null,
        target: item.record.target,
        won: bank.won,
        drew: bank.drew,
        xp: bank.xp,
        formScore: item.record.formScore,
        durationSec: item.record.durationSec,
      });
      emitRetention(before.days, before.league);
      void useAuthStore.getState().pushProfile();
      return true;
    });
    return () => {
      stopTokenSync();
      stopSuppressor();
      stopPro();
    };
  }, [uid, initializePro]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.canvas },
            }}
          >
            <Stack.Screen name="(tabs)" />
            {/* The widget's quick-drink button lands here, logs, and returns Home. */}
            <Stack.Screen name="drink" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="splash" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="react" options={{ animation: 'fade' }} />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            {/* The session flow owns the camera and must not be swipe-dismissed
                mid-set, which would strand the camera in an active state. */}
            <Stack.Screen
              name="session"
              options={{ gestureEnabled: false, animation: 'fade' }}
            />
            {/* Nested duel stack (new / waiting / queue) — ErrorBoundary lives in
                app/duel/_layout. Card presentation so Cancel owns the exit. */}
            <Stack.Screen name="duel" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            {/* Couple stack — the bond tracker plus the `?code=` join landing.
                Declared so the tracker gets a normal push animation; `join`
                only ever redirects, like `[handle]`. */}
            <Stack.Screen name="couple" />
            {/* `/@username` friend invites. Declared last and rendered without
                animation because it only ever redirects — it is a landing pad for
                the deep link, never a screen anyone should see slide in. Static
                routes above still win the match, so this cannot shadow them. */}
            <Stack.Screen name="[handle]" options={{ animation: 'none' }} />
          </Stack>
          <DialogHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
