import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen } from '@/components/ui';
import { duelExerciseOptions, parseDuelExercise } from '@/domain/duelExercises';
import { canStartWorkout } from '@/domain/paywallGate';
import { assertClientRateLimit, isBlockedEither } from '@/services/safetyService';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { useEffectivePro } from '@/state/proStore';
import { showDialog } from '@/state/useDialog';
import { font } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';
import type { ExerciseId } from '@/vision/exercises';

const IC_PUSHUP = require('../../assets/ic-pushup.png');
const IC_SQUAT = require('../../assets/ic-squat.png');

const EXERCISE_OPTIONS = duelExerciseOptions();

const DURATIONS: { value: number; label: string; desc: string }[] = [
  { value: 20, label: '20s', desc: 'Sprint' },
  { value: 30, label: '30s', desc: 'Standard' },
  { value: 45, label: '45s', desc: 'Endurance' },
  { value: 60, label: '60s', desc: 'Ultimate' },
];

/**
 * Exercise + duration picker before the duel waiting room.
 *
 * Params passed through:
 *   role    'host' | 'guest' (forwarded to the waiting room)
 *   target  uid of the friend being challenged (optional, forwarded)
 *   name    opponent display name (optional, forwarded)
 *   level   opponent level (optional, forwarded)
 *   queue   '1' when coming from the open-matchmaking queue path
 */
