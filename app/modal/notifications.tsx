import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, Eyebrow, PressableScale, Screen, Skeleton, SkeletonCircle } from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { getExercise, type ExerciseId } from '@/vision/exercises';
import { getOpponent } from '@/domain/opponent';
import { invitePresentation } from '@/domain/presence';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { fetchIncomingDuels, cancelDuel, type IncomingDuel } from '@/services/duelService';
import { captureError } from '@/lib/crash';
import { useAuthStore } from '@/state/authStore';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

export default function NotificationsScreen() {
  const router = useRouter();
  const profile = useProfileStore();
  const duelInvites = useSettingsStore((s) => s.duelInvites);
  const uid = useAuthStore((s) => s.user?.uid);

  const streak = selectStreak(profile);
  const challenger = getOpponent('adrian');
  const lastSession = profile.sessions[0];

  // Real async challenges addressed to this athlete. Empty until Firebase is
  // provisioned, in which case the demo bot invite below stands in.
  const [incoming, setIncoming] = useState<IncomingDuel[]>([]);
  const [loading, setLoading] = useState(!!uid);
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setLoading(true);
    void fetchIncomingDuels(uid)
      .then((list) => {
        if (!cancelled) setIncoming(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  /** Accept a real challenge: join it as the guest via the waiting room. */
  const accept = (invite: IncomingDuel) =>
    router.replace({ pathname: '/duel/[id]', params: { id: invite.id, role: 'guest' } });

  /** Decline on the server so the invite does not reappear on the next open. */
  const dismiss = (invite: IncomingDuel) => {
    setIncoming((prev) => prev.filter((d) => d.id !== invite.id));
    void cancelDuel(invite.id).catch(captureError);
  };

  const seed = usePhantomSeed();

  return (
    <Screen>
      <ModalHeader title="Notifications" />

      {!duelInvites ? (
        <StaggerIn index={0}>
          <Card style={styles.mutedBanner}>
            <View style={styles.mutedIcon}>
              <NotifGlyph name="muted" color={palette.slate500} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.cardTitle}>Duel invites are muted</Text>
              <Text style={text.caption}>Turn on Duel invites in Settings to get pinged</Text>
            </View>
          </Card>
        </StaggerIn>
      ) : null}

      <StaggerIn index={1}>
        <Eyebrow style={{ marginBottom: 10 }}>INVITES</Eyebrow>
        {loading ? (
          <InviteSkeleton />
        ) : incoming.length > 0 ? (
          <View style={{ gap: 12 }}>
            {incoming.map((invite) => {
              const ex = getExercise(invite.exercise as ExerciseId);
              const copy = invitePresentation(invite.kind, invite.cooperative);
              return (
                <InviteCard
                  key={invite.id}
                  name={invite.hostName}
                  verb={copy.verb}
                  avatar={
                    <Avatar
                      initial={(invite.hostName || 'A').charAt(0).toUpperCase()}
                      uri={invite.hostAvatarUrl ?? undefined}
                      size={44}
                    />
                  }
                  chips={[
                    copy.chip,
                    `${ex.hudLabel}`,
                    `${invite.duration}s`,
                    `Lv.${invite.hostLevel}`,
                  ]}
                  onAccept={() => accept(invite)}
                  onDismiss={() => dismiss(invite)}
                />
              );
            })}
          </View>
        ) : seed.isSeeding && seed.phantomOnline.length > 0 ? (
          <View style={{ gap: 12 }}>
            {seed.phantomOnline.slice(0, 2).map((phantom) => (
              <InviteCard
                key={phantom.id}
                name={phantom.name}
                verb="Challenged you to a duel"
                avatar={
                  <Avatar
                    initial={phantom.initial}
                    emoji={phantom.emoji}
                    size={44}
                    background={phantom.tintBg}
                    color={phantom.tintColor}
                  />
                }
                chips={['Duel', 'Push-up', '20s', `Lv.${phantom.level}`]}
                onAccept={() =>
                  router.replace({
                    pathname: '/session',
                    params: { exercise: 'push', mode: 'versus', opponent: phantom.id },
                  })
                }
                onDismiss={() => router.back()}
              />
            ))}
          </View>
        ) : (
          <InviteCard
            name={challenger.name}
            verb="Challenged you to a duel"
            avatar={
              <Avatar
                initial={challenger.initial}
                size={44}
                background={palette.green50}
                color={palette.green700}
              />
            }
            chips={['Duel', 'Push-up', '20s']}
            onAccept={() =>
              router.replace({
                pathname: '/session',
                params: { exercise: 'push', mode: 'versus', opponent: challenger.id },
              })
            }
            onDismiss={() => router.back()}
          />
        )}
      </StaggerIn>

      <StaggerIn index={2}>
        <Eyebrow style={{ marginTop: 20, marginBottom: 10 }}>EARLIER</Eyebrow>
        <View style={{ gap: 10 }}>
          {lastSession ? (
          <NotificationRow
            glyph="trophy"
            title={
              lastSession.won
                ? `You won your last duel ${lastSession.reps}–${lastSession.opponentReps ?? 0}`
                : `You logged ${lastSession.reps} reps`
            }
            subtitle={`+${lastSession.xp} XP earned`}
            meta={timeAgo(lastSession.completedAt)}
          />
        ) : null}

        <NotificationRow
          glyph="streak"
          title="Streak reminder"
          subtitle={
            streak > 0
              ? `Train today to keep your ${streak}-day streak`
              : 'Train today to start a streak'
          }
          meta="Daily"
        />
        </View>
      </StaggerIn>
    </Screen>
  );
}

/**
 * A single incoming-challenge card — a clean white surface with a green avatar
 * ring, a NEW pill, spec chips, and a filled Accept / ghost Later pair. One
 * component drives real, seeded, and fallback invites.
 */
function InviteCard({
  name,
  verb,
  avatar,
  chips,
  onAccept,
  onDismiss,
}: {
  name: string;
  verb: string;
  avatar: ReactNode;
  chips: string[];
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card style={styles.inviteCard}>
      <View style={styles.inviteTop}>
        <View style={styles.avatarRing}>{avatar}</View>
        <View style={{ flex: 1 }}>
          <View style={styles.inviteNameRow}>
            <Text style={font('extrabold', 15, { color: palette.ink })} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.newPill}>
              <Text style={styles.newPillText}>NEW</Text>
            </View>
          </View>
          <Text style={font('semibold', 12, { color: palette.slate500 })}>{verb}</Text>
        </View>
      </View>

      <View style={styles.chipsRow}>
        {chips.map((chip) => (
          <View key={chip} style={styles.metaChip}>
            <Text style={styles.metaChipText}>{chip}</Text>
          </View>
        ))}
      </View>

      <View style={styles.inviteActions}>
        <PressableScale
          onPress={onAccept}
          accessibilityRole="button"
          accessibilityLabel={`Accept duel from ${name}`}
          style={styles.acceptButton}
        >
          <Text style={font('extrabold', 14, { color: palette.white })}>Accept</Text>
        </PressableScale>
        <PressableScale
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Decide later"
          style={styles.laterButton}
        >
          <Text style={font('extrabold', 14, { color: palette.slate500 })}>Later</Text>
        </PressableScale>
      </View>
    </Card>
  );
}

/** Compact relative timestamp for the activity feed — "2h ago", "Just now". */
function timeAgo(value: number | string): string {
  const then = new Date(value).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** iOS-style shimmer placeholder shown while incoming challenges load. */
function InviteSkeleton() {
  return (
    <Card style={styles.skelCard}>
      <View style={styles.inviteHeader}>
        <SkeletonCircle size={50} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="68%" height={14} />
          <Skeleton width="44%" height={11} />
        </View>
      </View>
      <View style={styles.chipsRow}>
        <Skeleton width={92} height={22} radius={8} />
        <Skeleton width={48} height={22} radius={8} />
        <Skeleton width={56} height={22} radius={8} />
      </View>
      <View style={styles.inviteActions}>
        <Skeleton height={44} radius={radius.lg} style={{ flex: 1 }} />
        <Skeleton width={96} height={44} radius={radius.lg} />
      </View>
    </Card>
  );
}

function NotificationRow({
  glyph,
  title,
  subtitle,
  meta,
}: {
  glyph: NotifGlyphName;
  title: string;
  subtitle: string;
  meta?: string;
}) {
  return (
    <Card style={styles.row}>
      <View style={styles.rowIcon}>
        <NotifGlyph name={glyph} color={palette.green600} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={font('extrabold', 14, { color: palette.ink })}>{title}</Text>
        <Text style={text.caption}>{subtitle}</Text>
      </View>
      {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
    </Card>
  );
}

type NotifGlyphName = 'trophy' | 'streak' | 'muted';

/** Minimal monochrome line icons — keeps the list on one accent, no emoji. */
function NotifGlyph({ name, color }: { name: NotifGlyphName; color: string }) {
  const common = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {name === 'trophy' ? (
        <>
          <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" {...common} />
          <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" {...common} />
          <Path d="M4 22h16" {...common} />
          <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" {...common} />
          <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" {...common} />
          <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" {...common} />
        </>
      ) : name === 'streak' ? (
        <Path
          d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
          {...common}
        />
      ) : (
        <>
          <Path d="M8.7 3A6 6 0 0 1 18 8v3c0 1.2.35 2.2.9 3" {...common} />
          <Path d="M6 8c0-.7.13-1.36.36-2M6 8v3c0 3-2 4-2 4h13" {...common} />
          <Path d="M10 20a2 2 0 0 0 4 0" {...common} />
          <Path d="M3 3l18 18" {...common} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  mutedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    marginBottom: 16,
    backgroundColor: palette.canvas,
  },
  inviteCard: { padding: 16 },
  skelCard: { padding: 16 },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: {
    padding: 3,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: palette.green500,
  },
  inviteNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newPill: {
    backgroundColor: palette.green50,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newPillText: {
    ...font('extrabold', 8, { color: palette.green700 }),
    letterSpacing: 0.6,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  metaChip: {
    backgroundColor: palette.canvas,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  metaChipText: font('bold', 10.5, { color: palette.slate600 }),
  inviteActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  acceptButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButton: {
    width: 96,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowMeta: {
    ...font('bold', 10, { color: palette.grey500 }),
    alignSelf: 'flex-start',
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.green50,
  },
  mutedIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
  },
});
