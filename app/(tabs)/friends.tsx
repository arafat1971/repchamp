import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View , TextInput } from 'react-native';

import { Avatar, Card, Divider, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { captureError } from '@/lib/crash';
import { OPPONENTS, type Opponent } from '@/domain/opponent';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { fetchFriends, type Friend } from '@/services/leaderboardService';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

import { StaggerIn } from '@/components/motion';

/** Avatar tints, keyed by opponent id, matching the design. */
const TINTS: Record<string, { background: string; color: string }> = {
  adrian: { background: '#ddd6fe', color: '#5b21b6' },
  zheng: { background: '#bfdbfe', color: '#1e40af' },
  mia: { background: '#fde68a', color: '#92400e' },
};

function tint(id: string) {
  return TINTS[id] ?? { background: palette.green50, color: palette.green700 };
}

/**
 * A small "AI" badge for bot rivals and seeded partners, so they're never
 * mistaken for real people. Real cloud friends deliberately never get it.
 */
function AiTag({ style }: { style?: object }) {
  return (
    <View style={[styles.aiTag, style]}>
      <Text style={styles.aiTagText}>AI</Text>
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);
  const uid = useAuthStore((s) => s.user?.uid);
  const [search, setSearch] = useState('');
  // Clearly-labelled AI training partners, shown only while the community is small.
  const seed = usePhantomSeed();

  // Real friends from the cloud graph, appended below the bot rivals. Empty
  // until Firebase is provisioned, so the screen is unchanged before then.
  const [cloudFriends, setCloudFriends] = useState<Friend[]>([]);
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    fetchFriends(uid)
      .then((list) => {
        if (!cancelled) setCloudFriends(list);
      })
      // Degrades quietly by design: the bot rivals still render, so a failed
      // cloud fetch costs nothing visible. Logged rather than surfaced.
      .catch(captureError);
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const online = OPPONENTS.filter((o) => o.online);
  const filteredOpponents = OPPONENTS.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  const duel = (opponent: Opponent) =>
    router.push({
      pathname: '/session',
      params: { exercise: 'push', mode: 'versus', opponent: opponent.id },
    });

  /** Head-to-head record against one rival, from real session history. */
  const record = (id: string) => {
    const duels = sessions.filter((s) => s.mode === 'versus' && s.opponentId === id);
    return {
      wins: duels.filter((s) => s.won).length,
      losses: duels.filter((s) => !s.won).length,
    };
  };

  return (
    <Screen>
      <StaggerIn index={0}>
        <Text style={[text.h1, { marginTop: 14, marginBottom: 16 }]}>Friends</Text>
        <View style={styles.searchBar}>
          <View style={styles.searchIcon}>
            <View style={styles.searchGlass} />
            <View style={styles.searchHandle} />
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search rivals or friends..."
            placeholderTextColor={palette.grey450}
            style={styles.searchInput}
          />
        </View>
      </StaggerIn>

      <StaggerIn index={1}>
        <Eyebrow style={{ marginBottom: 12, marginTop: 16 }}>ONLINE NOW</Eyebrow>
        <View style={styles.onlineRow}>
          <PressableScale
            onPress={() => router.push('/modal/add-friend')}
            accessibilityRole="button"
            accessibilityLabel="Add friends"
            style={styles.onlineItem}
          >
            <View style={styles.addCircle}>
              <Text style={{ fontSize: 24, color: palette.green600 }}>+</Text>
            </View>
            <Text style={styles.onlineName}>Add</Text>
          </PressableScale>

          {online.map((o) => (
            <PressableScale
              key={o.id}
              onPress={() => duel(o)}
              accessibilityRole="button"
              accessibilityLabel={`Duel ${o.name}`}
              style={styles.onlineItem}
            >
              <Avatar
                initial={o.initial}
                size={58}
                background={tint(o.id).background}
                color={tint(o.id).color}
                online
              />
              <Text style={[styles.onlineName, { color: palette.ink }]}>{o.name}</Text>
              <AiTag style={{ marginTop: 1, alignSelf: 'center' }} />
            </PressableScale>
          ))}

          {seed.phantomOnline.map((p) => (
            <PressableScale
              key={p.id}
              onPress={() =>
                router.push({
                  pathname: '/session',
                  params: { exercise: 'push', mode: 'versus', opponent: p.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Duel ${p.name}`}
              style={styles.onlineItem}
            >
              <Avatar
                initial={p.initial}
                emoji={p.emoji}
                size={58}
                background={p.tintBg}
                color={p.tintColor}
                online
              />
              <Text style={[styles.onlineName, { color: palette.ink }]}>{p.name.split(' ')[0]}</Text>
              <AiTag style={{ marginTop: 1, alignSelf: 'center' }} />
            </PressableScale>
          ))}
        </View>
      </StaggerIn>

      {seed.isSeeding && seed.phantomFriends.length > 0 ? (
        <StaggerIn index={2}>
          <Eyebrow style={{ marginBottom: 12, marginTop: 16 }}>SUGGESTED FRIENDS</Eyebrow>
          <Card style={{ padding: 8 }}>
            {seed.phantomFriends.map((p, index) => (
              <View key={p.id}>
                {index > 0 ? <Divider style={{ marginHorizontal: 10 }} /> : null}
                <View style={styles.friendRow}>
                  <View style={styles.friendInfo}>
                    <Avatar
                      initial={p.initial}
                      emoji={p.emoji}
                      size={44}
                      background={p.tintBg}
                      color={p.tintColor}
                    />
                    <View>
                      <View style={styles.nameRow}>
                        <Text style={text.cardTitle}>{p.name}</Text>
                        <AiTag />
                      </View>
                      <Text style={font('semibold', 11, {
                        color: p.online ? palette.green500 : palette.grey600,
                      })}>
                        {p.online ? '● Online' : 'Offline'} · Lv.{p.level}
                      </Text>
                    </View>
                  </View>

                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: '/session',
                        params: { exercise: 'push', mode: 'versus', opponent: p.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Duel ${p.name}`}
                    style={styles.duelButton}
                  >
                    <Text style={font('extrabold', 12, { color: palette.white })}>Duel</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </Card>
        </StaggerIn>
      ) : null}

      <StaggerIn index={3}>
        <Eyebrow style={{ marginBottom: 12, marginTop: 16 }}>ALL FRIENDS</Eyebrow>
        <Card style={{ padding: 8 }}>
          {filteredOpponents.map((o, index) => {
            const { wins, losses } = record(o.id);

          return (
            <View key={o.id}>
              {index > 0 ? <Divider style={{ marginHorizontal: 10 }} /> : null}
              <View style={styles.friendRow}>
                <PressableScale
                  onPress={() => router.push({ pathname: '/modal/friend', params: { id: o.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${o.name}'s profile`}
                  style={styles.friendInfo}
                >
                  <Avatar
                    initial={o.initial}
                    size={44}
                    background={tint(o.id).background}
                    color={tint(o.id).color}
                  />
                  <View>
                    <View style={styles.nameRow}>
                      <Text style={text.cardTitle}>{o.name}</Text>
                      <AiTag />
                    </View>
                    <Text
                      style={font('semibold', 11, {
                        color: o.online ? palette.green500 : palette.grey600,
                      })}
                    >
                      {o.online ? '● Online' : 'Offline'} · Lv.{o.level}
                      {wins + losses > 0 ? ` · ${wins}–${losses}` : ''}
                    </Text>
                  </View>
                </PressableScale>

                <PressableScale
                  onPress={() => duel(o)}
                  accessibilityRole="button"
                  accessibilityLabel={`Duel ${o.name}`}
                  style={styles.duelButton}
                >
                  <Text style={font('extrabold', 12, { color: palette.white })}>Duel</Text>
                </PressableScale>
              </View>
            </View>
          );
        })}
      </Card>
    </StaggerIn>

      {cloudFriends.length > 0 ? (
        <>
          <Eyebrow style={{ marginTop: 24, marginBottom: 12 }}>ON REPCHAMP</Eyebrow>
          <Card style={{ padding: 8 }}>
            {cloudFriends.map((f, index) => (
              <View key={f.uid}>
                {index > 0 ? <Divider style={{ marginHorizontal: 10 }} /> : null}
                <View style={styles.friendRow}>
                  <View style={styles.friendInfo}>
                    <Avatar
                      initial={(f.displayName || 'A').charAt(0).toUpperCase()}
                      uri={f.avatarUrl}
                      size={44}
                    />
                    <View>
                      <Text style={text.cardTitle} numberOfLines={1}>
                        {f.displayName}
                      </Text>
                      <Text style={font('semibold', 11, { color: palette.grey600 })}>
                        Lv.{f.level}
                      </Text>
                    </View>
                  </View>

                  {/* A real RepChamp friend gets a live challenge — this opens the
                      waiting room, which creates the duel and awaits their join. */}
                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: '/duel/new',
                        params: {
                          role: 'host',
                          target: f.uid,
                          name: f.displayName,
                          level: String(f.level),
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Challenge ${f.displayName} to a live duel`}
                    style={styles.duelButton}
                  >
                    <Text style={font('extrabold', 12, { color: palette.white })}>Challenge</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 4,
  },
  searchIcon: { width: 16, height: 16, marginRight: 10 },
  searchGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1.6,
    borderColor: palette.grey450,
  },
  searchHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 6,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: palette.grey450,
    transform: [{ rotate: '45deg' }],
  },
  searchInput: {
    flex: 1,
    ...font('semibold', 13, { color: palette.ink }),
    padding: 0,
  },
  onlineRow: { flexDirection: 'row', gap: 16, marginBottom: 26 },
  onlineItem: { alignItems: 'center', gap: 6 },
  addCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.green300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineName: font('bold', 11, { color: palette.grey600 }),
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  friendInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  duelButton: {
    backgroundColor: palette.green500,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTag: {
    backgroundColor: palette.green50,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  aiTagText: font('extrabold', 8.5, { color: palette.green700, letterSpacing: 0.3 }),
});
