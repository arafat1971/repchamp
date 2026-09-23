import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, GradientCard, PressableScale, Screen, SectionLabel, Toggle } from '@/components/ui';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { formatMl } from '@/domain/hydration';
import {
  partnerToday,
  sharingSummary,
  stepRace,
  stepRaceLine,
  type SharedMetric,
  type SharedMetricKey,
} from '@/domain/partnerSharing';
import { dayKey } from '@/domain/progression';
import { formatSteps } from '@/domain/steps';
import { nudgePartner } from '@/services/coupleService';
import { setMetricSharing, syncHydrationNow } from '@/services/hydrationSync';
import { useAuthStore } from '@/state/authStore';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useProfileStore } from '@/state/profileStore';
import { useSharingStore } from '@/state/sharingStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { useStepsToday } from '@/state/useStepsToday';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, type Gradient } from '@/theme/tokens';

/**
 * The partner's day, head to head with mine — and what I let them see.
 *
 * `couple/index` is the bond's history: streaks, calendars, who put in what.
 * This screen is today: did they train, how far have they walked, how much
 * have they drunk, and am I ahead. It is the one a paired athlete opens to
 * check on the other person, so it leads with a matchup rather than a report.
 *
 * Everything on their side comes from the couple document, live via
 * `watchMyCouple`. Anything they have not shared renders as "not shared", never
 * as a zero — see `partnerSharing.ts`.
 */
