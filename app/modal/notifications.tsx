import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { getExercise, type ExerciseId } from '@/vision/exercises';
import { getOpponent } from '@/domain/opponent';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { fetchIncomingDuels, type IncomingDuel } from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

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
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void fetchIncomingDuels(uid).then((list) => {
      if (!cancelled) setIncoming(list);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  /** Accept a real challenge: join it as the guest via the waiting room. */
  const accept = (invite: IncomingDuel) =>
    router.replace({ pathname: '/duel/[id]', params: { id: invite.id, role: 'guest' } });

  const seed = usePhantomSeed();

  return (
    <Screen>
      <ModalHeader title="Notifications" />

      {!duelInvites ? (
        <StaggerIn index={0}>
          <Card style={styles.mutedBanner}>
            <Text style={{ fontSize: 20 }}>🔕</Text>
            <View style={{ flex: 1 }}>
              <Text style={text.cardTitle}>Duel invites are muted</Text>
              <Text style={text.caption}>Turn on Duel invites in Settings to get pinged</Text>
            </View>
          </Card>
        </StaggerIn>
      ) : null}

      <StaggerIn index={1}>
        {incoming.length > 0 ? (
          <View style={{ gap: 12 }}>
            {incoming.map((invite) => {
              const ex = getExercise(invite.exercise as ExerciseId);
              return (
                <LinearGradient
                  key={invite.id}
                  colors={gradients.brandStrong}
                  style={[styles.inviteCard, shadow.brand]}
                >
                  <View style={styles.inviteHeader}>
                    <Avatar
                      initial={(invite.hostName || 'A').charAt(0).toUpperCase()}
                      uri={invite.hostAvatarUrl ?? undefined}
                      size={44}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={font('extrabold', 15, { color: palette.white })}>
                        {invite.hostName} challenged you
                      </Text>
                      <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.9)' })}>
                        {ex.hudLabel} duel · {invite.duration}s · Lv.{invite.hostLevel}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.inviteActions}>
                    <PressableScale
                      onPress={() => accept(invite)}
                      accessibilityRole="button"
                      accessibilityLabel={`Accept duel from ${invite.hostName}`}
                      style={styles.acceptButton}
                    >
                      <Text style={font('extrabold', 14, { color: palette.green600 })}>Accept</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => setIncoming((prev) => prev.filter((d) => d.id !== invite.id))}
                      accessibilityRole="button"
                      accessibilityLabel="Decide later"
                      style={styles.laterButton}
                    >
                      <Text style={font('extrabold', 14, { color: palette.white })}>Later</Text>
                    </PressableScale>
                  </View>
                </LinearGradient>
              );
            })}
          </View>
        ) : seed.isSeeding && seed.phantomOnline.length > 0 ? (
          <View style={{ gap: 12 }}>
            {seed.phantomOnline.slice(0, 2).map((phantom) => (
              <LinearGradient
                key={phantom.id}
                colors={gradients.brandStrong}
                style={[styles.inviteCard, shadow.brand]}
              >
                <View style={styles.inviteHeader}>
                  <Avatar
                    initial={phantom.initial}
                    emoji={phantom.emoji}
                    size={44}
                    background={phantom.tintBg}
                    color={phantom.tintColor}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={font('extrabold', 15, { color: palette.white })}>
                      {phantom.name} challenged you
                    </Text>
                    <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.9)' })}>
                      Push-up duel · 20s · Lv.{phantom.level}
                    </Text>
                  </View>
                </View>

                <View style={styles.inviteActions}>
                  <PressableScale
                    onPress={() =>
                      router.replace({
                        pathname: '/session',
                        params: { exercise: 'push', mode: 'versus', opponent: phantom.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Accept duel from ${phantom.name}`}
                    style={styles.acceptButton}
                  >
                    <Text style={font('extrabold', 14, { color: palette.green600 })}>Accept</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel="Decide later"
                    style={styles.laterButton}
                  >
                    <Text style={font('extrabold', 14, { color: palette.white })}>Later</Text>
                  </PressableScale>
                </View>
              </LinearGradient>
            ))}
          </View>
        ) : (
          <LinearGradient colors={gradients.brandStrong} style={[styles.inviteCard, shadow.brand]}>
            <View style={styles.inviteHeader}>
              <View style={styles.inviteAvatar}>
                <Text style={font('extrabold', 17, { color: palette.white })}>
                  {challenger.initial}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 15, { color: palette.white })}>
                  {challenger.name} challenged you
                </Text>
                <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.9)' })}>
                  Push-up duel · 20s
                </Text>
              </View>
            </View>

            <View style={styles.inviteActions}>
              <PressableScale
                onPress={() =>
                  router.replace({
                    pathname: '/session',
                    params: { exercise: 'push', mode: 'versus', opponent: challenger.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Accept duel from ${challenger.name}`}
                style={styles.acceptButton}
              >
                <Text style={font('extrabold', 14, { color: palette.green600 })}>Accept</Text>
              </PressableScale>
              <PressableScale
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Decide later"
                style={styles.laterButton}
              >
                <Text style={font('extrabold', 14, { color: palette.white })}>Later</Text>
              </PressableScale>
            </View>
          </LinearGradient>
        )}
      </StaggerIn>

      <StaggerIn index={2}>
        <Eyebrow style={{ marginTop: 20, marginBottom: 10 }}>EARLIER</Eyebrow>
        <View style={{ gap: 10 }}>
          {lastSession ? (
            <NotificationRow
              emoji={lastSession.won ? '🏅' : '💪'}
              tint={lastSession.won ? palette.amber50 : palette.green50}
              title={
                lastSession.won
                  ? `You won your last duel ${lastSession.reps}–${lastSession.opponentReps ?? 0}`
                  : `You logged ${lastSession.reps} reps`
              }
              subtitle={`+${lastSession.xp} XP earned`}
            />
          ) : null}

          <NotificationRow
            emoji="🔥"
            tint={palette.red100}
            title="Streak reminder"
            subtitle={
              streak > 0
                ? `Train today to keep your ${streak}-day streak`
                : 'Train today to start a streak'
            }
          />
        </View>
      </StaggerIn>
    </Screen>
  );
}

function NotificationRow({
  emoji,
  tint,
  title,
  subtitle,
}: {
  emoji: string;
  tint: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Card style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={font('extrabold', 14, { color: palette.ink })}>{title}</Text>
        <Text style={text.caption}>{subtitle}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  mutedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    marginBottom: 16,
    backgroundColor: '#fff8ec',
  },
  inviteCard: { borderRadius: radius['4xl'], padding: 18 },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  acceptButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButton: {
    width: 100,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
