import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/shallow';

import { ArrowIcon, CheckIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { HomeCard } from '@/components/ui/HomeCard';
import { canUse } from '@/domain/pro';
import { PUSHUP_LADDER, type Programme } from '@/domain/programme';
import { getExercise } from '@/vision/exercises';
import { isPurchasesConfigured } from '@/services/purchases';
import { selectProgramme, useProfileStore } from '@/state/profileStore';
import { useEffectivePro } from '@/state/proStore';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

const IC_PUSHUP = require('../../assets/ic-pushup.png');
const TROPHY = require('../../assets/trophy-gold.png');

/**
 * The training-programme surface on the Train tab.
 *
 * Enrolled → today's programme day, with the whole ladder drawn beneath it so
 * "where am I, and how far is left" is one glance: a row per week, a dot per
 * day (done, today, rest, ahead). Not enrolled → the same ladder as a preview,
 * so the commitment being asked for is visible before it is made. All the maths
 * lives in the pure `programme.ts`; this only renders and routes.
 */
export function ProgrammeCard() {
  const router = useRouter();
  const state = useProfileStore(useShallow(selectProgramme));
  const startProgramme = useProfileStore((s) => s.startProgramme);
  const completeProgrammeRestDay = useProfileStore((s) => s.completeProgrammeRestDay);
  const isPro = useEffectivePro();

  /* The Pro decision goes through `canUse` like every other gate, so
     `custom-programmes` has a real call site and the split stays in `pro.ts`
     rather than in an inline `!isPro` here. The billing-readiness check stays
     on top of it, matching the session screen: on a build with no billing
     configured, locking this would be a dead end with nothing to buy. */
  const gated = !canUse(isPro, 'custom-programmes') && isPurchasesConfigured();
  const enroll = (programmeId: string) => {
    if (gated) {
      router.push({ pathname: '/modal/paywall', params: { source: 'programme' } });
      return;
    }
    startProgramme(programmeId);
  };

  // ---- Not enrolled: offer the flagship ladder ----
  if (!state) {
    return (
      <PressableScale
        onPress={() => enroll(PUSHUP_LADDER.id)}
        accessibilityRole="button"
        accessibilityLabel={`Start the programme: ${PUSHUP_LADDER.title}`}
      >
        <HomeCard style={styles.card}>
          <Header
            icon={IC_PUSHUP}
            eyebrow={`NEW · ${PUSHUP_LADDER.weeks}-WEEK PROGRAMME`}
            title={PUSHUP_LADDER.title}
            pro={gated}
          />
          <Text style={styles.body}>{PUSHUP_LADDER.description}</Text>
          <Ladder programme={PUSHUP_LADDER} completed={0} showCurrent={false} />
          <Cta label={gated ? 'Unlock with Pro' : 'Start challenge'} muted={gated} />
        </HomeCard>
      </PressableScale>
    );
  }

  // ---- Finished ----
  if (state.finished || !state.currentDay) {
    return (
      <PressableScale
        onPress={() => enroll(PUSHUP_LADDER.id)}
        accessibilityRole="button"
        accessibilityLabel="Restart a programme"
      >
        <HomeCard style={[styles.card, styles.cardDone]}>
          <Header
            icon={TROPHY}
            eyebrow="PROGRAMME COMPLETE"
            title={state.programme.title}
            count={`${state.totalDays}/${state.totalDays}`}
          />
          <Text style={styles.body}>
            You finished all {state.totalDays} days. Start another to keep climbing.
          </Text>
          <Ladder programme={state.programme} completed={state.totalDays} showCurrent={false} />
          <Cta label="Start again" />
        </HomeCard>
      </PressableScale>
    );
  }

  // ---- Active: today's day ----
  const day = state.currentDay;
  const def = getExercise(day.exercise);

  const onStart = () => {
    if (day.rest) {
      completeProgrammeRestDay();
      return;
    }
    router.push({
      pathname: '/session',
      params: { exercise: day.exercise, mode: 'solo', target: String(day.target) },
    });
  };

  return (
    <PressableScale
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={
        day.rest
          ? 'Mark rest day complete'
          : `Programme day ${day.index}: ${day.target} ${def.label}`
      }
    >
      <HomeCard style={styles.card}>
        <Header
          icon={IC_PUSHUP}
          eyebrow={`WEEK ${day.week} · DAY ${day.dayOfWeek}`}
          title={state.programme.title}
          count={`${state.completedDays}/${state.totalDays}`}
        />

        {day.rest ? (
          <View style={styles.todayRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.restTitle}>Rest day</Text>
              <Text style={styles.body}>
                Recovery is part of the plan. Tap when you&apos;re ready for the next day.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.todayRow}>
            <Text style={styles.target}>{day.target}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.targetLabel}>{def.label} today</Text>
              <Text style={styles.body}>Clear today&apos;s target to advance the ladder.</Text>
            </View>
          </View>
        )}

        <Ladder programme={state.programme} completed={state.completedDays} showCurrent />
        <Cta label={day.rest ? 'Mark rest complete' : `Start day ${day.index}`} />
      </HomeCard>
    </PressableScale>
  );
}

