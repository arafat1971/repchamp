import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { PoseFigure } from '@/components/mind/PoseFigure';
import { Badge, Card, Chevron, PressableScale, Screen, SectionLabel } from '@/components/ui';
import { MEDITATIONS, bestScore, mindfulStreak, weekMinutes } from '@/domain/mindful';
import { canUse } from '@/domain/pro';
import { dayKey } from '@/domain/progression';
import { useMindfulStore } from '@/state/mindfulStore';
import { useIsPro } from '@/state/proStore';
import { font, text } from '@/theme/typography';
import { palette, shadow } from '@/theme/tokens';
import { YOGA_FLOWS, YOGA_POSES, flowMinutes, type YogaLevel } from '@/vision/yoga';

const LEVEL_BADGE: Record<YogaLevel, { label: string; color: string; background: string }> = {
  beginner: { label: 'Beginner', color: palette.green600, background: palette.green50 },
  intermediate: { label: 'Intermediate', color: palette.blue700, background: '#e0ecff' },
  advanced: { label: 'Advanced', color: palette.purple600, background: palette.tintPurpleBottom },
};

/**
 * Mind & body: camera-coached yoga flows and guided meditations, with one
 * streak across both. Pro — a free athlete sees everything and meets the
 * paywall on the first tap, never a locked screen they can't read.
 */
export default function MindScreen() {
  const router = useRouter();
  const isPro = useIsPro();
  const entries = useMindfulStore((s) => s.entries);
  const today = dayKey();
  const streak = useMemo(() => mindfulStreak(entries, today), [entries, today]);
  const minutes = useMemo(() => weekMinutes(entries, today), [entries, today]);

  const open = (go: () => void) => {
    if (!canUse(isPro, 'mind-body')) {
      router.push({ pathname: '/modal/paywall', params: { source: 'mind-body' } });
      return;
    }
    go();
  };

  return (
    <Screen>
      <ModalHeader title="Mind & body" subtitle="Yoga with a coach that watches, and quiet guided sits." />

      <LinearGradient colors={['#1E1B4B', '#3B2A6B', '#6D4AA8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, shadow.squat]}>
        <View style={{ flex: 1 }}>
          <Text style={font('extrabold', 30, { color: palette.white })}>{streak}</Text>
          <Text style={styles.heroLabel}>{streak === 1 ? 'day in a row' : 'days in a row'}</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={{ flex: 1 }}>
          <Text style={font('extrabold', 30, { color: palette.white })}>{minutes}</Text>
          <Text style={styles.heroLabel}>minutes this week</Text>
        </View>
      </LinearGradient>

      <SectionLabel style={styles.section}>Yoga flows</SectionLabel>
      <Text style={[text.caption, { marginTop: -6, marginBottom: 12 }]}>
        Prop your phone up, step back, and the camera checks each pose and times your hold. Raise a hand to pause.
      </Text>
      <View style={{ gap: 10 }}>
        {YOGA_FLOWS.map((flow) => {
          const badge = LEVEL_BADGE[flow.level];
          const best = bestScore(entries, flow.id);
          const lead = YOGA_POSES[flow.steps[Math.min(2, flow.steps.length - 1)]!.pose];
          return (
            <PressableScale
              key={flow.id}
              onPress={() => open(() => router.push({ pathname: '/session/yoga', params: { flow: flow.id } }))}
              accessibilityRole="button"
              accessibilityLabel={`${flow.title}, ${badge.label}, ${flowMinutes(flow)} minutes`}
            >
              <Card style={styles.row}>
                <View style={styles.figureTile}>
                  <PoseFigure figure={lead.figure} size={48} color={palette.purple600} strokeWidth={6} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={text.cardTitle}>{flow.title}</Text>
                  <Text style={text.caption} numberOfLines={2}>
                    {flow.blurb}
                  </Text>
                  <View style={styles.meta}>
                    <Badge label={badge.label} color={badge.color} background={badge.background} />
                    <Text style={styles.metaText}>{`${flowMinutes(flow)} min · ${flow.steps.length} poses`}</Text>
                    {best !== null ? <Text style={styles.metaText}>{`· best ${best}`}</Text> : null}
                  </View>
                </View>
                {isPro ? <Chevron /> : <Text style={styles.lock}>PRO</Text>}
              </Card>
            </PressableScale>
          );
        })}
      </View>

      <SectionLabel style={styles.section}>Meditation</SectionLabel>
      <View style={{ gap: 10 }}>
        {MEDITATIONS.map((m) => (
          <PressableScale
            key={m.id}
            onPress={() => open(() => router.push({ pathname: '/modal/meditate', params: { id: m.id } }))}
            accessibilityRole="button"
            accessibilityLabel={`${m.title}, ${m.minutes[0]} minutes`}
          >
            <Card style={styles.row}>
              <View style={[styles.figureTile, { backgroundColor: '#EEF0FF' }]}>
                <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={text.cardTitle}>{m.title}</Text>
                <Text style={text.caption} numberOfLines={2}>
                  {m.blurb}
                </Text>
                <Text style={[styles.metaText, { marginTop: 6 }]}>{`${[...m.minutes].sort((a, b) => a - b).join(' / ')} min`}</Text>
              </View>
              {isPro ? <Chevron /> : <Text style={styles.lock}>PRO</Text>}
            </Card>
          </PressableScale>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', borderRadius: 22, padding: 20, marginTop: 8 },
  heroLabel: { marginTop: 2, ...font('medium', 13, { color: 'rgba(255,255,255,0.78)' }) },
  heroDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.35)', marginHorizontal: 16 },
  section: { marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  figureTile: { width: 60, height: 60, borderRadius: 16, backgroundColor: palette.tintPurpleTop, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  metaText: font('medium', 12, { color: palette.grey600 }),
  lock: { ...font('extrabold', 11, { color: palette.amber800 }), backgroundColor: palette.amber200, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
});
