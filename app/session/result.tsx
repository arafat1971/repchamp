import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PopOnChange } from '@/components/motion';
import { Confetti } from '@/components/session/Confetti';
import { PressableScale } from '@/components/ui';
import { getOpponent } from '@/domain/opponent';
import { playLoseSound, playWinSound } from '@/lib/feedback';
import { useProfileStore } from '@/state/profileStore';
import { useAuthStore } from '@/state/authStore';
import { useSessionStore } from '@/state/sessionStore';
import { getExercise } from '@/vision/exercises';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSessionStore();
  const recordSession = useProfileStore((s) => s.recordSession);

  // Persist exactly once — this screen re-renders on every store change, and a
  // second write would double-count XP and reps.
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

    // Publish the freshly-recorded profile + weekly score to the cloud so the
    // global leaderboard reflects this set. A local-only no-op until Firebase is
    // provisioned; failures are swallowed inside pushProfile, so a flaky network
    // never blocks the result screen.
    void useAuthStore.getState().pushProfile();
  }, [session, recordSession]);

  if (!session.config) {
    // Reached without a finished session — after a dev reload, a deep link, or a
    // crash that left this route on the stack. Returning null here would strand
    // the athlete on a blank screen, so send them home instead.
    return <Redirect href="/(tabs)" />;
  }

  const { mode, target, opponentId, exercise, opponentName } = session.config;
  const opponent = getOpponent(opponentId);
  const definition = getExercise(exercise);
  // A live duel has no bot opponentId — label the score with the real rival's
  // name captured during the match, falling back to the bot opponent otherwise.
  const opponentLabel = (opponentName || opponent.name).toUpperCase();

  const title =
    mode === 'practice'
      ? 'Nice session! 💪'
      : mode === 'solo'
        ? session.won
          ? 'Cleared! 🎯'
          : 'Not quite'
        : session.won
          ? 'You Win!'
          : 'Good effort';

  const subtitle =
    mode === 'practice'
      ? "One step completed. Small wins add up!"
      : mode === 'solo'
        ? session.won
          ? "Nice work showing up today. You're building consistency! 🔥"
          : 'Every effort moves you forward. Keep the streak alive!'
        : session.won
          ? 'Progress comes from consistent effort. Great work showing up today!'
          : 'Nice work showing up today — small wins add up!';

  const emoji = session.won ? '🏆' : exercise === 'squat' ? '🦵' : '💪';

  const rematch = () => {
    // A live duel (opponentName set, no bot opponentId) rematches via the picker
    // so the host can choose exercise/duration again and a new duel is created.
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

  const shareResult = async () => {
    try {
      await Share.share({
        message: `💪 Logged ${session.reps} ${definition.label} today! One step completed & building consistency on RepChamp. Small wins add up. 🔥 #RepChamp`,
      });
    } catch {
      // Swallowed
    }
  };

  return (
    <LinearGradient
      colors={session.won ? gradients.brandDeep : gradients.loss}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.root}
    >
      {session.won ? <Confetti /> : null}

      <Animated.View entering={FadeInDown.duration(480)} style={styles.content}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.scoreCard}>
          {mode === 'versus' ? (
            <>
              <ScoreColumn value={session.reps} label="YOU" />
              <Text style={styles.scoreDivider}>vs</Text>
              <ScoreColumn value={session.opponentReps} label={opponentLabel} dim />
            </>
          ) : mode === 'solo' ? (
            <>
              <ScoreColumn value={session.reps} label="YOUR REPS" />
              <Text style={styles.scoreDivider}>/</Text>
              <ScoreColumn value={target ?? 0} label="TARGET" dim />
            </>
          ) : (
            <ScoreColumn value={session.reps} label="REPS LOGGED" large />
          )}
        </View>

        <PopOnChange trigger={session.xpGained} scale={1.25}>
          <View style={styles.xpPill}>
            <Text style={font('extrabold', 16, { color: palette.green600 })}>
              ✨ +{session.xpGained} XP
            </Text>
          </View>
        </PopOnChange>

        {session.formReport ? (
          <Text style={styles.formLine}>
            {definition.hudLabel} · Form {session.formReport.score}/100 ·{' '}
            {session.formReport.fullDepthReps} full depth
          </Text>
        ) : null}
      </Animated.View>

      <View style={[styles.actions, { bottom: insets.bottom + 24 }]}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PressableScale
            onPress={() => router.push('/session/form-report')}
            accessibilityRole="button"
            accessibilityLabel="View form report"
            style={[styles.secondaryButton, { flex: 1 }]}
          >
            <Text style={styles.secondaryLabel}>📊 Form Report</Text>
          </PressableScale>
          <PressableScale
            onPress={shareResult}
            accessibilityRole="button"
            accessibilityLabel="Share workout achievement"
            style={[styles.secondaryButton, { flex: 1 }]}
          >
            <Text style={styles.secondaryLabel}>🚀 Share</Text>
          </PressableScale>
        </View>

        <View style={styles.actionRow}>
          <PressableScale
            onPress={rematch}
            accessibilityRole="button"
            accessibilityLabel="Rematch"
            style={[styles.actionButton, styles.rematchButton]}
          >
            <Text style={font('extrabold', 15, { color: palette.white })}>Rematch</Text>
          </PressableScale>
          <PressableScale
            onPress={done}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={[styles.actionButton, styles.doneButton]}
          >
            <Text style={font('extrabold', 15, { color: palette.ink })}>Done</Text>
          </PressableScale>
        </View>
      </View>
    </LinearGradient>
  );
}

function ScoreColumn({
  value,
  label,
  dim,
  large,
}: {
  value: number;
  label: string;
  dim?: boolean;
  large?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={font('extrabold', large ? 60 : 44, {
          color: dim ? 'rgba(255,255,255,0.85)' : palette.white,
        })}
      >
        {value}
      </Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { alignItems: 'center' },
  emoji: { fontSize: 88, lineHeight: 96 },
  title: {
    ...font('extrabold', 36, { color: palette.white }),
    letterSpacing: -0.7,
    marginTop: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...font('semibold', 14, { color: 'rgba(255,255,255,0.85)' }),
    marginTop: 4,
    textAlign: 'center',
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginVertical: 32,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius['5xl'],
    paddingVertical: 20,
    paddingHorizontal: 28,
  },
  scoreDivider: font('extrabold', 18, { color: 'rgba(255,255,255,0.6)' }),
  scoreLabel: font('bold', 11, { color: 'rgba(255,255,255,0.75)' }),
  xpPill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: radius['2xl'],
  },
  formLine: {
    ...text.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 14,
  },
  actions: { position: 'absolute', left: 24, right: 24, gap: 12 },
  secondaryButton: {
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: font('extrabold', 14, { color: palette.white }),
  actionRow: { flexDirection: 'row', gap: 12 },
  actionButton: {
    flex: 1,
    height: 56,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  rematchButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  doneButton: { backgroundColor: palette.white },
});
