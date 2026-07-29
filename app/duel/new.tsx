import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen } from '@/components/ui';
import { font } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';
import type { ExerciseId } from '@/vision/exercises';

const IC_PUSHUP = require('../../assets/ic-pushup.png');
const IC_SQUAT = require('../../assets/ic-squat.png');

const EXERCISES: { id: ExerciseId; label: string; emoji: string; desc: string; color: string }[] = [
  { id: 'push', label: 'Push-Ups', emoji: '💪', desc: 'Upper body power', color: '#22c55e' },
  { id: 'squat', label: 'Squats', emoji: '🦵', desc: 'Lower body strength', color: '#8b5cf6' },
];

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
  const params = useLocalSearchParams<{
    role?: string;
    target?: string;
    name?: string;
    level?: string;
    queue?: string;
  }>();

  const [exercise, setExercise] = useState<ExerciseId>('push');
  const [duration, setDuration] = useState(20);

  const selectedExercise = EXERCISES.find((e) => e.id === exercise)!;
  const selectedDuration = DURATIONS.find((d) => d.value === duration)!;
  const isTargeted = !!params.name;

  const start = () => {
    if (params.queue === '1') {
      router.replace({
        pathname: '/duel/queue',
        params: { exercise, duration: String(duration) },
      });
    } else {
      router.replace({
        pathname: '/duel/[id]',
        params: {
          id: 'new',
          role: params.role ?? 'host',
          exercise,
          duration: String(duration),
          ...(params.target ? { target: params.target } : {}),
          ...(params.name ? { name: params.name } : {}),
          ...(params.level ? { level: params.level } : {}),
        },
      });
    }
  };

  return (
    <Screen>
      <ModalHeader title="Set Up Duel" />

      {/* ── Hero Preview Card ── */}
      <Animated.View entering={FadeInDown.duration(500)}>
        <LinearGradient
          colors={['#0f172a', '#1e293b', '#334155']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Text style={{ fontSize: 11 }}>⚔️</Text>
              <Text style={styles.heroBadgeText}>
                {params.queue === '1' ? 'OPEN MATCH' : isTargeted ? 'DIRECT CHALLENGE' : 'DUEL SETUP'}
              </Text>
            </View>
          </View>

          <View style={styles.heroVsRow}>
            <View style={styles.heroPlayerCol}>
              <View style={[styles.heroAvatarRing, { borderColor: '#22c55e' }]}>
                <Text style={{ fontSize: 22 }}>🙋</Text>
              </View>
              <Text style={styles.heroPlayerName}>You</Text>
            </View>

            <Animated.View entering={ZoomIn.duration(400).delay(200)} style={styles.vsCircle}>
              <Text style={styles.vsText}>VS</Text>
            </Animated.View>

            <View style={styles.heroPlayerCol}>
              <View style={[styles.heroAvatarRing, { borderColor: '#ef4444' }]}>
                <Text style={{ fontSize: 22 }}>{isTargeted ? '😤' : '❓'}</Text>
              </View>
              <Text style={styles.heroPlayerName} numberOfLines={1}>
                {params.name ?? 'Rival'}
              </Text>
            </View>
          </View>

          {/* Live config display */}
          <View style={styles.configPreview}>
            <View style={styles.configItem}>
              <Image
                source={exercise === 'squat' ? IC_SQUAT : IC_PUSHUP}
                style={styles.configIcon}
                contentFit="contain"
              />
              <Text style={styles.configValue}>{selectedExercise.label}</Text>
            </View>
            <View style={styles.configDivider} />
            <View style={styles.configItem}>
              <Text style={{ fontSize: 16 }}>⏱</Text>
              <Text style={styles.configValue}>{duration}s</Text>
            </View>
            <View style={styles.configDivider} />
            <View style={styles.configItem}>
              <Text style={{ fontSize: 16 }}>🎯</Text>
              <Text style={styles.configValue}>{selectedDuration.desc}</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── Exercise Picker ── */}
      <Animated.View entering={FadeInUp.duration(400).delay(100)}>
        <Text style={styles.sectionLabel}>EXERCISE</Text>
        <View style={styles.exerciseRow}>
          {EXERCISES.map((ex) => {
            const selected = exercise === ex.id;
            return (
              <PressableScale
                key={ex.id}
                onPress={() => setExercise(ex.id)}
                accessibilityRole="button"
                accessibilityLabel={ex.label}
                style={[
                  styles.exerciseTile,
                  selected && { borderColor: ex.color, backgroundColor: `${ex.color}08` },
                ]}
              >
                <View style={[styles.exerciseIconWrap, { backgroundColor: selected ? `${ex.color}15` : '#f8fafc' }]}>
                  <Image
                    source={ex.id === 'squat' ? IC_SQUAT : IC_PUSHUP}
                    style={styles.exerciseImg}
                    contentFit="contain"
                  />
                </View>
                <Text style={[styles.exerciseTitle, selected && { color: ex.color }]}>
                  {ex.label}
                </Text>
                <Text style={styles.exerciseDesc}>{ex.desc}</Text>
                {selected ? (
                  <Animated.View entering={ZoomIn.duration(250)} style={[styles.selectedDot, { backgroundColor: ex.color }]}>
                    <Text style={{ fontSize: 10, color: '#fff' }}>✓</Text>
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
              >
                {selected ? (
                  <LinearGradient
                    colors={['#22c55e', '#15803d']}
                    style={styles.durationChip}
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
            <Text style={font('extrabold', 17, { color: palette.white })}>
              {params.queue === '1' ? '🔍 Find Opponent' : '⚔️ Send Challenge'}
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
    padding: 22,
    marginBottom: 8,
    gap: 18,
  },
  heroTopRow: { alignItems: 'flex-start' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    ...font('extrabold', 9, { color: 'rgba(255,255,255,0.7)' }),
    letterSpacing: 1.5,
  },
  heroVsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  heroPlayerCol: { alignItems: 'center', gap: 8, flex: 1 },
  heroAvatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlayerName: {
    ...font('extrabold', 12, { color: 'rgba(255,255,255,0.85)' }),
    maxWidth: 100,
    textAlign: 'center',
  },
  vsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: font('extrabold', 14, { color: '#ef4444' }),
  configPreview: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius['2xl'],
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  configItem: { flex: 1, alignItems: 'center', gap: 4 },
  configIcon: { width: 20, height: 20 },
  configValue: font('extrabold', 11, { color: 'rgba(255,255,255,0.85)' }),
  configDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },

  /* ── Section ── */
  sectionLabel: {
    ...font('extrabold', 10, { color: palette.grey500 }),
    letterSpacing: 1.5,
    marginTop: 18,
    marginBottom: 10,
  },

  /* ── Exercise Tiles ── */
  exerciseRow: { flexDirection: 'row', gap: 12 },
  exerciseTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderRadius: radius['3xl'],
    backgroundColor: palette.white,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    gap: 8,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  exerciseIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseImg: { width: 32, height: 32 },
  exerciseTitle: font('extrabold', 14, { color: palette.ink }),
  exerciseDesc: font('bold', 10, { color: palette.grey500 }),
  selectedDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Duration Chips ── */
  durationRow: { flexDirection: 'row', gap: 8 },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius['2xl'],
    gap: 2,
    minWidth: 72,
  },
  durationChipDefault: {
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  durationValue: font('extrabold', 16, { color: palette.ink }),
  durationDesc: font('bold', 9, { color: palette.grey500 }),
  durationValueSelected: font('extrabold', 16, { color: palette.white }),
  durationDescSelected: font('bold', 9, { color: 'rgba(255,255,255,0.8)' }),

  /* ── Start Button ── */
  startBtn: {
    marginTop: 24,
    height: 58,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
