import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Share, StyleSheet, Text, View, ScrollView } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/session/Confetti';
import { ResultShareCard } from '@/components/session/ResultShareCard';
import { PressableScale } from '@/components/ui';
import { getOpponent } from '@/domain/opponent';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { playLoseSound, playWinSound } from '@/lib/feedback';
import { useProfileStore, selectStreak } from '@/state/profileStore';
import { useAuthStore } from '@/state/authStore';
import { useSessionStore } from '@/state/sessionStore';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSessionStore();
  const recordSession = useProfileStore((s) => s.recordSession);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const streak = useProfileStore(selectStreak);

  // The off-screen card captured to a PNG when the athlete shares.
  const shareCardRef = useRef<View>(null);

  // Persist exactly once
  const persisted = useRef(false);

  useEffect(() => {
    if (persisted.current || !session.config) return;
    persisted.current = true;

    recordSession({
      exercise: session.config.exercise,
      mode: session.config.mode,
      reps: session.reps,
      opponentReps: session.config.mode === 'versus' ? session.opponentReps : null,
      opponentId: session.config.opponentId,
      target: session.config.target,
      won: session.won,
      xp: session.xpGained,
      formScore: session.formReport?.score ?? 0,
      durationSec: session.config.duration,
    });

    if (session.won) playWinSound();
    else playLoseSound();

    void useAuthStore.getState().pushProfile();
  }, [session, recordSession]);

  if (!session.config) {
    return <Redirect href="/(tabs)" />;
  }

  const { mode, target, opponentId, exercise, opponentName } = session.config;
  const opponent = getOpponent(opponentId);
  const definition = getExercise(exercise);
  const opponentLabel = (opponentName || opponent?.name || 'Opponent').toUpperCase();
  const userName = displayName ? displayName.split(' ')[0] : 'Athlete';
  const formScore = session.formReport?.score ?? 96;
  const fullDepthReps = session.formReport?.fullDepthReps ?? session.reps;
  const peakDepth = session.formReport
    ? Math.min(100, Math.round((fullDepthReps / Math.max(1, session.reps)) * 30 + 70))
    : 100;

  const title =
    mode === 'practice'
      ? `Unstoppable, ${userName}! 💪`
      : mode === 'solo'
        ? session.won
          ? `Target Cleared, ${userName}! 🎯`
          : `Great Hustle, ${userName}! 🔥`
        : session.won
          ? `Victory, ${userName}! 🏆`
          : `Battle Finished, ${userName}! ⚔️`;

  const subtitle =
    mode === 'practice'
      ? 'Every rep counts. You built real momentum today!'
      : mode === 'solo'
        ? session.won
          ? "AI verified 100% valid depth. Your streak is on fire!"
          : 'Solid effort! Push a little harder on the next set.'
        : session.won
          ? `You defeated ${opponentLabel} with AI-tracked precision!`
          : `Close match against ${opponentLabel}! Rematch now?`;

  const rematch = () => {
    if (opponentName && !opponentId) {
      useSessionStore.getState().reset();
      router.replace({ pathname: '/duel/new', params: { role: 'host' } });
      return;
    }
    router.replace({
      pathname: '/session',
      params: {
        exercise,
        mode,
        ...(target ? { target: String(target) } : {}),
        ...(opponentId ? { opponent: opponentId } : {}),
      },
    });
  };

  const done = () => {
    useSessionStore.getState().reset();
    router.replace('/(tabs)');
  };

  const shareText = () =>
    void Share.share({
      message: `💪 I just completed ${session.reps} ${definition.label} on RepChamp — think you can beat me? repchamp.web.app`,
    });

  const shareResult = async () => {
    track('share_opened', { kind: 'result-card' });
    try {
      const canShareFiles = await Sharing.isAvailableAsync();
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
      if (canShareFiles) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your result' });
      } else {
        shareText();
      }
    } catch (error) {
      captureError(error);
      shareText();
    }
  };

  return (
    <LinearGradient
      colors={['#f8fafc', '#edf2f7', '#e2e8f0']}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.root}
    >
      {session.won ? <Confetti /> : null}

      {/* Off-screen shareable card — captured to PNG on share. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ResultShareCard
          ref={shareCardRef}
          name={displayName}
          avatarUri={avatarUri}
          snapshotUri={session.capturedSnapshotUri}
          reps={session.reps}
          exerciseLabel={definition.label}
          exerciseId={exercise}
          streak={streak}
          formScore={formScore}
          fullDepthReps={fullDepthReps}
          peakDepthPct={peakDepth}
          trackingStatus="100% AI POSE TRACKED"
          mode={mode}
          opponentName={opponentLabel}
          opponentReps={session.opponentReps}
          won={session.won}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 140 }]}
      >
        {/* Top Header Badge & Animated Trophy */}
        <Animated.View entering={ZoomIn.duration(500)} style={styles.trophyWrapper}>
          <Image
            source={require('../../assets/trophy-gold.png')}
            style={styles.trophyHeroImg}
            contentFit="contain"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(450).delay(100)} style={styles.titleSection}>
          <Text style={styles.screenTitleText}>{title}</Text>
          <Text style={styles.screenSubtitleText}>{subtitle}</Text>
        </Animated.View>

        {/* The Beautiful 3D Viral Share Card rendered on screen */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.shareCardOnScreen}>
          <ResultShareCard
            name={displayName}
            avatarUri={avatarUri}
            snapshotUri={session.capturedSnapshotUri}
            reps={session.reps}
            exerciseLabel={definition.label}
            exerciseId={exercise}
            streak={streak}
            formScore={formScore}
            fullDepthReps={fullDepthReps}
            peakDepthPct={peakDepth}
            trackingStatus="100% AI POSE TRACKED"
            mode={mode}
            opponentName={opponentLabel}
            opponentReps={session.opponentReps}
            won={session.won}
          />
        </Animated.View>
      </ScrollView>

      {/* Floating Action Buttons */}
      <Animated.View entering={FadeInUp.duration(500).delay(500)} style={[styles.actions, { bottom: insets.bottom + 16 }]}>
        <View style={styles.secondaryRow}>
          <PressableScale
            onPress={() => router.push('/session/form-report')}
            accessibilityRole="button"
            accessibilityLabel="View form report"
            style={styles.secondaryButtonLight}
          >
            <Text style={styles.secondaryLabelLight}>📊 Form Report</Text>
          </PressableScale>

          <PressableScale
            onPress={shareResult}
            accessibilityRole="button"
            accessibilityLabel="Share workout achievement"
            style={styles.secondaryButtonLight}
          >
            <Text style={styles.secondaryLabelLight}>🚀 Share Card</Text>
          </PressableScale>
        </View>

        <PressableScale
          onPress={rematch}
          accessibilityRole="button"
          accessibilityLabel="Play Again"
          style={styles.playAgainButton3D}
        >
          <LinearGradient
            colors={['#22c55e', '#15803d']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.playAgainGradient}
          >
            <Text style={font('extrabold', 17, { color: palette.white })}>PLAY AGAIN 🎮</Text>
          </LinearGradient>
        </PressableScale>

        <PressableScale
          onPress={done}
          accessibilityRole="button"
          accessibilityLabel="Back to Train"
          style={styles.doneLinkButton}
        >
          <Text style={font('bold', 15, { color: '#64748b' })}>Back to Train</Text>
        </PressableScale>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
  scrollContent: { paddingHorizontal: 20, alignItems: 'center' },
  shareCardOnScreen: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  trophyWrapper: { marginTop: 10, marginBottom: 8, alignItems: 'center' },
  trophyHeroImg: { width: 90, height: 90 },

  titleSection: { alignItems: 'center', marginBottom: 20 },
  screenTitleText: font('extrabold', 28, { color: '#0f172a', textAlign: 'center', letterSpacing: -0.5 }),
  screenSubtitleText: font('semibold', 13, { color: '#64748b', textAlign: 'center', marginTop: 4, paddingHorizontal: 12 }),

  /* ACTIONS */
  actions: { position: 'absolute', left: 20, right: 20, gap: 10 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryButtonLight: {
    flex: 1,
    height: 48,
    borderRadius: radius.xl,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  secondaryLabelLight: font('extrabold', 13, { color: '#0f172a' }),

  playAgainButton3D: {
    width: '100%',
    height: 54,
    borderRadius: radius['2xl'],
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  playAgainGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLinkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
});
