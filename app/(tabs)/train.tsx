import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { ProgrammeCard } from '@/components/ProgrammeCard';
import { Card, Chevron, PressableScale, Screen, SectionLabel } from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { createDuel } from '@/services/duelService';
import { useCouple } from '@/state/useCouple';
import { useProfileStore } from '@/state/profileStore';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import { defaultDuration } from '@/state/sessionStore';
import type { ExerciseId } from '@/vision/exercises';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/** Rep milestones on the roadmap, in order. */
const MILESTONES = [5, 10, 15, 25, 40] as const;

export default function TrainScreen() {
  const router = useRouter();
  const personalBests = useProfileStore((s) => s.personalBests);
  const self = useSelfPlayer();
  const { paired, partner, streak, combined } = useCouple();
  const [starting, setStarting] = useState(false);
  const best = personalBests.push ?? 0;

  const nextMilestone = MILESTONES.find((m) => m > best) ?? MILESTONES[MILESTONES.length - 1]!;

  const practice = (exercise: ExerciseId) =>
    router.push({ pathname: '/session', params: { exercise, mode: 'practice' } });

  /**
   * Couple entry. Unpaired athletes go to the invite screen — that gate is the
   * point, since couple mode cannot work without bringing a partner in. Paired
   * ones open a cooperative duel addressed to their partner and wait in the
   * existing lobby, which routes both devices into the together set.
   */
  const trainTogether = async (exercise: ExerciseId) => {
    if (!paired || !partner || !self) {
      router.push('/modal/couple-invite');
      return;
    }
    setStarting(true);
    try {
      const duelId = await createDuel({
        ...self,
        exercise,
        duration: defaultDuration('together'),
        targetUid: partner.uid,
        cooperative: true,
      });
      if (!duelId) {
        Alert.alert('Not available yet', 'Connect Firebase to train together.');
        return;
      }
      router.push({
        pathname: '/duel/[id]',
        params: { id: duelId, name: partner.displayName },
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen>
      <StaggerIn index={0}>
        <Text style={[text.h1, { marginTop: 14 }]}>Train</Text>
        <Text style={[text.body, { marginBottom: 18, marginTop: 6 }]}>
          Practice solo — no targets, just reps.
        </Text>
      </StaggerIn>

      {/* The training programme leads: it's the guided path, above free practice. */}
      <StaggerIn index={1}>
        <ProgrammeCard />
        <View style={{ height: 20 }} />
      </StaggerIn>

      <StaggerIn index={2}>
        <View style={styles.tileRow}>
          <PracticeTile
            title="Push-Ups"
            emoji="💪"
            caption="Upper Body"
            pb={personalBests.push}
            colors={gradients.brandStrong}
            glow="brand"
            onPress={() => practice('push')}
          />
          <PracticeTile
            title="Squats"
            emoji="🦵"
            caption="Lower Body"
            pb={personalBests.squat}
            colors={gradients.squat}
            glow="squat"
            onPress={() => practice('squat')}
          />
        </View>

        <PressableScale
          onPress={() => practice('push')}
          accessibilityRole="button"
          accessibilityLabel="Practice with AI form coaching"
          style={{ marginTop: 12 }}
        >
          <Card style={styles.aiRow}>
            <View style={[styles.rowIcon, { backgroundColor: palette.blue150 }]}>
              <Text style={{ fontSize: 20 }}>🤖</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.cardTitle}>Practice with AI</Text>
              <Text style={text.caption}>Real-time form coaching, no pressure</Text>
            </View>
            <Chevron />
          </Card>
        </PressableScale>
      </StaggerIn>

      <StaggerIn index={3}>
        <SectionLabel style={{ marginTop: 24, marginBottom: 12 }}>Full library</SectionLabel>
        <ExerciseLibrary />
      </StaggerIn>

      <StaggerIn index={4}>
        <SectionLabel style={{ marginTop: 24, marginBottom: 12 }}>Couple mode</SectionLabel>
        <PressableScale
          onPress={() => void trainTogether('push')}
          accessibilityRole="button"
          accessibilityLabel={
            paired ? 'Start a push-up set together with your partner' : 'Invite your partner'
          }
          disabled={starting}
        >
          <LinearGradient colors={gradients.brandStrong} style={[styles.coupleCard, shadow.brand]}>
            <View style={{ flex: 1 }}>
              <Text style={font('extrabold', 18, { color: palette.white })}>
                {paired ? `Train with ${partner?.displayName ?? 'your partner'}` : 'Train together'}
              </Text>
              <Text style={styles.coupleBody}>
                {starting
                  ? 'Setting up…'
                  : paired
                    ? streak > 0
                      ? `🔥 ${streak} day streak · ${combined} reps together`
                      : 'Start a set — your streak begins when you both train'
                    : 'Pair with your partner and train at the same time'}
              </Text>
            </View>
            <Text style={{ fontSize: 38 }}>{paired ? '🔥' : '🤝'}</Text>
          </LinearGradient>
        </PressableScale>
      </StaggerIn>

      {paired ? (
        <View style={styles.couplePickRow}>
          <PressableScale
            onPress={() => void trainTogether('push')}
            accessibilityRole="button"
            accessibilityLabel="Together push-up set"
            style={styles.couplePick}
          >
            <Text style={styles.couplePickText}>💪 Push-Ups</Text>
          </PressableScale>
          <PressableScale
            onPress={() => void trainTogether('squat')}
            accessibilityRole="button"
            accessibilityLabel="Together squat set"
            style={styles.couplePick}
          >
            <Text style={styles.couplePickText}>🦵 Squats</Text>
          </PressableScale>
        </View>
      ) : null}

      <SectionLabel style={{ marginTop: 24, marginBottom: 12 }}>Push-Up Roadmap</SectionLabel>
      <Card style={styles.roadmapCard}>
        <View style={styles.roadmapHeader}>
          <Text style={font('extrabold', 34, { color: palette.green500 })}>{best}</Text>
          <View style={{ flex: 1 }}>
            <Text style={font('extrabold', 14, { color: palette.ink })}>Your max in a row</Text>
            <Text style={text.caption}>
              {best === 0
                ? 'Finish a set to log your first max'
                : `Next milestone: ${nextMilestone} reps`}
            </Text>
          </View>
        </View>

        <View style={styles.roadmap}>
          {MILESTONES.map((milestone, index) => {
            const reached = best >= milestone;
            const isNext = milestone === nextMilestone && !reached;

            return (
              <View key={milestone} style={styles.roadmapSegment}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.roadmapLine,
                      { backgroundColor: reached ? palette.green500 : palette.border },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.milestone,
                    reached && styles.milestoneReached,
                    isNext && styles.milestoneNext,
                  ]}
                >
                  <Text
                    style={font('extrabold', 11, {
                      color: reached ? palette.white : isNext ? palette.green600 : palette.grey500,
                    })}
                  >
                    {reached ? '✓' : milestone}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {personalBests.squat > 0 ? (
        <>
          <SectionLabel style={{ marginTop: 24, marginBottom: 12 }}>Squat best</SectionLabel>
          <Card style={styles.roadmapCard}>
            <View style={styles.roadmapHeader}>
              <Text style={font('extrabold', 34, { color: palette.purple500 })}>
                {personalBests.squat}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 14, { color: palette.ink })}>
                  Your max in a row
                </Text>
                <Text style={text.caption}>Keep chasing a deeper, cleaner rep</Text>
              </View>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function PracticeTile({
  title,
  emoji,
  caption,
  pb = 0,
  colors,
  glow,
  onPress,
}: {
  title: string;
  emoji: string;
  caption: string;
  pb?: number;
  colors: readonly [string, string];
  glow: 'brand' | 'squat';
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Practice ${title}`}
      style={{ flex: 1 }}
    >
      <LinearGradient colors={colors} style={[styles.practiceTile, shadow[glow]]}>
        <View style={styles.practiceHeader}>
          <Text style={font('extrabold', 18, { color: palette.white })}>{title}</Text>
          {pb > 0 ? (
            <View style={styles.pbBadge}>
              <Text style={font('extrabold', 9.5, { color: palette.white })}>PB: {pb}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ alignItems: 'flex-end', marginTop: 4 }}>
          <Text style={{ fontSize: 38 }}>{emoji}</Text>
        </View>

        <View style={styles.practiceFooter}>
          <Text style={font('bold', 11, { color: 'rgba(255,255,255,0.85)' })}>
            {caption}
          </Text>
          <View style={styles.startPill}>
            <Text style={font('extrabold', 10, { color: palette.ink })}>Start →</Text>
          </View>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  practiceTile: {
    height: 175,
    borderRadius: radius['4xl'],
    padding: 16,
    justifyContent: 'space-between',
  },
  practiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pbBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  practiceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  startPill: {
    backgroundColor: palette.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    ...shadow.card,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius['3xl'],
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coupleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderRadius: radius['3xl'],
  },
  coupleBody: {
    ...font('bold', 12, { color: 'rgba(255,255,255,0.85)' }),
    marginTop: 4,
    lineHeight: 17,
  },
  couplePickRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  couplePick: {
    flex: 1,
    height: 52,
    borderRadius: radius['2xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couplePickText: font('extrabold', 14, { color: palette.ink }),
  roadmapCard: { padding: 18 },
  roadmapHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  roadmap: { flexDirection: 'row', alignItems: 'center' },
  roadmapSegment: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  roadmapLine: { flex: 1, height: 4 },
  milestone: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneReached: { backgroundColor: palette.green500 },
  milestoneNext: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.white,
    borderWidth: 3,
    borderColor: palette.green500,
  },
});
