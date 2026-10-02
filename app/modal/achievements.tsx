import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { ProgressRing } from '@/components/session/ProgressRing';
import { PressableScale, Screen } from '@/components/ui';
import { CountUp, StaggerIn } from '@/components/motion';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { evaluateAchievements, type Achievement } from '@/domain/achievements';
import { achievementPercent, nextUp, remainingLabel } from '@/domain/achievementFocus';
import { selectBestStreak, selectWeeklyXp, useProfileStore } from '@/state/profileStore';
import { showDialog } from '@/state/useDialog';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const TROPHY = require('../../assets/trophy-gold.png');

export default function AchievementsScreen() {
  const profile = useProfileStore();

  const achievements = evaluateAchievements({
    sessions: profile.sessions,
    bestStreak: selectBestStreak(profile),
    weeklyXp: selectWeeklyXp(profile),
  });

  const earned = achievements.filter((a) => a.earned);
  const focus = nextUp(achievements);
  const percent = achievements.length ? Math.round((earned.length / achievements.length) * 100) : 0;

  /* A tile has room for a title, not a sentence — the detail lives one tap
     away, in the app's own dialog rather than a screen of its own. */
  const open = (a: Achievement) =>
    showDialog({
      title: `${a.emoji} ${a.title}`,
      message: a.earned
        ? `${a.description}\n\nEarned.`
        : `${a.description}\n\n${a.label} · ${remainingLabel(a)}`,
      tone: a.earned ? 'success' : 'info',
      actions: [{ label: 'Got it', variant: 'primary' }],
    });

  return (
    <Screen>
      <ModalHeader title="Achievements" />

      {/* Where they stand: a ring that fills as the cabinet does. */}
      <StaggerIn index={0}>
        <View style={styles.hero}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(245,158,11,0.16)', 'rgba(245,158,11,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.ringWrap}>
            <ProgressRing
              size={104}
              strokeWidth={9}
              percent={percent}
              color={palette.amber500}
              trackColor={palette.divider}
            >
              <Image source={TROPHY} style={styles.ringTrophy} contentFit="contain" />
            </ProgressRing>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.countRow}>
              <CountUp value={earned.length} style={styles.count} />
              <Text style={styles.countOf}>/{achievements.length}</Text>
            </View>
            <Text style={styles.heroTitle}>Badges unlocked</Text>
            <Text style={styles.heroSub}>
              {earned.length === achievements.length
                ? 'The whole cabinet — nicely done.'
                : earned.length === 0
                  ? 'Your first one is closer than it looks.'
                  : 'Keep training to earn the rest.'}
            </Text>
          </View>
        </View>
      </StaggerIn>

      {/* The one to go for: the unearned badge you're closest to. */}
      {focus ? (
        <StaggerIn index={1}>
          <HomeSectionHeader title="Next up" />
          <PressableScale
            onPress={() => open(focus)}
            accessibilityRole="button"
            accessibilityLabel={`${focus.title}. ${remainingLabel(focus)}`}
          >
            <View style={styles.focusCard}>
              <View style={styles.focusMedal}>
                <Text style={styles.focusEmoji}>{focus.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.focusTitle}>{focus.title}</Text>
                <Text style={styles.focusDesc} numberOfLines={2}>
                  {focus.description}
                </Text>
                <View style={styles.track}>
                  <View
                    style={[styles.fill, { width: `${Math.max(4, achievementPercent(focus))}%` }]}
                  />
                </View>
                <View style={styles.focusFoot}>
                  <Text style={styles.focusLabel}>{focus.label}</Text>
                  <Text style={styles.focusLeft}>{remainingLabel(focus)}</Text>
                </View>
              </View>
            </View>
          </PressableScale>
        </StaggerIn>
      ) : null}

      <StaggerIn index={2}>
        <HomeSectionHeader title="All badges" />
        <View style={styles.grid}>
          {achievements.map((a) => (
            <Badge key={a.id} achievement={a} onPress={() => open(a)} />
          ))}
        </View>
      </StaggerIn>
    </Screen>
  );
}

function Badge({ achievement: a, onPress }: { achievement: Achievement; onPress: () => void }) {
  const pct = achievementPercent(a);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a.title}, ${a.earned ? 'earned' : `${pct} percent, ${remainingLabel(a)}`}`}
      style={styles.tileWrap}
    >
      <View style={[styles.tile, a.earned && styles.tileEarned]}>
        <View style={styles.medalWrap}>
          {a.earned ? (
            <View style={[styles.medal, styles.medalEarned]}>
              <Text style={styles.medalEmoji}>{a.emoji}</Text>
            </View>
          ) : (
            <ProgressRing
              size={64}
              strokeWidth={5}
              percent={pct}
              color={palette.green500}
              trackColor={palette.divider}
            >
              <Text style={[styles.medalEmoji, { opacity: 0.45 }]}>{a.emoji}</Text>
            </ProgressRing>
          )}
          {a.earned ? (
            <View style={styles.check}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tileTitle, !a.earned && { color: palette.grey600 }]} numberOfLines={2}>
          {a.title}
        </Text>
        <Text style={styles.tileMeta} numberOfLines={1}>
          {a.earned ? 'Earned' : a.label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: radius['6xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  ringWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  ringTrophy: { width: 58, height: 58 },
  countRow: { flexDirection: 'row', alignItems: 'baseline' },
  count: { ...font('extrabold', 40, { color: palette.ink }), fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
  countOf: font('extrabold', 20, { color: palette.grey500 }),
  heroTitle: { ...font('extrabold', 15, { color: palette.ink }), marginTop: 2 },
  heroSub: { ...font('medium', 12.5, { color: palette.grey600 }), marginTop: 2, lineHeight: 17 },

  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: palette.green300,
    ...surfaceShadow,
  },
  focusMedal: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusEmoji: { fontSize: 30 },
  focusTitle: { ...font('extrabold', 16, { color: palette.ink }), letterSpacing: -0.3 },
  focusDesc: { ...font('medium', 12.5, { color: palette.grey600 }), marginTop: 2, lineHeight: 17 },
  track: { height: 8, borderRadius: 4, backgroundColor: palette.divider, marginTop: 10, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: palette.green500 },
  focusFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  focusLabel: font('bold', 11.5, { color: palette.grey600 }),
  focusLeft: font('extrabold', 11.5, { color: palette.green700 }),

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileWrap: { width: '31.5%', flexGrow: 1 },
  tile: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radius['3xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  tileEarned: { backgroundColor: palette.amber50, borderColor: palette.amber200 },
  medalWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  medal: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  medalEarned: { backgroundColor: palette.white, borderWidth: 2, borderColor: palette.amber500 },
  medalEmoji: { fontSize: 28 },
  check: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.green600,
    borderWidth: 2,
    borderColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: font('extrabold', 11, { color: palette.white }),
  tileTitle: {
    ...font('extrabold', 12.5, { color: palette.ink }),
    marginTop: 8,
    textAlign: 'center',
    minHeight: 32,
  },
  tileMeta: { ...font('bold', 11, { color: palette.grey500 }), marginTop: 2, fontVariant: ['tabular-nums'] },
});
