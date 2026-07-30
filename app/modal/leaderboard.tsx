import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, Divider, Screen } from '@/components/ui';
import { buildLeaderboard, type LeaderboardRow } from '@/domain/leaderboard';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { fetchLeaderboard, fetchFriends } from '@/services/leaderboardService';
import { selectLeague, selectWeeklyXp, useProfileStore } from '@/state/profileStore';
import { useAuthStore } from '@/state/authStore';
import { useSettingsStore } from '@/state/settingsStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/** A leaderboard row, plus the optional AI-partner fields injected when seeding. */
type BoardRow = LeaderboardRow & { emoji?: string; isAI?: boolean };

type Scope = 'global' | 'friends';

export default function LeaderboardScreen() {
  const [scope, setScope] = useState<Scope>('global');
  const profile = useProfileStore();
  const privateProfile = useSettingsStore((s) => s.privateProfile);
  const uid = useAuthStore((s) => s.user?.uid);

  const weeklyXp = selectWeeklyXp(profile);
  const league = selectLeague(profile);
  const username = profile.username || 'You';

  const seed = usePhantomSeed();

  /**
   * The board starts on the local, always-available rival board so the screen
   * paints instantly, then swaps to the live cloud board once it resolves.
   */
  const [full, setFull] = useState<LeaderboardRow[]>(() =>
    buildLeaderboard(weeklyXp, username),
  );
  const [friendIds, setFriendIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const myUid = uid ?? '__you__';
    void fetchLeaderboard(myUid, weeklyXp, username)
      .then((rows) => {
        if (!cancelled) setFull(rows);
      })
      .catch(() => {
        /* fetchLeaderboard already degrades to the local board internally. */
      });
    if (uid) {
      void fetchFriends(uid)
        .then((list) => {
          if (!cancelled) setFriendIds(new Set(list.map((f) => f.uid)));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [uid, weeklyXp, username]);

  const hiddenFromGlobal = privateProfile && scope === 'global';

  const baseBoard = full;
  const rawRows = seed.isSeeding
    ? [
        ...baseBoard,
        ...seed.phantomLeaderboard.map((p): BoardRow => ({
          id: p.id,
          name: p.name,
          initial: p.initial,
          xp: p.xp,
          level: p.level,
          background: p.tintBg,
          color: p.tintColor,
          rank: 0,
          isYou: false,
          emoji: p.emoji,
          isAI: p.isAI,
        })),
      ]
        .sort((a, b) => (b.xp !== a.xp ? b.xp - a.xp : a.isYou ? -1 : b.isYou ? 1 : 0))
    : baseBoard;

  const rows = (
    scope === 'friends'
      ? (rawRows as BoardRow[]).filter(
          (r) =>
            r.isYou ||
            friendIds.has(r.id) ||
            // Seeded AI partners stay visible on Friends while the community is small.
            (seed.isSeeding && (r.isAI || r.id.startsWith('ph_'))),
        )
      : rawRows
  )
    .filter((r) => !(hiddenFromGlobal && r.isYou))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const you = rows.find((r) => r.isYou);

  return (
    <Screen>
      <ModalHeader title="Leaderboard" />

      <View style={styles.segmented}>
        {(['global', 'friends'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setScope(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === value }}
            style={[styles.segment, scope === value && styles.segmentActive]}
          >
            <Text
              style={font('extrabold', 13, {
                color: scope === value ? palette.ink : palette.grey600,
              })}
            >
              {value === 'global' ? 'Global' : 'Friends'}
            </Text>
          </Pressable>
        ))}
      </View>

      <LinearGradient colors={gradients.brand} style={[styles.leagueBanner, shadow.brand]}>
        <View style={styles.leagueBadge}>
          <Text style={{ fontSize: 26 }}>{league.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={font('extrabold', 16, { color: palette.white })}>{league.name} League</Text>
          <Text style={font('semibold', 12, { color: 'rgba(255,255,255,0.9)' })}>
            {weeklyXp.toLocaleString()} XP this week
          </Text>
        </View>
      </LinearGradient>

      <Card style={styles.list}>
        {rows.map((row, index) => (
          <View key={row.id}>
            {index > 0 ? <Divider style={{ marginHorizontal: 10 }} /> : null}
            <Row row={row} />
          </View>
        ))}
      </Card>

      {hiddenFromGlobal ? (
        <Card style={styles.hiddenCard}>
          <View style={styles.lockIcon}>
            <Text style={{ fontSize: 20 }}>🔒</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font('extrabold', 14, { color: palette.ink })}>
              You&apos;re hidden from Global
            </Text>
            <Text style={text.caption}>
              Private profile is on · turn it off in Settings to rank
            </Text>
          </View>
        </Card>
      ) : you ? (
        <Text style={styles.footer}>
          You&apos;re #{you.rank} with {you.xp.toLocaleString()} XP this week
        </Text>
      ) : null}
    </Screen>
  );
}

function Row({ row }: { row: BoardRow }) {
  const avatarUri = useProfileStore((s) => s.avatarUri);
  if (row.isYou) {
    return (
      <LinearGradient colors={gradients.brand} style={[styles.youRow, shadow.brand]}>
        <Text style={[styles.rank, { color: palette.white }]}>{row.rank}</Text>
        <View style={styles.youAvatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%', borderRadius: 19 }} contentFit="cover" />
          ) : (
            <Text style={font('extrabold', 15, { color: palette.white })}>{row.initial}</Text>
          )}
        </View>
        <Text style={[font('extrabold', 15, { color: palette.white }), { flex: 1 }]}>You</Text>
        <Text style={font('extrabold', 15, { color: palette.white })}>
          {row.xp.toLocaleString()}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={[styles.rank, { color: palette.grey600 }]}>{row.rank}</Text>
      <Avatar
        initial={row.initial}
        emoji={row.emoji}
        size={38}
        background={row.background}
        color={row.color}
      />
      <View style={{ flex: 1 }}>
        <Text style={font('extrabold', 14, { color: palette.ink })}>{row.name}</Text>
        <Text style={font('semibold', 10, { color: palette.grey600 })}>Lv.{row.level}</Text>
      </View>
      <Text style={font('extrabold', 13, { color: palette.ink })}>{row.xp.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: palette.track,
    borderRadius: radius.xl,
    padding: 5,
    marginBottom: 20,
  },
  segment: { flex: 1, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: palette.white, ...shadow.card },
  leagueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius['3xl'],
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  leagueBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10 },
  rank: { ...font('extrabold', 14), width: 24 },
  youRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius['2xl'],
    marginVertical: 4,
  },
  youAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginTop: 16 },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    ...font('extrabold', 12, { color: palette.green600 }),
    textAlign: 'center',
    marginTop: 16,
  },
});