export default function PartnerDashboardScreen() {
  const router = useRouter();
  const { couple, paired, partner, streak } = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUrl = useProfileStore((s) => s.avatarUri);
  const sessions = useProfileStore((s) => s.sessions);
  const drinks = useHydrationStore((s) => s.drinks);
  const shareSteps = useSharingStore((s) => s.steps);
  const shareWater = useSharingStore((s) => s.water);
  const { steps: myStepsState } = useStepsToday();
  const [nudging, setNudging] = useState(false);

  const today = dayKey();
  const iTrained = sessions.some((s) => s.day === today);
  const theirs = useMemo(() => partnerToday(partner, iTrained, today), [partner, iTrained, today]);

  const mySteps = myStepsState.status === 'ready' ? myStepsState.steps : null;
  const myWater = selectTodayMl({ drinks }, today);

  useEffect(() => {
    track('couple_partner_dashboard');
  }, []);

  /* Publish my own side on arrival. Otherwise it only goes out from Home, so
     someone who pairs and comes straight here shows up as "not shared" on
     their partner's screen until they happen to pass through Home. Memoised
     and gated on the switch inside, so this is a no-op when nothing moved. */
  useEffect(() => {
    void syncHydrationNow(couple?.id, uid);
  }, [couple?.id, uid]);

  if (!paired || !partner || !couple) {
    return (
      <Screen>
        <ModalHeader title="Partner" />
        <Card style={styles.pad}>
          <Text style={styles.emptyTitle}>Pair up to see each other’s day</Text>
          <Text style={[text.caption, styles.emptyBody]}>
            Once you’re paired, you’ll both see who trained today, and each of you chooses
            whether to share steps and water.
          </Text>
          <PressableScale
            onPress={() => router.replace('/modal/couple-invite')}
            accessibilityRole="button"
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>Invite your partner</Text>
          </PressableScale>
        </Card>
      </Screen>
    );
  }

  const partnerName = partner.displayName?.trim() || 'Partner';
  const myName = displayName?.trim() || 'You';
  const race = stepRace(mySteps, theirs.steps.kind === 'shown' ? theirs.steps.value : null);
  const raceLine = stepRaceLine(race, partnerName);

  const toggle = (key: SharedMetricKey, on: boolean) => {
    track('couple_sharing_changed', { metric: key, on });
    void setMetricSharing(couple.id, uid, key, on);
  };

  const onNudge = async () => {
    if (!uid || nudging) return;
    setNudging(true);
    try {
      await nudgePartner(couple.id, uid, myName);
      track('couple_nudge_sent');
      showDialog({
        title: 'Nudge sent',
        message: `${partnerName} will get a push to come train.`,
        tone: 'success',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    } catch (error) {
      captureError(error);
      showDialog({
        title: 'Nudge failed',
        message:
          error instanceof Error
            ? error.message
            : "We couldn't send that nudge. Check your connection and try again.",
        tone: 'danger',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    } finally {
      setNudging(false);
    }
  };

  const openDuel = (kind: 'duel' | 'train') =>
    router.push({
      pathname: '/duel/new',
      params: {
        role: 'host',
        kind,
        target: partner.uid,
        name: partnerName,
        ...(partner.avatarUrl ? { avatar: partner.avatarUrl } : {}),
      },
    });

  return (
    <Screen>
      <ModalHeader title="Today, together" subtitle={`You & ${partnerName}`} />

      {/* ── Face-off hero ── */}
      <Animated.View entering={FadeInDown.duration(360).springify()}>
        <GradientCard colors={gradients.ink} glow="brand" style={styles.hero}>
          <View style={styles.faceoff}>
            <Fighter
              name={myName}
              uri={avatarUrl}
              trained={iTrained}
              ringColor={palette.purple500}
            />
            <Animated.View entering={ZoomIn.delay(180).springify()} style={styles.vsBadge}>
              <Text style={styles.vsText}>VS</Text>
            </Animated.View>
            <Fighter
              name={partnerName}
              uri={partner.avatarUrl}
              trained={theirs.trainedToday}
              ringColor={palette.amber500}
            />
          </View>
          {theirs.headline ? <Text style={styles.heroHeadline}>{theirs.headline}</Text> : null}
          {streak > 0 ? (
            <Text style={styles.heroStreak}>🔥 {streak}-day streak together</Text>
          ) : null}
        </GradientCard>
      </Animated.View>

      {/* ── Head to head ── */}
      <SectionLabel>TODAY’S MATCHUP</SectionLabel>
      <Animated.View entering={FadeInDown.delay(80).duration(320)}>
        <Card style={styles.pad}>
          <Matchup
            emoji="👟"
            title="Steps"
            mine={mySteps}
            mineLabel={mySteps == null ? null : formatSteps(mySteps)}
            theirs={theirs.steps}
          />
          <View style={styles.divider} />
          <Matchup
            emoji="💧"
            title="Water"
            mine={myWater > 0 ? myWater : null}
            mineLabel={myWater > 0 ? formatMl(myWater) : null}
            theirs={theirs.water}
          />
          {raceLine ? <Text style={styles.raceLine}>{raceLine}</Text> : null}
          <View style={styles.legend}>
            <Dot color={palette.purple500} label="You" />
            <Dot color={palette.amber500} label={partnerName} />
          </View>
        </Card>
      </Animated.View>

      {/* ── Actions ── */}
      <Animated.View entering={FadeInDown.delay(140).duration(320)} style={styles.actions}>
        <ActionTile
          emoji="⚔️"
          label="Race live"
          hint="Rep for rep"
          colors={gradients.squat}
          onPress={() => openDuel('duel')}
        />
        <ActionTile
          emoji="🤝"
          label="Train together"
          hint="One shared score"
          colors={gradients.brandStrong}
          onPress={() => openDuel('train')}
        />
        <ActionTile
          emoji="👋"
          label={nudging ? 'Sending…' : 'Nudge'}
          hint="Push them to move"
          colors={gradients.amber}
          onPress={() => void onNudge()}
        />
      </Animated.View>

      {/* ── What I share ── */}
      <SectionLabel>WHAT YOU SHARE</SectionLabel>
      <Animated.View entering={FadeInDown.delay(200).duration(320)}>
        <Card style={styles.pad}>
          <ShareRow
            label="Steps today"
            detail="Your daily step count"
            value={shareSteps}
            onChange={(v) => toggle('steps', v)}
          />
          <View style={styles.divider} />
          <ShareRow
            label="Water today"
            detail="How much you've drunk"
            value={shareWater}
            onChange={(v) => toggle('water', v)}
          />
          <View style={styles.divider} />
          <View style={styles.shareRow}>
            <View style={styles.shareCopy}>
              <Text style={styles.shareLabel}>Workouts</Text>
              <Text style={[text.caption, styles.shareDetail]}>
                Always shared: your streak together counts the days you both train
              </Text>
            </View>
            <Text style={styles.alwaysOn}>ON</Text>
          </View>
          <Text style={[text.caption, styles.summary]}>
            {sharingSummary({ steps: shareSteps, water: shareWater }, partnerName)} Turning one
            off removes today’s number from their screen right away.
          </Text>
        </Card>
      </Animated.View>

      <PressableScale
        onPress={() => router.push('/couple')}
        accessibilityRole="button"
        style={styles.linkRow}
      >
        <Text style={styles.linkText}>See your bond’s history ›</Text>
      </PressableScale>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Fighter({
  name,
  uri,
  trained,
  ringColor,
}: {
  name: string;
  uri: string | null | undefined;
  trained: boolean;
  ringColor: string;
}) {
  return (
    <View style={styles.fighter}>
      <View style={[styles.ring, { borderColor: trained ? ringColor : 'rgba(255,255,255,0.18)' }]}>
        <Avatar
          initial={(name.charAt(0) || '?').toUpperCase()}
          uri={uri}
          size={64}
          background={palette.inkSoft}
          color={palette.white}
        />
      </View>
      <Text style={styles.fighterName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.fighterState, { color: trained ? ringColor : palette.grey500 }]}>
        {trained ? 'TRAINED ✓' : 'NOT YET'}
      </Text>
    </View>
  );
}

/**
 * Two bars, scaled to whichever side is larger, so the gap between them is
 * the picture. Scaling to a goal would make two people both past it look
 * identical, which is exactly the comparison this row exists to make.
 */
function Matchup({
  emoji,
  title,
  mine,
  mineLabel,
  theirs,
}: {
  emoji: string;
  title: string;
  mine: number | null;
  mineLabel: string | null;
  theirs: SharedMetric;
}) {
  const theirValue = theirs.kind === 'shown' ? theirs.value : null;
  const max = Math.max(mine ?? 0, theirValue ?? 0, 1);

  return (
    <View>
      <Text style={styles.matchTitle}>
        {emoji} {title}
      </Text>
      <Bar color={palette.purple500} value={mine} max={max} label={mineLabel ?? '—'} />
      <Bar
        color={palette.amber500}
        value={theirValue}
        max={max}
        label={theirs.kind === 'shown' ? theirs.label : 'Not shared'}
        muted={theirs.kind !== 'shown'}
      />
    </View>
  );
}

function Bar({
  color,
  value,
  max,
  label,
  muted,
}: {
  color: string;
  value: number | null;
  max: number;
  label: string;
  muted?: boolean;
}) {
  const pct = value == null ? 0 : Math.max(4, Math.round((value / max) * 100));
  return (
    <View style={styles.barRow}>
      <View style={styles.barTrack}>
        {value != null ? (
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]}
          />
        ) : null}
      </View>
      <Text style={[styles.barLabel, muted && styles.barLabelMuted]}>{label}</Text>
    </View>
  );
}

function ActionTile({
  emoji,
  label,
  hint,
  colors,
  onPress,
}: {
  emoji: string;
  label: string;
  hint: string;
  colors: Gradient;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.actionWrap}>
      <GradientCard colors={colors} style={styles.action}>
        <Text style={styles.actionEmoji}>{emoji}</Text>
        <Text style={styles.actionLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.actionHint} numberOfLines={2}>
          {hint}
        </Text>
      </GradientCard>
    </PressableScale>
  );
}

function ShareRow({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareCopy}>
        <Text style={styles.shareLabel}>{label}</Text>
        <Text style={[text.caption, styles.shareDetail]}>{detail}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={`Share ${label.toLowerCase()}`} />
    </View>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.dotItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[text.caption, styles.dotLabel]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16 },
  hero: { paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center' },
  faceoff: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  fighter: { flex: 1, alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: 40, padding: 3 },
  fighterName: { marginTop: 8, color: palette.white, ...font('bold', 15), maxWidth: 120 },
  fighterState: { marginTop: 2, ...font('extrabold', 11), letterSpacing: 1 },
  vsBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: { color: palette.white, ...font('extrabold', 15), letterSpacing: 1 },
  heroHeadline: { marginTop: 16, color: palette.white, ...font('bold', 16), textAlign: 'center' },
  heroStreak: { marginTop: 6, color: palette.amber300, ...font('bold', 13) },
  matchTitle: { ...font('bold', 15), color: palette.ink, marginBottom: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: palette.track, overflow: 'hidden' },
  barFill: { height: 12, borderRadius: 6 },
  barLabel: { width: 84, textAlign: 'right', ...font('bold', 13), color: palette.ink },
  barLabelMuted: { ...font('medium', 13), color: palette.grey500 },
  divider: { height: 1, backgroundColor: palette.divider, marginVertical: 12 },
  raceLine: { marginTop: 12, ...font('bold', 14), color: palette.green700 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  dotItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLabel: { color: palette.slate500 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionWrap: { flex: 1 },
  action: { paddingVertical: 14, paddingHorizontal: 10, minHeight: 104, borderRadius: radius.lg },
  actionEmoji: { fontSize: 24 },
  actionLabel: { marginTop: 6, color: palette.white, ...font('extrabold', 14) },
  actionHint: { marginTop: 2, color: 'rgba(255,255,255,0.85)', ...font('medium', 11) },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareCopy: { flex: 1 },
  shareLabel: { ...font('bold', 15), color: palette.ink },
  shareDetail: { marginTop: 2, color: palette.slate500 },
  alwaysOn: { ...font('extrabold', 12), color: palette.green600, letterSpacing: 1 },
  summary: { marginTop: 14, color: palette.slate500 },
  emptyTitle: { ...font('bold', 17), color: palette.ink },
  emptyBody: { marginTop: 6, color: palette.slate500 },
  linkRow: { alignItems: 'center', paddingVertical: 18 },
  linkText: { ...font('bold', 14), color: palette.green700 },
});
