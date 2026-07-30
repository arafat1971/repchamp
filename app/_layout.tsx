import {
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
  installForegroundNudgeSuppressor,
  registerForPushNudges,
} from '@/lib/notifications';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { usePresenceHeartbeat } from '@/state/usePresenceHeartbeat';
import { useNotificationSync } from '@/state/useNotificationSync';
import { useRivalPassedAlert } from '@/state/useRivalPassedAlert';
import { fontFamily } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { preloadPoseModel } from '@/vision/modelCache';

// Hold the splash until fonts are ready, so the first frame never shows
// fallback system type in place of Plus Jakarta Sans.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
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

  // Tap handlers for local/push notifications.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      const type = data.type;
      if (type === 'weekly-recap') {
        router.push('/modal/recap');
      } else if (type === 'challenge' && typeof data.duelId === 'string') {
        router.push({ pathname: '/duel/[id]', params: { id: data.duelId, role: 'guest' } });
      } else if (type === 'rival-passed') {
        router.push('/(tabs)/friends');
      } else if (type === 'workout-reminder' || type === 'streak-reminder') {
        router.push('/(tabs)/train');
      } else if (type === 'couple-nudge') {
        router.push('/modal/couple-invite');
      }
    });
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
            {/* Matchmaking waiting room. A card, not a modal, so its own Cancel
                owns the exit and a stray swipe can't strand a pending duel. */}
            <Stack.Screen name="duel/new" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="duel/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="duel/queue" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
          <DialogHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
