import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FireOrbit } from '@/components/FireOrbit';
import { QrPlusIcon } from '@/components/QrPlusIcon';
import { Avatar, PressableScale } from '@/components/ui';
import { OPPONENTS } from '@/domain/opponent';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { track } from '@/lib/analytics';
import { type ActiveFriend, fetchActiveFriends } from '@/services/leaderboardService';
import { useAuthStore } from '@/state/authStore';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

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
export function ActiveNowRail() {
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
      <View style={styles.head}>
        <Text style={styles.title}>Race someone now</Text>
        <PressableScale
          onPress={() => router.push('/(tabs)/friends')}
          accessibilityRole="button"
          accessibilityLabel="See all friends"
        >
          <Text style={styles.link}>See all ›</Text>
        </PressableScale>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <PressableScale
          onPress={() => router.push('/modal/scan')}
          accessibilityRole="button"
          accessibilityLabel="Scan or show a QR code"
          style={styles.item}
        >
          <FireOrbit size={58}>
            <View style={styles.addCircle}>
              <QrPlusIcon size={28} />
            </View>
          </FireOrbit>
          <Text style={styles.name}>Scan</Text>
        </PressableScale>

        {friends.map((f) => (
          <PressableScale
            key={f.uid}
            onPress={() => raceFriend(f)}
            accessibilityRole="button"
            accessibilityLabel={`Race ${f.displayName}`}
            style={styles.item}
          >
            <View style={styles.liveRing}>
              <Avatar
                initial={(f.displayName || '?').charAt(0).toUpperCase()}
                uri={f.avatarUrl}
                size={54}
                online
              />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {f.displayName.split(' ')[0]}
            </Text>
            <Text style={styles.live}>LIVE</Text>
          </PressableScale>
        ))}

        {bots.map((o) => (
          <PressableScale
            key={o.id}
            onPress={() => raceAi(o.id)}
            accessibilityRole="button"
            accessibilityLabel={`Race ${o.name}, an AI partner`}
            style={styles.item}
          >
            <Avatar initial={o.initial} size={58} background={o.color} color={palette.white} online />
            <Text style={styles.name} numberOfLines={1}>
              {o.name}
            </Text>
            <View style={styles.aiTag}>
              <Text style={styles.aiText}>AI</Text>
            </View>
          </PressableScale>
        ))}

        {seed.phantomOnline.map((p) => (
          <PressableScale
            key={p.id}
            onPress={() => raceAi(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`Race ${p.name}, an AI partner`}
            style={styles.item}
          >
            <Avatar
              initial={p.initial}
              emoji={p.emoji}
              size={58}
              background={p.tintBg}
              color={p.tintColor}
              online
            />
            <Text style={styles.name} numberOfLines={1}>
              {p.name.split(' ')[0]}
            </Text>
            <View style={styles.aiTag}>
              <Text style={styles.aiText}>AI</Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: font('extrabold', 17, { color: palette.ink }),
  link: font('bold', 12.5, { color: palette.green600 }),
  row: { gap: 14, paddingRight: 8 },
  item: { alignItems: 'center', width: 64 },
  addCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.green300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
  },
  liveRing: { borderWidth: 2, borderColor: palette.green500, borderRadius: 31, padding: 1 },
  name: { ...font('bold', 12, { color: palette.ink }), marginTop: 6, maxWidth: 64 },
  live: { ...font('extrabold', 9, { color: palette.green600 }), letterSpacing: 1, marginTop: 2 },
  aiTag: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: palette.green50,
  },
  aiText: font('extrabold', 9, { color: palette.green700 }),
});
