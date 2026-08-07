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
import { useProfileStore } from '@/state/profileStore';
import { preloadPoseModel } from '@/vision/modelCache';

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
      if (type === 'weekly-recap') {
        router.push('/modal/recap');
      } else if (type === 'challenge' && typeof data.duelId === 'string') {
        router.push({ pathname: '/duel/[id]', params: { id: data.duelId, role: 'guest' } });
      } else if (type === 'rival-passed') {
        router.push('/(tabs)/friends');
      } else if (type === 'workout-reminder' || type === 'streak-reminder') {
        router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
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
  usePresenceHeartbeat(uid);
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
