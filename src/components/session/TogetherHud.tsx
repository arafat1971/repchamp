import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PopOnChange } from '@/components/motion';
import { PressableScale } from '@/components/ui';
import { getExercise, type ExerciseId } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

function formatClock(seconds: number): string {
  return `0:${String(Math.max(0, seconds)).padStart(2, '0')}`;
}

/**
 * The heads-up display for a couple's together set.
 *
 * Deliberately *not* a tug-of-war like `DuelHud`: nobody is competing, so the
 * hero number is the pair's **combined** total and neither side can "win" the
 * bar. Each partner still sees both counts — that's the accountability — but the
 * framing is one shared score, which is the whole point of the mode.
 */
export function TogetherHud({
  exercise,
  reps,
  partnerReps,
  partnerName,
  partnerConnected,
  timeLeft,
  tracking,
  inSync,
  streak,
  formCue,
  onEnd,
}: {
  exercise: ExerciseId;
  reps: number;
  partnerReps: number;
  partnerName: string;
  /** False until the partner's device starts streaming reps. */
  partnerConnected: boolean;
  timeLeft: number;
  tracking: boolean;
  /** True while both partners are actively repping — drives the glow. */
  inSync: boolean;
  /** Days in a row you have both trained. */
  streak: number;
  formCue: string;
  onEnd: () => void;
}) {
  const insets = useSafeAreaInsets();
  const definition = getExercise(exercise);
  const combined = reps + partnerReps;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.top, { top: insets.top + 14 }]} pointerEvents="box-none">
        <View style={styles.heading}>
          <Text style={styles.title}>{definition.hudLabel} · TOGETHER</Text>
          <Text style={styles.sub}>
            {streak > 0 ? `🔥 ${streak} DAY STREAK` : 'TRAIN TOGETHER TO START A STREAK'}
          </Text>
        </View>

        <View style={[styles.scoreBar, inSync && styles.scoreBarSynced]}>
          <View style={styles.side}>
            <Text style={styles.sideLabelYou}>YOU</Text>
            <PopOnChange trigger={reps} scale={1.2}>
              <Text style={font('extrabold', 26, { color: palette.green500 })}>{reps}</Text>
            </PopOnChange>
          </View>

          <View style={{ alignItems: 'center' }}>
            <Text style={font('extrabold', 20, { color: palette.white })}>
              {formatClock(timeLeft)}
            </Text>
            <Text style={styles.clockLabel}>LEFT</Text>
          </View>

          <View style={[styles.side, { alignItems: 'flex-end' }]}>
            <Text style={styles.sideLabel} numberOfLines={1}>
              {partnerName.toUpperCase()}
            </Text>
            {partnerConnected ? (
              <PopOnChange trigger={partnerReps} scale={1.2}>
                <Text style={font('extrabold', 26, { color: palette.purple500 })}>
                  {partnerReps}
                </Text>
              </PopOnChange>
            ) : (
              <Text style={font('extrabold', 20, { color: 'rgba(255,255,255,0.35)' })}>—</Text>
            )}
          </View>
        </View>
      </View>

      {/* The shared score — the reason the mode exists. */}
      <View style={styles.combinedWrap} pointerEvents="none">
        <Text style={styles.combinedLabel}>TOGETHER</Text>
        <PopOnChange trigger={combined} scale={1.16}>
          <Text style={styles.combinedValue}>{combined}</Text>
        </PopOnChange>
        {inSync ? (
          <Animated.View entering={FadeIn.duration(180)} style={styles.syncPill}>
            <Text style={styles.syncText}>IN SYNC ⚡</Text>
          </Animated.View>
        ) : null}
      </View>

      {!partnerConnected ? (
        <View style={[styles.waiting, { bottom: insets.bottom + 190 }]} pointerEvents="none">
          <Text style={styles.waitingText}>Waiting for {partnerName} to start…</Text>
        </View>
      ) : null}

      <View style={[styles.trackingChip, { bottom: insets.bottom + 150 }]} pointerEvents="none">
        <View
          style={[
            styles.trackingDot,
            { backgroundColor: tracking ? palette.green500 : palette.amber500 },
          ]}
        />
        <Text style={styles.trackingText}>{tracking ? 'TRACKING' : 'STEP BACK INTO FRAME'}</Text>
      </View>

      {formCue ? (
        <Animated.View
          key={formCue + reps}
          entering={FadeIn.duration(200)}
          style={[styles.cue, { bottom: insets.bottom + 118 }]}
          pointerEvents="none"
        >
          <Text style={styles.cueText}>{formCue}</Text>
        </Animated.View>
      ) : null}

      <PressableScale
        onPress={onEnd}
        accessibilityRole="button"
        accessibilityLabel="End the together set"
        style={[styles.end, { bottom: insets.bottom + 44 }]}
      >
        <Text style={styles.endText}>⚑ End Set</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 16, right: 16 },
  heading: { alignItems: 'center', marginBottom: 8 },
  title: {
    ...font('extrabold', 18, { color: palette.white }),
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 12,
  },
  sub: { ...font('extrabold', 9, { color: palette.green300 }), letterSpacing: 2, marginTop: 4 },
  scoreBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(9,14,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius['3xl'],
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  // Both partners repping — the bar picks up the accent so it reads at a glance.
  scoreBarSynced: {
    borderColor: 'rgba(34,197,94,0.65)',
    backgroundColor: 'rgba(12,32,20,0.72)',
  },
  side: { flex: 1, gap: 4 },
  sideLabel: {
    ...font('extrabold', 10, { color: 'rgba(255,255,255,0.6)' }),
    letterSpacing: 1,
  },
  sideLabelYou: {
    ...font('extrabold', 10, { color: 'rgba(255,255,255,0.6)' }),
    letterSpacing: 1,
  },
  clockLabel: { ...font('bold', 9, { color: 'rgba(255,255,255,0.5)' }), letterSpacing: 1 },
  combinedWrap: { position: 'absolute', top: '34%', left: 0, right: 0, alignItems: 'center' },
  combinedLabel: {
    ...font('bold', 12, { color: 'rgba(255,255,255,0.7)' }),
    letterSpacing: 4,
    marginBottom: 4,
  },
  combinedValue: {
    ...font('extrabold', 130, { color: palette.white }),
    lineHeight: 136,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 30,
  },
  syncPill: {
    marginTop: 4,
    backgroundColor: 'rgba(34,197,94,0.92)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius['2xl'],
  },
  syncText: { ...font('extrabold', 11, { color: '#062012' }), letterSpacing: 1.2 },
  waiting: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(9,14,11,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  waitingText: font('extrabold', 12, { color: palette.white }),
  trackingChip: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9,14,11,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius['2xl'],
  },
  trackingDot: { width: 7, height: 7, borderRadius: 3.5 },
  trackingText: { ...font('extrabold', 9, { color: palette.green300 }), letterSpacing: 0.8 },
  cue: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(34,197,94,0.92)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  cueText: font('extrabold', 13, { color: '#062012' }),
  end: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: 58,
    borderRadius: radius['2xl'],
    backgroundColor: palette.red500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: font('extrabold', 16, { color: palette.white }),
});