function Header({
  icon,
  eyebrow,
  title,
  count,
  pro,
}: {
  icon: number;
  eyebrow: string;
  title: string;
  count?: string;
  pro?: boolean;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.iconWrap}>
        <Image source={icon} style={styles.icon} contentFit="contain" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {pro ? (
        <View style={styles.proTag}>
          <Text style={styles.proText}>PRO</Text>
        </View>
      ) : count ? (
        <Text style={styles.count}>{count}</Text>
      ) : null}
    </View>
  );
}

/** A row per week, a dot per day: done, today, rest, or still ahead. */
function Ladder({
  programme,
  completed,
  showCurrent,
}: {
  programme: Programme;
  completed: number;
  showCurrent: boolean;
}) {
  const weeks = Array.from({ length: programme.weeks }, (_, w) =>
    programme.days.filter((d) => d.week === w + 1),
  );
  return (
    <View style={styles.ladder}>
      {weeks.map((days, w) => (
        <View key={w} style={styles.weekRow}>
          <Text style={styles.weekLabel}>Wk {w + 1}</Text>
          <View style={styles.dots}>
            {days.map((d) => {
              const done = d.index <= completed;
              const current = showCurrent && d.index === completed + 1;
              return (
                <View
                  key={d.index}
                  style={[
                    styles.dot,
                    d.rest && styles.dotRest,
                    done && styles.dotDone,
                    current && styles.dotCurrent,
                  ]}
                >
                  {done ? (
                    <CheckIcon size={12} color={palette.white} strokeWidth={3} />
                  ) : d.rest ? (
                    <View style={styles.restBar} />
                  ) : (
                    <Text style={[styles.dotTarget, current && { color: palette.green700 }]}>
                      {d.target}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function Cta({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <View style={[styles.cta, muted && styles.ctaMuted]}>
      <Text style={styles.ctaText}>{label}</Text>
      <ArrowIcon size={16} color={palette.white} strokeWidth={2.4} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  cardDone: { borderColor: palette.amber200, backgroundColor: palette.amber50 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 32, height: 32 },
  eyebrow: { ...font('extrabold', 11, { color: palette.green700 }), letterSpacing: 1.2 },
  title: { ...font('extrabold', 17, { color: palette.ink }), letterSpacing: -0.4, marginTop: 1 },
  count: { ...font('extrabold', 14, { color: palette.grey600 }), fontVariant: ['tabular-nums'] },
  proTag: {
    backgroundColor: palette.amber50,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  proText: { ...font('extrabold', 10.5, { color: palette.amber800 }), letterSpacing: 1 },
  body: { ...font('medium', 13, { color: palette.grey600 }), lineHeight: 18, marginTop: 8 },

  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  target: {
    ...font('extrabold', 56, { color: palette.ink }),
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    lineHeight: 60,
  },
  targetLabel: { ...font('extrabold', 16, { color: palette.ink }), letterSpacing: -0.3 },
  restTitle: { ...font('extrabold', 22, { color: palette.ink }), letterSpacing: -0.5 },

  ladder: { marginTop: 16, gap: 8 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekLabel: { ...font('bold', 11.5, { color: palette.grey500 }), width: 34 },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  dot: {
    flex: 1,
    maxWidth: 44,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRest: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.border,
  },
  dotDone: { backgroundColor: palette.green500, borderWidth: 0 },
  dotCurrent: {
    backgroundColor: palette.white,
    borderWidth: 2.5,
    borderStyle: 'solid',
    borderColor: palette.green500,
  },
  dotTarget: { ...font('extrabold', 11.5, { color: palette.grey600 }), fontVariant: ['tabular-nums'] },
  restBar: { width: 10, height: 2.5, borderRadius: 2, backgroundColor: palette.grey500 },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: palette.green500,
  },
  ctaMuted: { backgroundColor: palette.ink },
  ctaText: font('extrabold', 15, { color: palette.white }),
});