export default function DuelNewScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isPro = useEffectivePro();
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const displayName = useProfileStore((s) => s.displayName);
  const params = useLocalSearchParams<{
    role?: string;
    target?: string;
    name?: string;
    level?: string;
    queue?: string;
    kind?: string;
    exercise?: string;
    duration?: string;
  }>();

  const inviteKind =
    params.kind === 'train' || params.kind === 'compete' || params.kind === 'duel'
      ? params.kind
      : 'duel';
  const isCoupleTrain = inviteKind === 'train';

  const [exercise, setExercise] = useState<ExerciseId>(() => parseDuelExercise(params.exercise));
  const [duration, setDuration] = useState(() => {
    const n = Number(params.duration);
    return DURATIONS.some((d) => d.value === n) ? n : 20;
  });

  const selectedExercise = useMemo(
    () => EXERCISE_OPTIONS.find((e) => e.id === exercise) ?? EXERCISE_OPTIONS[0]!,
    [exercise],
  );
  const selectedDuration = DURATIONS.find((d) => d.value === duration)!;
  const isTargeted = !!params.name;

  const pickExercise = (id: ExerciseId) => {
    const allowed = canStartWorkout({
      isPro,
      exercise: id,
      isCoupleMode: isCoupleTrain,
    });
    if (!allowed) {
      router.push({ pathname: '/modal/paywall', params: { source: 'duel-exercise' } });
      return;
    }
    setExercise(id);
  };

  const start = () => {
    if (
      !canStartWorkout({
        isPro,
        exercise,
        isCoupleMode: isCoupleTrain,
      })
    ) {
      router.push({ pathname: '/modal/paywall', params: { source: 'duel-exercise' } });
      return;
    }

    if (params.queue === '1') {
      router.replace({
        pathname: '/duel/queue',
        params: { exercise, duration: String(duration) },
      });
      return;
    }

    const go = () => {
      router.replace({
        pathname: '/duel/[id]',
        params: {
          id: 'new',
          role: params.role ?? 'host',
          exercise,
          duration: String(duration),
          kind: inviteKind,
          ...(params.target ? { target: params.target } : {}),
          ...(params.name ? { name: params.name } : {}),
          ...(params.level ? { level: params.level } : {}),
        },
      });
    };

    const myUid = user?.uid;
    const target = params.target;
    if (!myUid || !target) {
      go();
      return;
    }

    void (async () => {
      try {
        if (await isBlockedEither(myUid, target)) {
          showDialog({
            title: 'Unavailable',
            message: 'You can’t challenge this athlete.',
            tone: 'info',
            actions: [{ label: 'Got it', variant: 'primary' }],
          });
          return;
        }
        // Assert only — commit after createDuel succeeds in the waiting room.
        assertClientRateLimit('duelInvite', myUid);
        go();
      } catch (err) {
        showDialog({
          title: 'Could not start',
          message: err instanceof Error ? err.message : 'Please try again.',
          tone: 'danger',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
      }
    })();
  };

  return (
    <Screen>
      <ModalHeader
        title={
          inviteKind === 'train'
            ? 'Train Together'
            : inviteKind === 'compete'
              ? 'Weekly Compete'
              : 'Set Up Duel'
        }
      />

      {/* ── Hero Preview Card ── */}
      <Animated.View entering={FadeInDown.duration(500)}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <Text style={styles.heroBadgeText}>
                {params.queue === '1'
                  ? 'OPEN MATCH'
                  : inviteKind === 'train'
                    ? 'TRAIN TOGETHER'
                    : inviteKind === 'compete'
                      ? 'WEEKLY COMPETE'
                      : isTargeted
                        ? 'DIRECT CHALLENGE'
                        : 'DUEL SETUP'}
              </Text>
            </View>
          </View>

          <View style={styles.heroVsRow}>
            <View style={styles.heroPlayerCol}>
              <View style={[styles.heroAvatarRing, styles.heroAvatarRingSelf]}>
                {(avatarUri ?? user?.photoURL) ? (
                  <Image
                    source={{ uri: (avatarUri ?? user?.photoURL) as string }}
                    style={styles.heroAvatarImage}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={[styles.avatarInitial, { color: palette.green600 }]}>
                    {(displayName || user?.displayName)?.[0]?.toUpperCase() || 'U'}
                  </Text>
                )}
              </View>
              <Text style={styles.heroPlayerName}>You</Text>
            </View>

            <Animated.View entering={ZoomIn.duration(400).delay(200)} style={styles.vsCircle}>
              <Text style={styles.vsText}>VS</Text>
            </Animated.View>

            <View style={styles.heroPlayerCol}>
              <View style={[styles.heroAvatarRing, styles.heroAvatarRingRival]}>
                {isTargeted ? (
                  <Text style={styles.avatarInitial}>{params.name ? params.name?.[0]?.toUpperCase() : 'R'}</Text>
                ) : (
                  <Text style={styles.avatarInitialWaiting}>?</Text>
                )}
              </View>
              <Text style={styles.heroPlayerName} numberOfLines={1}>
                {params.name ?? 'Rival'}
              </Text>
            </View>
          </View>

          {/* Live config summary — editorial spec row: muted caption over a
              bold value, so the choices read at a glance without emoji noise. */}
          <View style={styles.configPreview}>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>EXERCISE</Text>
              <Text style={styles.configValue} numberOfLines={1}>{selectedExercise.label}</Text>
            </View>
            <View style={styles.configDivider} />
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>TIME</Text>
              <Text style={styles.configValue}>{duration}s</Text>
            </View>
            <View style={styles.configDivider} />
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>INTENSITY</Text>
              <Text style={styles.configValue} numberOfLines={1}>{selectedDuration.desc}</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── Exercise Picker ── */}
      <Animated.View entering={FadeInUp.duration(400).delay(100)}>
        <Text style={styles.sectionLabel}>EXERCISE</Text>
        <View style={styles.exerciseGrid}>
          {EXERCISE_OPTIONS.map((ex) => {
            const selected = exercise === ex.id;
            const locked =
              !ex.free &&
              !isPro &&
              !isCoupleTrain;
            return (
              <PressableScale
                key={ex.id}
                onPress={() => pickExercise(ex.id)}
                accessibilityRole="button"
                accessibilityLabel={`${ex.label}${locked ? ' (Pro)' : ''}`}
                accessibilityState={{ selected }}
                style={[
                  styles.exerciseTile,
                  selected && {
                    backgroundColor: ex.tintBg,
                    shadowColor: ex.color,
                    shadowOpacity: 0.28,
                    shadowRadius: 18,
                    elevation: 7,
                  },
                ]}
              >
                <LinearGradient
                  colors={selected ? ex.soft : ['#f8fafc', '#eef2f6']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={[
                    styles.exerciseIconWrap,
                    selected && { borderColor: ex.ring },
                  ]}
                >
                  {ex.id === 'push' || ex.id === 'squat' ? (
                    <Image
                      source={ex.id === 'squat' ? IC_SQUAT : IC_PUSHUP}
                      style={styles.exerciseImg}
                      contentFit="contain"
                    />
                  ) : (
                    <Text style={styles.exerciseEmoji}>{ex.emoji}</Text>
                  )}
                </LinearGradient>
                <Text style={[styles.exerciseTitle, selected && { color: ex.color }]} numberOfLines={1}>
                  {ex.label}
                </Text>
                <Text style={styles.exerciseDesc} numberOfLines={1}>
                  {locked ? 'Pro' : ex.desc}
                </Text>
                {locked ? (
                  <View style={styles.proBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                ) : null}
                {selected ? (
                  <Animated.View
                    entering={ZoomIn.duration(250)}
                    style={[styles.selectedDot, { backgroundColor: ex.color, shadowColor: ex.color }]}
                  >
                    <Text style={styles.selectedCheck}>✓</Text>
                  </Animated.View>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </Animated.View>

      {/* ── Duration Picker ── */}
      <Animated.View entering={FadeInUp.duration(400).delay(200)}>
        <Text style={styles.sectionLabel}>DURATION</Text>
        <View style={styles.durationRow}>
          {DURATIONS.map((d) => {
            const selected = duration === d.value;
            return (
              <PressableScale
                key={d.value}
                onPress={() => setDuration(d.value)}
                accessibilityRole="button"
                accessibilityLabel={`${d.value} seconds`}
                accessibilityState={{ selected }}
              >
                {selected ? (
                  <LinearGradient
                    colors={['#22c55e', '#15803d']}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={[styles.durationChip, styles.durationChipSelected]}
                  >
                    <Text style={styles.durationValueSelected}>{d.label}</Text>
                    <Text style={styles.durationDescSelected}>{d.desc}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.durationChip, styles.durationChipDefault]}>
                    <Text style={styles.durationValue}>{d.label}</Text>
                    <Text style={styles.durationDesc}>{d.desc}</Text>
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>
      </Animated.View>

      {/* ── Start Button ── */}
      <Animated.View entering={FadeInUp.duration(400).delay(300)}>
        <PressableScale onPress={start} accessibilityRole="button" accessibilityLabel="Start duel">
          <LinearGradient
            colors={['#22c55e', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.startBtn, shadow.brand]}
          >
            <Text style={font('extrabold', 17, { color: palette.white, letterSpacing: 0.3 })}>
              {params.queue === '1' ? 'Find Opponent' : 'Send Challenge'}
            </Text>
          </LinearGradient>
        </PressableScale>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* ── Hero Card ── */
  heroCard: {
    borderRadius: radius['4xl'],
    padding: 24,
    marginBottom: 8,
    gap: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 4,
  },
  heroTopRow: { alignItems: 'flex-start' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.green50,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green500 },
  heroBadgeText: {
    ...font('extrabold', 9, { color: palette.green700 }),
    letterSpacing: 1.5,
  },
  heroVsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  heroPlayerCol: { alignItems: 'center', gap: 8, flex: 1 },
  heroAvatarImage: { width: "100%", height: "100%", borderRadius: 45 },
  avatarInitial: font("extrabold", 32, { color: palette.slate500 }),
  // The unknown rival: a lighter glyph so the "?" reads as a placeholder
  // waiting to be filled rather than a real initial.
  avatarInitialWaiting: font("extrabold", 32, { color: palette.slate400 }),
  heroAvatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // You — the protagonist: brand ring with a soft green wash behind the
  // initial. (An outer glow can't show here: the ring clips to a circle with
  // overflow:hidden, which masks iOS shadows.)
  heroAvatarRingSelf: {
    borderColor: palette.green500,
    backgroundColor: palette.green50,
  },
  // Rival — neutral until matched, so it never fights the brand accent.
  heroAvatarRingRival: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  heroPlayerName: {
    ...font('extrabold', 14, { color: palette.slate900 }),
    maxWidth: 100,
    textAlign: 'center',
  },
  vsCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.slate900,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  vsText: { ...font('extrabold', 13, { color: palette.white }), letterSpacing: 0.5 },
  configPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f6f8f6',
    borderRadius: radius['2xl'],
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  configItem: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  configLabel: {
    ...font('extrabold', 9, { color: palette.slate400 }),
    letterSpacing: 1,
  },
  configValue: font('extrabold', 14.5, { color: palette.slate900 }),
  configDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 4, backgroundColor: palette.border },

  /* ── Section ── */
  sectionLabel: {
    ...font('extrabold', 10, { color: palette.grey500 }),
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
  },

  /* ── Exercise Tiles ── */
  exerciseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exerciseTile: {
    width: '31%',
    flexGrow: 1,
    minWidth: '30%',
    maxWidth: '48%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radius['3xl'],
    backgroundColor: palette.white,
    gap: 8,
    position: 'relative',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  },
  exerciseIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  exerciseImg: { width: 42, height: 36 },
  exerciseEmoji: { fontSize: 26 },
  exerciseTitle: font('extrabold', 13, { color: palette.ink }),
  exerciseDesc: { ...font('bold', 10, { color: palette.grey500 }), marginTop: -2 },
  proBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: palette.amber200,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 8,
  },
  proBadgeText: { ...font('extrabold', 8, { color: palette.amber900 }), letterSpacing: 0.6 },
  selectedDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  selectedCheck: font('extrabold', 10, { color: '#fff' }),

  /* ── Duration Chips ── */
  exerciseRow: { flexDirection: 'row', gap: 12 },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radius['2xl'],
    gap: 4,
    minWidth: 72,
  },
  // Border-free at rest — a soft neutral lift matches the exercise tiles.
  durationChipDefault: {
    backgroundColor: palette.white,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  // Selected chip carries a brand-green glow so it clearly leads the row.
  durationChipSelected: {
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  durationValue: font('extrabold', 16, { color: palette.ink }),
  durationDesc: font('bold', 9, { color: palette.grey500 }),
  durationValueSelected: font('extrabold', 16, { color: palette.white }),
  durationDescSelected: font('bold', 9, { color: 'rgba(255,255,255,0.85)' }),

  /* ── Start Button ── */
  startBtn: {
    marginTop: 24,
    height: 58,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
