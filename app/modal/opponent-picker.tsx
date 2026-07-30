import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { OPPONENTS, type Opponent } from '@/domain/opponent';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const TINTS: Record<string, { background: string; color: string }> = {
  adrian: { background: '#ddd6fe', color: '#5b21b6' },
  zheng: { background: '#bfdbfe', color: '#1e40af' },
  mia: { background: '#fde68a', color: '#92400e' },
};

export default function OpponentPickerScreen() {
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);

  const start = (opponentId: string) =>
    router.replace({
      pathname: '/session',
      params: { exercise: 'push', mode: 'versus', opponent: opponentId },
    });

  /** Head-to-head summary line, derived from real duel history. */
  const summary = (opponent: Opponent): string => {
    const duels = sessions.filter((s) => s.mode === 'versus' && s.opponentId === opponent.id);
    if (duels.length === 0) {
      return opponent.online ? '● Online · first duel' : 'Offline · first duel';
    }

    const wins = duels.filter((s) => s.won).length;
    const losses = duels.length - wins;
    const status = opponent.online ? '● Online' : 'Offline';

    if (wins > losses) return `${status} · you lead ${wins}–${losses}`;
    if (losses > wins) return `${status} · trails ${wins}–${losses} · revenge time`;
    return `${status} · even ${wins}–${losses}`;
  };

  const seed = usePhantomSeed();

  const allOpponents = seed.isSeeding && seed.phantomFriends.length > 0
    ? [
        ...OPPONENTS,
        ...seed.phantomFriends.map((p) => ({
          id: p.id,
          name: p.name,
          initial: p.initial,
          emoji: p.emoji, isAI: p.isAI,
          color: p.tintColor,
          borderColor: p.tintBg,
          repColor: p.tintBg,
          level: p.level,
          online: p.online,
          repsPerMinute: p.repsPerMinute,
        })),
      ]
    : OPPONENTS;

  return (
    <Screen>
      <ModalHeader
        title="Choose your rival"
        subtitle="Push-up duel · 20 seconds · winner takes the XP"
      />

      <PressableScale
        onPress={() => {
          const random = allOpponents[Math.floor(Math.random() * allOpponents.length)]!;
          start(random.id);
        }}
        accessibilityRole="button"
        accessibilityLabel="Quick match with a random rival"
      >
        <LinearGradient colors={gradients.brandStrong} style={[styles.quickMatch, shadow.brand]}>
          <View style={styles.quickIcon}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill={palette.white} />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font('extrabold', 16, { color: palette.white })}>Quick Match</Text>
            <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.9)' })}>
              We&apos;ll pair you with someone at your level
            </Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 20 }}>›</Text>
        </LinearGradient>
      </PressableScale>

      <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>CHALLENGE A FRIEND</Eyebrow>
      <View style={{ gap: 10 }}>
        {allOpponents.map((opponent) => {
          const tint = TINTS[opponent.id] ?? {
            background: (opponent as any).borderColor ?? palette.green50,
            color: (opponent as any).color ?? palette.green700,
          };

          return (
            <PressableScale
              key={opponent.id}
              onPress={() => start(opponent.id)}
              accessibilityRole="button"
              accessibilityLabel={`Duel ${opponent.name}`}
              style={styles.opponentRow}
            >
              <Avatar
                initial={opponent.initial}
                emoji={(opponent as any).emoji}
                size={48}
                background={tint.background}
                color={tint.color}
                online={opponent.online}
              />
              <View style={{ flex: 1 }}>
                <Text style={text.cardTitle}>{opponent.name}</Text>
                <Text
                  style={font('semibold', 11, {
                    color: opponent.online ? palette.green500 : palette.grey600,
                  })}
                >
                  {summary(opponent as Opponent)}
                </Text>
              </View>
              <View style={styles.duelPill}>
                <Text style={font('extrabold', 12, { color: palette.green600 })}>Duel</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  quickMatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: radius['4xl'],
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: palette.white,
    borderRadius: radius['2xl'],
    padding: 14,
    ...shadow.card,
  },
  duelPill: {
    backgroundColor: palette.green50,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
  },
});
