import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PopOnChange } from '@/components/motion';
import { PressableScale, ProgressBar } from '@/components/ui';
import type { Opponent } from '@/domain/opponent';
import type { SessionMode } from '@/domain/progression';
import { getExercise, type ExerciseId } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';
import { useProfileStore } from '@/state/profileStore';

/** The rival's colour on the live scoreboard — a clear blue against your green. */
const DUEL_RIVAL = '#3b82f6';

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * The in-session heads-up display.
 *
 * Three layouts share one component because they differ only in the top bar:
 * versus shows a tug-of-war against the rival, solo a target bar, practice a
 * plain rep count.
 */
export function DuelHud({
  exercise,
  mode,
  reps,
  opponentReps,
  opponent,
  target,
  timeLeft,
  tracking,
  depth,
  formCue,
  onGiveUp,
}: {
  exercise: ExerciseId;
  mode: SessionMode;
  reps: number;
  opponentReps: number;
  opponent: Opponent;
  target: number | null;
  timeLeft: number;
  tracking: boolean;
  depth: number;
  formCue: string;
  onGiveUp: () => void;
}) {
  const insets = useSafeAreaInsets();
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const definition = getExercise(exercise);
  const accent =
    exercise === 'squat' || exercise === 'stretch' ? palette.purple500 : palette.green500;

  const total = reps + opponentReps;
  const tugPercent = total === 0 ? 50 : Math.round((reps / total) * 100);
  const soloPercent = target ? Math.min(100, Math.round((reps / target) * 100)) : 0;

  const tugShared = useSharedValue(50);

  useEffect(() => {
    tugShared.value = withSpring(tugPercent, { damping: 15, stiffness: 120 });
  }, [tugPercent, tugShared]);

  const tugStyle = useAnimatedStyle(() => ({
    flex: Math.max(0.001, tugShared.value / 100),
  }));

  const tugSpacerStyle = useAnimatedStyle(() => ({
    flex: Math.max(0.001, 1 - (tugShared.value / 100)),
  }));



  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Top: score / target bar */}
      <View style={[styles.top, { top: insets.top + 14 }]} pointerEvents="box-none">
        {mode === 'versus' ? (
          <View style={styles.duelWrap}>
            <View style={styles.versusHeading}>
              <Text style={styles.versusTitle}>VS {opponent.name.toUpperCase()}</Text>
              <Text style={styles.versusSub}>TUG OF WAR BATTLE</Text>
            </View>



            <View style={styles.duelCard}>
            {/* Row: [you avatar] [your score] · TIME/clock · [their score] [their avatar] */}
            <View style={styles.duelRow}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.duelAvatarMe} contentFit="cover" />
              ) : (
                <LinearGradient colors={gradients.brandStrong} style={styles.duelAvatarMe}>
                  <Text style={font('extrabold', 15, { color: palette.white })}>Y</Text>
                </LinearGradient>
              )}

              <View style={styles.duelScoreCol}>
                <PopOnChange trigger={reps} scale={1.18}>
                  <Text style={styles.duelScoreMe}>{reps}</Text>
                </PopOnChange>
                <Text style={styles.duelNameMe} numberOfLines={1}>You</Text>
              </View>

              <View style={styles.duelCenter}>
                <Text style={styles.duelTimeLabel}>TIME</Text>
                <Text style={styles.duelClock}>{Math.max(0, timeLeft)}S</Text>
              </View>

              <View style={[styles.duelScoreCol, styles.duelScoreColRight]}>
                <PopOnChange trigger={opponentReps} scale={1.18}>
                  <Text style={styles.duelScoreThem}>{opponentReps}</Text>
                </PopOnChange>
                <Text style={styles.duelNameThem} numberOfLines={1}>{opponent.name}</Text>
              </View>

              <View style={styles.duelAvatarThem}>
                <Text style={font('extrabold', 15, { color: palette.white })}>{opponent.initial}</Text>
              </View>
            </View>

            {/* Split interactive bar: green from the left, blue from the right with 3px divider */}
            <View style={styles.duelBarTrack}>
              <Animated.View style={[styles.duelBarMe, tugStyle]} />
              <View style={styles.duelBarDivider} />
              <Animated.View style={tugSpacerStyle} />
            </View>
            </View>
          </View>
        ) : null}

        {mode === 'solo' ? (
          <>
            <View style={styles.pillHeading}>
              <Text style={styles.pillText}>{definition.hudLabel} · DAILY CHALLENGE</Text>
            </View>
            <View style={styles.soloBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scoreLabel}>TARGET</Text>
                <Text style={font('extrabold', 22, { color: palette.amber300 })}>
                  {reps}
                  <Text style={font('extrabold', 15, { color: 'rgba(255,255,255,0.55)' })}>
                    {' '}
                    / {target}
                  </Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={font('extrabold', 22, { color: palette.white })}>
                  {formatClock(timeLeft)}
                </Text>
                <Text style={styles.scoreLabel}>LEFT</Text>
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <ProgressBar
                percent={soloPercent}
                height={9}
                trackColor="rgba(255,255,255,0.18)"
                fillColors={gradients.amber}
              />
            </View>
          </>
        ) : null}

        {mode === 'practice' ? (
          <>
            <View style={styles.pillHeading}>
              <Text style={styles.pillText}>{definition.hudLabel} · PRACTICE</Text>
            </View>
            <View style={styles.soloBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scoreLabel}>REPS</Text>
                <Text style={font('extrabold', 22, { color: palette.green500 })}>{reps}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={font('extrabold', 22, { color: palette.white })}>
                  {formatClock(timeLeft)}
                </Text>
                <Text style={styles.scoreLabel}>LEFT</Text>
              </View>
            </View>
          </>
        ) : null}
      </View>

      {/* Centre: the big rep counter. Popping on change makes a counted rep
          felt at a glance, without the athlete having to read the number. */}
      <View style={styles.repCounter} pointerEvents="none">
        <Text style={styles.repsLabel}>REPS</Text>
        <PopOnChange trigger={reps} scale={1.22}>
          <Text style={styles.repsValue}>{reps}</Text>
        </PopOnChange>
      </View>

      {/* Live depth meter — real feedback from the pose model, not decoration. */}
      <View style={[styles.depthWrap, { bottom: insets.bottom + 210 }]} pointerEvents="none">
        <View style={styles.depthTrack}>
          <View
            style={[
              styles.depthFill,
              { height: `${Math.round(depth * 100)}%`, backgroundColor: accent },
            ]}
          />
        </View>
        <Text style={styles.depthLabel}>DEPTH</Text>
      </View>

      {/* Tracking state — tells the athlete when they've left the frame. */}
      <View style={[styles.trackingChip, { bottom: insets.bottom + 150 }]} pointerEvents="none">
        <View
          style={[
            styles.trackingDot,
            { backgroundColor: tracking ? palette.green500 : palette.amber500 },
          ]}
        />
        <Text style={styles.trackingText}>
          {tracking ? 'TRACKING' : 'STEP BACK INTO FRAME'}
        </Text>
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
        onPress={onGiveUp}
        accessibilityRole="button"
        accessibilityLabel="Give up and end the session"
        style={[styles.giveUp, { bottom: insets.bottom + 44 }]}
      >
        <Text style={styles.giveUpText}>⚑ Give Up</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 16, right: 16 },

  duelWrap: { gap: 8 },
  versusHeading: { alignItems: 'flex-start' },
  versusTitle: {
    ...font('extrabold', 15, { color: palette.white }),
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 10,
  },
  versusSub: {
    ...font('extrabold', 8.5, { color: palette.green300 }),
    letterSpacing: 2.4,
    marginTop: 4,
  },
  scoreLabel: {
    ...font('bold', 9, { color: 'rgba(255,255,255,0.5)' }),
    letterSpacing: 1,
  },

  // Live duel scoreboard — avatars at the edges, scores flanking a centred clock,
  // a single green-vs-blue split bar underneath.
  duelCard: {
    backgroundColor: 'rgba(12,16,14,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  duelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  duelAvatarMe: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.green500,
    overflow: 'hidden',
  },
  duelAvatarThem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: DUEL_RIVAL,
    backgroundColor: 'rgba(59,130,246,0.25)',
  },
  duelScoreCol: { flex: 1, alignItems: 'flex-start' },
  duelScoreColRight: { alignItems: 'flex-end' },
  duelScoreMe: {
    ...font('extrabold', 34, { color: palette.green400 }),
    lineHeight: 36,
    textShadowColor: 'rgba(34,197,94,0.6)',
    textShadowRadius: 14,
  },
  duelScoreThem: {
    ...font('extrabold', 34, { color: DUEL_RIVAL }),
    lineHeight: 36,
    textShadowColor: 'rgba(59,130,246,0.55)',
    textShadowRadius: 14,
  },
  duelNameMe: { ...font('bold', 10, { color: 'rgba(255,255,255,0.7)' }), marginTop: 4 },
  duelNameThem: { ...font('bold', 10, { color: 'rgba(255,255,255,0.7)' }), marginTop: 4 },
  duelCenter: { alignItems: 'center', paddingHorizontal: 4 },
  duelTimeLabel: {
    ...font('bold', 9, { color: 'rgba(255,255,255,0.5)' }),
    letterSpacing: 2.5,
  },
  duelClock: { ...font('extrabold', 22, { color: palette.white }), lineHeight: 24 },
  duelBarTrack: {
    height: 14,
    borderRadius: 7,
    backgroundColor: DUEL_RIVAL,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  duelBarMe: { height: '100%', backgroundColor: palette.green500 },
  duelBarDivider: {
    width: 3,
    height: '100%',
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  horizontalDepthTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginBottom: 4,
    flexDirection: 'row',
  },
  horizontalDepthFill: {
    height: 3,
    borderRadius: 1.5,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  pillHeading: { alignItems: 'center', marginBottom: 8 },
  pillText: {
    ...font('extrabold', 10, { color: palette.white }),
    letterSpacing: 1.6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  soloBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(9,14,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius['3xl'],
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  repCounter: {
    position: 'absolute',
    top: '38%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  repsLabel: {
    ...font('bold', 13, { color: 'rgba(255,255,255,0.7)' }),
    letterSpacing: 3.9,
    marginBottom: 4,
  },
  repsValue: {
    ...font('extrabold', 150, { color: palette.white }),
    lineHeight: 150,
    textShadowColor: 'rgba(34,197,94,0.7)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 36,
  },
  depthWrap: { position: 'absolute', right: 18, alignItems: 'center' },
  depthTrack: {
    width: 10,
    height: 120,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  depthFill: { width: '100%', borderRadius: 5 },
  depthLabel: {
    ...font('extrabold', 8, { color: 'rgba(255,255,255,0.6)' }),
    letterSpacing: 1,
    marginTop: 4,
  },
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
    borderRadius: 20,
  },
  trackingDot: { width: 7, height: 7, borderRadius: 3.5 },
  trackingText: {
    ...font('extrabold', 9, { color: palette.green300 }),
    letterSpacing: 0.8,
  },
  cue: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(34,197,94,0.92)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  cueText: font('extrabold', 13, { color: '#062012' }),
  giveUp: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: 58,
    borderRadius: radius['2xl'],
    backgroundColor: palette.red500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giveUpText: font('extrabold', 16, { color: palette.white }),
});
