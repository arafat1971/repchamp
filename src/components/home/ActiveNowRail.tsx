import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FireOrbit } from '@/components/FireOrbit';
import { HomeSectionHeader, homeSectionLink } from '@/components/home/HomeSectionHeader';
import { QrPlusIcon } from '@/components/QrPlusIcon';
import { Avatar, PressableScale } from '@/components/ui';
import { OPPONENTS } from '@/domain/opponent';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { track } from '@/lib/analytics';
import { type ActiveFriend, fetchActiveFriends } from '@/services/leaderboardService';
import { useAuthStore } from '@/state/authStore';
import { font } from '@/theme/typography';
import { palette, surfaceShadow } from '@/theme/tokens';

/**
 * "Race someone now" — a stories-style row of people to duel, on Home.
 *
 * The Friends tab already had this as "ACTIVE NOW", one tap away from a race,
 * but nobody opening the app landed on it. The fastest route from "open app"
 * to "in a race" is a face you can tap, so the row comes to Home.
 *
 * Real friends who are online come first. The labelled AI partners fill in
 * behind them, each marked AI — the honest cold-start rule: a roster padded
 * with AI must never read as organic social activity. Friends refresh on
 * focus, the same way the Friends tab does.
 */
/** `live` is the "6 partners ready" count, shown beside the heading. */
export function ActiveNowRail({ live }: { live?: string } = {}) {
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid);
  const seed = usePhantomSeed();
  const [friends, setFriends] = useState<ActiveFriend[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      let live = true;
      void fetchActiveFriends(uid)
        .then((list) => {
          if (live) setFriends(list.filter((f) => f.online));
        })
        .catch(() => {
          // A failed presence read just means no live friends in the row.
        });
      return () => {
        live = false;
      };
    }, [uid]),
  );

  const raceFriend = (f: ActiveFriend) => {
    track('friend_invited', { kind: 'duel', isAI: false });
    router.push({
      pathname: '/duel/new',
      params: {
        role: 'host',
        target: f.uid,
        name: f.displayName,
        level: String(f.level),
        ...(f.avatarUrl ? { avatar: f.avatarUrl } : {}),
        kind: 'duel',
      },
    });
  };

  const raceAi = (id: string) => {
    track('friend_invited', { kind: 'duel', isAI: true });
    router.push({ pathname: '/session', params: { exercise: 'push', mode: 'versus', opponent: id } });
  };

  const bots = OPPONENTS.filter((o) => o.online);

  return (
    <View>
      <HomeSectionHeader
        title="Race someone now"
        right={
          <View style={styles.headRight}>
            {live ? (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText} numberOfLines={1}>{live}</Text>
              </View>
            ) : null}
            <PressableScale
              onPress={() => router.push('/(tabs)/friends')}
              accessibilityRole="button"
              accessibilityLabel="See all friends"
            >
              <Text style={homeSectionLink}>See all ›</Text>
            </PressableScale>
          </View>
        }
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {/* Bring a friend: the one card that grows the list. */}
        <PressableScale
          onPress={() => router.push('/modal/scan')}
          accessibilityRole="button"
          accessibilityLabel="Scan or show a QR code to add a friend"
          style={[styles.card, styles.addCard]}
        >
          <FireOrbit size={50}>
            <View style={styles.addCircle}>
              <QrPlusIcon size={24} />
            </View>
          </FireOrbit>
          <Text style={styles.cardName}>Add friend</Text>
          <Text style={styles.cardMeta}>Scan a code</Text>
          <View style={[styles.go, styles.goGhost]}>
            <Text style={[styles.goText, { color: palette.green700 }]}>Scan</Text>
          </View>
        </PressableScale>

        {friends.map((f) => (
          <RaceCard
            key={f.uid}
            live
            name={f.displayName.split(' ')[0] ?? f.displayName}
            meta={`Lv ${f.level}`}
            avatar={
              <View style={styles.liveRing}>
                <Avatar initial={(f.displayName || '?').charAt(0).toUpperCase()} uri={f.avatarUrl} size={46} online />
              </View>
            }
            onPress={() => raceFriend(f)}
          />
        ))}

        {bots.map((o) => (
          <RaceCard
            key={o.id}
            name={o.name}
            meta={`Lv ${o.level}`}
            rpm={o.repsPerMinute}
            avatar={<Avatar initial={o.initial} size={50} background={o.color} color={palette.white} online />}
            onPress={() => raceAi(o.id)}
          />
        ))}

        {seed.phantomOnline.map((p) => (
          <RaceCard
            key={p.id}
            name={p.name.split(' ')[0] ?? p.name}
            meta={`Lv ${p.level}`}
            rpm={p.repsPerMinute}
            avatar={
              <Avatar initial={p.initial} emoji={p.emoji} size={50} background={p.tintBg} color={p.tintColor} online />
            }
            onPress={() => raceAi(p.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Pace bands for an AI partner: what a race against them will feel like. */
function difficulty(rpm: number): { label: string; color: string; bg: string } {
  if (rpm < 55) return { label: 'Easy', color: palette.green700, bg: palette.green50 };
  if (rpm < 75) return { label: 'Medium', color: palette.amber800, bg: '#FFF6E5' };
  return { label: 'Hard', color: '#B91C1C', bg: palette.tintDangerBg };
}

/**
 * One opponent as a card: face, level, how hard they push, and the button.
 * A real friend who is online wears LIVE; an AI partner always says AI and
 * its pace — labelled, never passed off as a person.
 */
function RaceCard({
  name,
  meta,
  avatar,
  rpm,
  live = false,
  onPress,
}: {
  name: string;
  meta: string;
  avatar: React.ReactNode;
  rpm?: number;
  live?: boolean;
  onPress: () => void;
}) {
  const diff = rpm != null ? difficulty(rpm) : null;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Race ${name}${live ? ', live now' : ', an AI partner'}${diff ? `, ${diff.label}` : ''}`}
      style={[styles.card, live && styles.cardLive]}
    >
      <View style={styles.cardTag}>
        <Text style={[styles.tagText, live ? { color: palette.green700 } : null]}>{live ? '● LIVE' : 'AI'}</Text>
      </View>
      {avatar}
      <Text style={styles.cardName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.cardMeta}>{meta}</Text>
        {diff ? (
          <View style={[styles.diff, { backgroundColor: diff.bg }]}>
            <Text style={[styles.diffText, { color: diff.color }]}>{diff.label}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.go, live && { backgroundColor: palette.green600 }]}>
        <Text style={styles.goText}>Race</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: palette.green50,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green500 },
  liveText: font('bold', 11, { color: palette.green700 }),
  row: { gap: 10, paddingRight: 8, paddingVertical: 6, paddingLeft: 2 },
  card: {
    width: 108,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  cardLive: { borderColor: palette.green300, backgroundColor: '#F4FDF7' },
  addCard: { borderStyle: 'dashed', borderColor: palette.green300, shadowOpacity: 0, elevation: 0 },
  cardTag: { position: 'absolute', top: 7, left: 8 },
  tagText: { ...font('extrabold', 8.5, { color: palette.grey500 }), letterSpacing: 0.6 },
  cardName: { ...font('bold', 13, { color: palette.ink }), marginTop: 7, maxWidth: 92 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardMeta: font('semibold', 10.5, { color: palette.grey600 }),
  diff: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  diffText: font('extrabold', 9.5),
  go: {
    alignSelf: 'stretch',
    marginTop: 9,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goGhost: { backgroundColor: palette.green50 },
  goText: font('bold', 12, { color: palette.white }),
  addCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.green300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
  },
  liveRing: { borderWidth: 2, borderColor: palette.green500, borderRadius: 27, padding: 1 },
});
