import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Badge, Card, Divider, Eyebrow, PrimaryButton, Screen, StatTile } from '@/components/ui';
import { getOpponent } from '@/domain/opponent';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

const TINTS: Record<string, { background: string; color: string }> = {
  adrian: { background: '#ddd6fe', color: '#5b21b6' },
  zheng: { background: '#bfdbfe', color: '#1e40af' },
  mia: { background: '#fde68a', color: '#92400e' },
};

export default function FriendProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const friend = getOpponent(id);
  const sessions = useProfileStore((s) => s.sessions);

  const duels = sessions.filter((s) => s.mode === 'versus' && s.opponentId === friend.id);
  const wins = duels.filter((s) => s.won).length;
  const losses = duels.length - wins;
  const totalReps = duels.reduce((acc, s) => acc + s.reps, 0);

  const tint = TINTS[friend.id] ?? { background: palette.green50, color: palette.green700 };

  const headline =
    duels.length === 0
      ? 'No duels yet — go settle it'
      : wins > losses
        ? `You're ahead ${wins}–${losses} 🔥`
        : losses > wins
          ? `${friend.name} leads ${losses}–${wins} — time for revenge`
          : `Dead even ${wins}–${losses} — settle it`;

  return (
    <Screen>
      <ModalHeader title={friend.name} />

      <View style={styles.identity}>
        <Avatar
          initial={friend.initial}
          size={88}
          square
          background={tint.background}
          color={tint.color}
        />
        <Text style={[font('extrabold', 22, { color: palette.ink }), { marginTop: 12 }]}>
          {friend.name}
        </Text>
        <Text style={text.captionMd}>Level {friend.level}</Text>
        <Text
          style={font('extrabold', 11, {
            color: friend.online ? palette.green500 : palette.grey600,
            marginTop: 6,
          })}
        >
          {friend.online ? '● Online' : 'Offline'}
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
            <Text style={styles.h2hSide}>{friend.name.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.h2hHeadline}>{headline}</Text>
      </LinearGradient>

      <View style={styles.statRow}>
        <StatTile value={totalReps} label="Your reps vs them" color={palette.green500} />
        <StatTile value={duels.length} label="Duels played" color={palette.purple500} />
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

      <PrimaryButton
        label={`⚔️ Challenge ${friend.name}`}
        onPress={() =>
          router.replace({
            pathname: '/session',
            params: { exercise: 'push', mode: 'versus', opponent: friend.id },
          })
        }
      />
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
