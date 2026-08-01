import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Badge, Card, Divider, Eyebrow, PressableScale, PrimaryButton, Screen, StatTile } from '@/components/ui';
import { getOpponent, OPPONENTS } from '@/domain/opponent';
import { getPhantomOpponent } from '@/domain/phantomRoster';
import { isRecentlyActive } from '@/domain/presence';
import { blockUser } from '@/services/safetyService';
import { fetchProfile } from '@/services/userService';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { showDialog } from '@/state/useDialog';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

const TINTS: Record<string, { background: string; color: string }> = {
  adrian: { background: '#ddd6fe', color: '#5b21b6' },
  zheng: { background: '#bfdbfe', color: '#1e40af' },
  mia: { background: '#fde68a', color: '#92400e' },
};

function isKnownBot(id: string | undefined): boolean {
  if (!id) return false;
  if (OPPONENTS.some((o) => o.id === id)) return true;
  return !!getPhantomOpponent(id);
}

export default function FriendProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    level?: string;
    avatar?: string;
    online?: string;
  }>();
  const sessions = useProfileStore((s) => s.sessions);
  const myUid = useAuthStore((s) => s.user?.uid);

  const bot = isKnownBot(params.id);
  const friend = bot
    ? getOpponent(params.id)
    : {
        id: params.id ?? '',
        name: params.name ?? 'Athlete',
        initial: (params.name || 'A').charAt(0).toUpperCase(),
        level: Number(params.level ?? 1) || 1,
        online: params.online === '1',
        avatarUrl: params.avatar || null,
      };

  const [cloudOnline, setCloudOnline] = useState(friend.online);
  const [cloudName, setCloudName] = useState(friend.name);
  const [cloudAvatar, setCloudAvatar] = useState(
    'avatarUrl' in friend ? friend.avatarUrl : null,
  );

  useEffect(() => {
    if (bot || !params.id) return;
    let cancelled = false;
    void fetchProfile(params.id).then((profile) => {
      if (cancelled || !profile) return;
      setCloudName(profile.displayName || cloudName);
      setCloudAvatar(profile.avatarUrl);
      if (typeof profile.lastActiveAt === 'number') {
        setCloudOnline(isRecentlyActive(profile.lastActiveAt));
      }
    });
    return () => {
      cancelled = true;
    };
    // Intentionally only re-fetch when the friend id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot, params.id]);

  const displayName = bot ? friend.name : cloudName;
  const displayLevel = friend.level;
  const displayOnline = bot ? friend.online : cloudOnline;

  const duels = sessions.filter((s) => s.mode === 'versus' && s.opponentId === friend.id);
  const decisive = duels.filter((s) => !s.drew);
  const wins = decisive.filter((s) => s.won).length;
  const losses = decisive.filter((s) => !s.won).length;
  const totalReps = duels.reduce((acc, s) => acc + s.reps, 0);

  const tint = TINTS[friend.id] ?? { background: palette.green50, color: palette.green700 };

  const headline =
    duels.length === 0
      ? 'No duels yet — go settle it'
      : wins > losses
        ? `You're ahead ${wins}–${losses}`
        : losses > wins
          ? `${displayName} leads ${losses}–${wins} — time for revenge`
          : `Dead even ${wins}–${losses} — settle it`;

  const challenge = () => {
    if (bot) {
      router.replace({
        pathname: '/session',
        params: { exercise: 'push', mode: 'versus', opponent: friend.id },
      });
      return;
    }
    router.replace({
      pathname: '/duel/new',
      params: {
        role: 'host',
        target: friend.id,
        name: displayName,
        level: String(displayLevel),
        kind: 'duel',
      },
    });
  };

  const onReport = () => {
    if (bot || !friend.id) return;
    router.push({
      pathname: '/modal/report-user',
      params: { target: friend.id, name: displayName },
    });
  };

  const onBlock = () => {
    if (bot || !myUid || !friend.id) return;
    showDialog({
      title: `Block ${displayName}?`,
      message:
        'They won’t appear in your friends or discovery. You can unblock them later in Settings.',
      tone: 'danger',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Block',
          variant: 'destructive',
          onPress: () => {
            void blockUser(myUid, friend.id, displayName)
              .then(() => {
                showDialog({
                  title: 'Blocked',
                  message: `${displayName} is blocked.`,
                  tone: 'success',
                  actions: [{ label: 'Done', variant: 'primary', onPress: () => router.back() }],
                });
              })
              .catch((err) => {
                showDialog({
                  title: 'Could not block',
                  message: err instanceof Error ? err.message : 'Please try again.',
                  tone: 'danger',
                  actions: [{ label: 'Got it', variant: 'primary' }],
                });
              });
          },
        },
      ],
    });
  };

  return (
    <Screen>
      <ModalHeader title={displayName} />

      <View style={styles.identity}>
        <Avatar
          initial={(displayName || 'A').charAt(0).toUpperCase()}
          uri={!bot ? (cloudAvatar ?? undefined) : undefined}
          size={88}
          square
          background={tint.background}
          color={tint.color}
          online={displayOnline}
        />
        <Text style={[font('extrabold', 22, { color: palette.ink }), { marginTop: 12 }]}>
          {displayName}
        </Text>
        <Text style={text.captionMd}>Level {displayLevel}</Text>
        <Text
          style={font('extrabold', 11, {
            color: displayOnline ? palette.green500 : palette.grey600,
            marginTop: 4,
          })}
        >
          {displayOnline ? '● Active' : 'Offline'}
        </Text>
      </View>

      <LinearGradient colors={gradients.ink} style={styles.h2h}>
        <Text style={styles.h2hLabel}>HEAD TO HEAD</Text>
        <View style={styles.h2hScores}>
          <View style={{ alignItems: 'center' }}>
            <Text style={font('extrabold', 40, { color: palette.green500 })}>{wins}</Text>
            <Text style={styles.h2hSide}>YOU</Text>
          </View>
          <Text style={font('extrabold', 16, { color: 'rgba(255,255,255,0.4)' })}>–</Text>
          <View style={{ alignItems: 'center' }}>
            <Text style={font('extrabold', 40, { color: palette.white })}>{losses}</Text>
            <Text style={styles.h2hSide}>{displayName.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.h2hHeadline}>{headline}</Text>
      </LinearGradient>

      <View style={styles.statRow}>
        <StatTile value={totalReps} label="Your reps vs them" color={palette.green500} />
        <StatTile value={duels.length} label="Duels played" color={palette.green500} />
      </View>

      {duels.length > 0 ? (
        <>
          <Eyebrow style={{ marginBottom: 8 }}>RECENT DUELS</Eyebrow>
          <Card style={{ padding: 8, marginBottom: 20 }}>
            {duels.slice(0, 5).map((duel, index) => (
              <View key={duel.id}>
                {index > 0 ? <Divider style={{ marginHorizontal: 8 }} /> : null}
                <View style={styles.duelRow}>
                  <View style={styles.duelIcon}>
                    <Text style={{ fontSize: 16 }}>{duel.exercise === 'squat' ? '🦵' : '💪'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={font('extrabold', 13, { color: palette.ink })}>
                      {duel.exercise === 'squat' ? 'Squats' : 'Push-ups'} · {duel.reps}–
                      {duel.opponentReps ?? 0}
                    </Text>
                    <Text style={text.caption}>
                      {new Date(duel.completedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Badge
                    label={duel.drew ? 'Draw' : duel.won ? 'You won' : 'Lost'}
                    color={
                      duel.drew ? palette.slate500 : duel.won ? palette.green600 : palette.red500
                    }
                    background={
                      duel.drew ? '#f4f4f5' : duel.won ? palette.green50 : palette.red100
                    }
                  />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <PrimaryButton label={`Challenge ${displayName}`} onPress={challenge} />

      {!bot && friend.id ? (
        <View style={styles.safetyRow}>
          <PressableScale
            onPress={onReport}
            accessibilityRole="button"
            accessibilityLabel={`Report ${displayName}`}
            style={styles.safetyBtn}
          >
            <Text style={font('bold', 13, { color: palette.grey600 })}>Report</Text>
          </PressableScale>
          <PressableScale
            onPress={onBlock}
            accessibilityRole="button"
            accessibilityLabel={`Block ${displayName}`}
            style={styles.safetyBtn}
          >
            <Text style={font('extrabold', 13, { color: palette.red500 })}>Block</Text>
          </PressableScale>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', paddingBottom: 8 },
  h2h: { borderRadius: radius['4xl'], padding: 16, marginVertical: 16 },
  h2hLabel: {
    ...font('extrabold', 10, { color: palette.green300 }),
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  h2hScores: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  h2hSide: font('bold', 10, { color: 'rgba(255,255,255,0.6)' }),
  h2hHeadline: {
    ...font('bold', 11, { color: 'rgba(255,255,255,0.75)' }),
    textAlign: 'center',
    marginTop: 8,
  },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  duelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8 },
  duelIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginTop: 16,
    marginBottom: 8,
  },
  safetyBtn: { paddingVertical: 8, paddingHorizontal: 12 },
});
