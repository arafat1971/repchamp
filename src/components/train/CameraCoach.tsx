import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { PoseFigure } from '@/components/mind/PoseFigure';
import { StaggerIn } from '@/components/motion';
import { PressableScale } from '@/components/ui';
import { GUIDED } from '@/domain/guidedMeditation';
import { canUse } from '@/domain/pro';
import { useMindfulStore } from '@/state/mindfulStore';
import { useEffectivePro } from '@/state/proStore';
import { font } from '@/theme/typography';
import { SCREEN_GUTTER, palette, radius, surfaceShadow } from '@/theme/tokens';
import {
  YOGA_FLOWS,
  YOGA_POSES,
  flowMinutes,
  isOneSided,
  singlePoseFlow,
  type YogaFlow,
  type YogaLevel,
} from '@/vision/yoga';

const LEVEL: Record<YogaLevel, { label: string; accent: string }> = {
  beginner: { label: 'Beginner', accent: '#16A34A' },
  intermediate: { label: 'Intermediate', accent: '#2563EB' },
  advanced: { label: 'Advanced', accent: '#7C3AED' },
};

/**
 * Camera coach (Pro): yoga the phone watches — pose-scored flows, a library of
 * single poses, and voice-guided sits. Sits beside the free timed flows and
 * breathing on Train; a free athlete sees all of it and meets the paywall on
 * the first tap rather than a locked screen.
 */
