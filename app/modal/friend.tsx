import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Badge, Card, Divider, Eyebrow, PrimaryButton, Screen, StatTile } from '@/components/ui';
import { getOpponent, OPPONENTS } from '@/domain/opponent';
import { getPhantomOpponent } from '@/domain/phantomRoster';
import { fetchProfile } from '@/services/userService';
import { useProfileStore } from '@/state/profileStore';
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
        setCloudOnline(Date.now() - profile.lastActiveAt < 15 * 60 * 1000);
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
  const wins = duels.filter((s) => s.won).length;
  const losses = duels.length - wins;
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
            marginTop: 6,
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
          <Eyebrow style={{ marginBottom: 10 }}>RECENT DUELS</Eyebrow>
          <Card style={{ padding: 8, marginBottom: 22 }}>
            {duels.slice(0, 5).map((duel, index) => (
              <View key={duel.id}>
                {index > 0 ? <Divider style={{ marginHorizontal: 10 }} /> : null}
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
                    label={duel.won ? 'You won' : 'Lost'}
                    color={duel.won ? palette.green600 : palette.red500}
                    background={duel.won ? palette.green50 : palette.red100}
                  />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <PrimaryButton label={`Challenge ${displayName}`} onPress={challenge} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', paddingBottom: 10 },
  h2h: { borderRadius: radius['4xl'], padding: 18, marginVertical: 18 },
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
    marginTop: 10,
  },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  duelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10 },
  duelIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
