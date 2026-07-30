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
  cancelDailyTrainingReminder,
  installForegroundNudgeSuppressor,
  registerForPushNudges,
  scheduleDailyTrainingReminder,
  scheduleWeeklyRecap,
} from '@/lib/notifications';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { useSettingsStore } from '@/state/settingsStore';
import { fontFamily } from '@/theme/typography';
import { palette } from '@/theme/tokens';

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

  // Tap handlers for local/push notifications — weekly recap opens the recap modal.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type;
      if (type === 'weekly-recap') {
        router.push('/modal/recap');
      }
    });
    return () => sub.remove();
  }, [router]);

  // Establish the (anonymous) account and start cloud sync. A no-op that just
  // marks itself ready when Firebase isn't provisioned yet.
  const initializeAuth = useAuthStore((s) => s.initialize);
  useEffect(() => initializeAuth(), [initializeAuth]);

  useEffect(() => {
    initCrashReporting();
    // Attest this install before the first cloud write, so scores can't be
    // spoofed by a script holding the public config. No-ops when unconfigured.
    void initAppCheck();
    track('app_opened');
    // Draw the athlete back each week to their recap. Idempotent — the fixed id
    // means re-scheduling on every launch replaces rather than stacks.
    void scheduleWeeklyRecap();
  }, []);

  // Keep the solo daily reminders in step with the setting: (re)arm the three
  // fixed schedules while enabled, clear them when off. Fixed ids mean launching
  // repeatedly just refreshes rather than stacks.
  const dailyReminder = useSettingsStore((s) => s.dailyReminder);
  useEffect(() => {
    if (dailyReminder) void scheduleDailyTrainingReminder();
    else void cancelDailyTrainingReminder();
  }, [dailyReminder]);

  // Once signed in, register this device for push nudges so a partner's poke can
  // reach it even when closed. No-ops until Firebase is provisioned.
  const uid = useAuthStore((s) => s.user?.uid);
  const initializePro = useProStore((s) => s.initialize);
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