export function CameraCoachSection() {
  const router = useRouter();
  const isPro = useEffectivePro();
  const best = useMindfulStore((s) => s.best);

  const open = (go: () => void) => {
    if (!canUse(isPro, 'mind-body')) {
      router.push({ pathname: '/modal/paywall', params: { source: 'mind-body' } });
      return;
    }
    go();
  };
  const pro = isPro ? null : (
    <View style={styles.proChip}>
      <Text style={styles.proText}>PRO</Text>
    </View>
  );

  return (
    <>
      <HomeSectionHeader title="Camera coach" right={pro ?? <Text style={styles.sectionMeta}>Raise a hand to pause</Text>} />
      <Text style={styles.intro}>Prop your phone up and step back. The camera checks each pose, times your hold and tells you what to fix.</Text>
      <StaggerIn index={2}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
          {YOGA_FLOWS.map((flow) => (
            <CoachCard
              key={flow.id}
              flow={flow}
              best={best[flow.id] ?? null}
              onPress={() => open(() => router.push({ pathname: '/session/yoga', params: { flow: flow.id } }))}
            />
          ))}
        </ScrollView>
      </StaggerIn>

      <Text style={styles.subhead}>Pose library</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
        {Object.values(YOGA_POSES).map((pose) => {
          const level = LEVEL[pose.level];
          const hold = singlePoseFlow(pose.id).steps[0]!.holdSec;
          const sided = isOneSided(pose);
          return (
            <PressableScale
              key={pose.id}
              onPress={() => open(() => router.push({ pathname: '/session/yoga', params: { flow: `pose:${pose.id}` } }))}
              accessibilityRole="button"
              accessibilityLabel={`${pose.name}, ${level.label}, hold ${hold} seconds${sided ? ' each side' : ''}`}
            >
              <View style={styles.poseCard}>
                <View style={[styles.poseCover, { backgroundColor: `${level.accent}14` }]}>
                  <PoseFigure figure={pose.figure} size={58} color={level.accent} strokeWidth={6} />
                </View>
                <Text style={styles.poseName} numberOfLines={1}>
                  {pose.name}
                </Text>
                <Text style={styles.poseMeta} numberOfLines={1}>{`${hold}s${sided ? ' × 2' : ''}`}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      <Text style={styles.subhead}>Guided meditation</Text>
      <View style={styles.guidedList}>
        {GUIDED.map((m, i) => (
          <PressableScale
            key={m.id}
            onPress={() => open(() => router.push({ pathname: '/modal/meditate', params: { id: m.id } }))}
            accessibilityRole="button"
            accessibilityLabel={`${m.title}, ${m.minutes[0]} minutes, voice guided`}
          >
            <View style={[styles.guidedRow, i > 0 && styles.guidedDivider]}>
              <View style={styles.guidedIcon}>
                <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.guidedTitle}>{m.title}</Text>
                <Text style={styles.guidedLine} numberOfLines={1}>
                  {m.blurb}
                </Text>
              </View>
              <Text style={styles.guidedMin}>{`${Math.min(...m.minutes)}–${Math.max(...m.minutes)} min`}</Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </>
  );
}

function CoachCard({ flow, best, onPress }: { flow: YogaFlow; best: number | null; onPress: () => void }) {
  const level = LEVEL[flow.level];
  const minutes = flowMinutes(flow);
  const lead = YOGA_POSES[flow.steps[Math.min(2, flow.steps.length - 1)]!.pose];
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${flow.title}, ${level.label}, ${minutes} minutes, camera coached${best !== null ? `, best ${best}` : ''}`}
    >
      <View style={styles.card}>
        <LinearGradient colors={[`${level.accent}26`, `${level.accent}0D`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
          <PoseFigure figure={lead.figure} size={80} color={level.accent} strokeWidth={5} />
          <View style={styles.time}>
            <Text style={font('extrabold', 11, { color: level.accent })}>{minutes} min</Text>
          </View>
          {best !== null ? (
            <View style={[styles.best, { backgroundColor: level.accent }]}>
              <Text style={font('extrabold', 11, { color: palette.white })}>{best}</Text>
            </View>
          ) : null}
        </LinearGradient>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {flow.title}
          </Text>
          <Text style={styles.line} numberOfLines={1}>
            {flow.blurb}
          </Text>
          <Text style={[styles.level, { color: level.accent }]}>{`${level.label} · ${flow.steps.length} poses`}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  sectionMeta: font('bold', 12, { color: palette.grey600 }),
  intro: { ...font('medium', 13, { color: palette.grey600 }), marginTop: -4, marginBottom: 10, lineHeight: 18 },
  proChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: palette.amber200 },
  proText: font('extrabold', 11, { color: palette.amber800 }),
  bleed: { marginHorizontal: -SCREEN_GUTTER },
  /* Vertical padding keeps the cards' shadows from being clipped by the row. */
  row: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: 6, gap: 12 },
  card: {
    width: 176,
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  cover: { height: 108, alignItems: 'center', justifyContent: 'center' },
  time: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: palette.white },
  best: { position: 'absolute', top: 10, right: 10, minWidth: 26, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12, paddingTop: 10 },
  title: { ...font('extrabold', 15, { color: palette.ink }), letterSpacing: -0.3 },
  line: { ...font('medium', 12, { color: palette.grey600 }), marginTop: 2 },
  level: { ...font('bold', 12), marginTop: 10 },
  subhead: { ...font('bold', 14, { color: palette.ink }), marginTop: 14, marginBottom: 2 },
  poseCard: { width: 96, alignItems: 'center', padding: 8, borderRadius: radius['3xl'], backgroundColor: palette.white, borderWidth: 1, borderColor: 'rgba(15,31,23,0.06)', ...surfaceShadow },
  poseCover: { width: 76, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  poseName: { ...font('bold', 13, { color: palette.ink }), marginTop: 6 },
  poseMeta: font('medium', 11, { color: palette.grey600 }),
  guidedList: { marginTop: 8, borderRadius: radius['3xl'], backgroundColor: palette.white, borderWidth: 1, borderColor: 'rgba(15,31,23,0.06)', overflow: 'hidden', ...surfaceShadow },
  guidedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  guidedDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider },
  guidedIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EEF0FF', alignItems: 'center', justifyContent: 'center' },
  guidedTitle: font('bold', 15, { color: palette.ink }),
  guidedLine: { ...font('medium', 12, { color: palette.grey600 }), marginTop: 1 },
  guidedMin: font('bold', 12, { color: palette.grey500 }),
});
