import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, TextInput } from 'react-native';

import {
  Avatar,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  PressableScale,
  Screen,
  Skeleton,
  SkeletonCircle,
} from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { captureError } from '@/lib/crash';
import { OPPONENTS, type Opponent } from '@/domain/opponent';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import {
  addFriendByUsername,
  fetchActiveFriends,
  fetchRecentAthletes,
  removeFriend,
  type ActiveFriend,
  type RecentAthlete,
} from '@/services/leaderboardService';
import { useAuthStore } from '@/state/authStore';
import { showDialog } from '@/state/useDialog';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';
import type { InviteKind } from '@/domain/presence';

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

/**
 * Placeholder rows shown while the friends list loads, shaped like the real
 * row so the layout does not jump when the data lands.
 */
function FriendRowSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <SkeletonCircle size={44} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="52%" height={13} />
            <Skeleton width="34%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

function inviteParams(f: ActiveFriend, kind: InviteKind) {
  return {
    pathname: '/duel/new' as const,
    params: {
      role: 'host',
      target: f.uid,
      name: f.displayName,
      level: String(f.level),
      kind,
    },
  };
}

export default function FriendsScreen() {
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);
  const uid = useAuthStore((s) => s.user?.uid);
  const [search, setSearch] = useState('');
  const seed = usePhantomSeed();

  const [cloudFriends, setCloudFriends] = useState<ActiveFriend[]>([]);
  const [recent, setRecent] = useState<RecentAthlete[]>([]);
  const [addingUid, setAddingUid] = useState<string | null>(null);
  /**
   * Distinguish "still loading", "loaded and genuinely empty" and "the fetch
   * failed". Without this the three were pixel-identical — a dropped
   * connection looked exactly like having no friends, with no way to retry.
   */
  const [loading, setLoading] = useState(!!uid);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    void Promise.all([
      fetchActiveFriends(uid).then(setCloudFriends),
      fetchRecentAthletes(uid).then(setRecent),
    ])
      .catch((error) => {
        captureError(error);
        setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onlineFriends = cloudFriends.filter((f) => f.online);
  const onlineBots = OPPONENTS.filter((o) => o.online);
  const filteredOpponents = OPPONENTS.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );
  const q = search.trim().toLowerCase().replace(/^@+/, '');
  const filteredCloud = cloudFriends.filter((f) => {
    if (!q) return true;
    return (
      f.displayName.toLowerCase().includes(q) ||
      (f.username ?? '').toLowerCase().includes(q)
    );
  });
  const friendUids = new Set(cloudFriends.map((f) => f.uid));
  const newAthletes = recent.filter(
    (a) =>
      !friendUids.has(a.uid) &&
      (!q ||
        a.displayName.toLowerCase().includes(q) ||
        (a.username ?? '').toLowerCase().includes(q)),
  );

  const duel = (opponent: Opponent) =>
    router.push({
      pathname: '/session',
      params: { exercise: 'push', mode: 'versus', opponent: opponent.id },
    });

  const record = (id: string) => {
    const duels = sessions.filter((s) => s.mode === 'versus' && s.opponentId === id);
    return {
      wins: duels.filter((s) => s.won).length,
      // Draws are neither wins nor losses — older records without `drew` still
      // count `!won` as a loss (pre-draw-tracking behaviour).
      losses: duels.filter((s) => !s.won && !s.drew).length,
    };
  };

  const addRecent = async (athlete: RecentAthlete) => {
    if (!uid || !athlete.username) {
      showDialog({
        title: 'Missing username',
        message: 'This athlete hasn’t set a username yet — ask them to share it.',
        tone: 'info',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
      return;
    }
    setAddingUid(athlete.uid);
    try {
      await addFriendByUsername(uid, athlete.username);
      showDialog({
        title: 'Friend added',
        message: `@${athlete.username} is on your list. They can add you back by your username.`,
        tone: 'success',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
      refresh();
    } catch (err) {
      showDialog({
        title: 'Could not add',
        message: err instanceof Error ? err.message : 'Please try again.',
        tone: 'danger',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    } finally {
      setAddingUid(null);
    }
  };

  return (
    <Screen>
      <StaggerIn index={0}>
        <Text style={[text.h1, { marginTop: 12, marginBottom: 16 }]}>Friends</Text>
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
        <Eyebrow style={{ marginBottom: 12, marginTop: 16 }}>ACTIVE NOW</Eyebrow>
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

          {onlineFriends.map((f) => (
            <PressableScale
              key={f.uid}
              onPress={() => router.push(inviteParams(f, 'duel'))}
              accessibilityRole="button"
              accessibilityLabel={`Invite ${f.displayName}`}
              style={styles.onlineItem}
            >
              <Avatar
                initial={(f.displayName || 'A').charAt(0).toUpperCase()}
                uri={f.avatarUrl}
                size={58}
                online
              />
              <Text style={[styles.onlineName, { color: palette.ink }]} numberOfLines={1}>
                {f.displayName.split(' ')[0]}
              </Text>
            </PressableScale>
          ))}

          {onlineBots.map((o) => (
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
              <AiTag style={{ marginTop: 4, alignSelf: 'center' }} />
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
              <AiTag style={{ marginTop: 4, alignSelf: 'center' }} />
            </PressableScale>
          ))}
        </View>
      </StaggerIn>

      {newAthletes.length > 0 ? (
        <StaggerIn index={2}>
          <Eyebrow style={{ marginBottom: 12, marginTop: 8 }}>NEW ON REPCHAMP</Eyebrow>
          <Card style={{ padding: 8 }}>
            {newAthletes.slice(0, 8).map((a, index) => (
              <View key={a.uid}>
                {index > 0 ? <Divider style={{ marginHorizontal: 8 }} /> : null}
                <View style={styles.friendRow}>
                  <View style={styles.friendInfo}>
                    <Avatar
                      initial={(a.displayName || 'A').charAt(0).toUpperCase()}
                      uri={a.avatarUrl}
                      size={44}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={text.cardTitle} numberOfLines={1}>
                        {a.displayName}
                      </Text>
                      <Text style={font('semibold', 11, { color: palette.grey600 })}>
                        {a.username ? `@${a.username}` : 'Just joined'}
                      </Text>
                    </View>
                  </View>
                  <PressableScale
                    onPress={() => void addRecent(a)}
                    disabled={addingUid === a.uid}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${a.displayName}`}
                    style={styles.duelButton}
                  >
                    <Text style={font('extrabold', 12, { color: palette.white })}>
                      {addingUid === a.uid ? '…' : 'Add'}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </Card>
        </StaggerIn>
      ) : null}

      {seed.isSeeding && seed.phantomFriends.length > 0 ? (
        <StaggerIn index={3}>
          <Eyebrow style={{ marginBottom: 12, marginTop: 16 }}>SUGGESTED FRIENDS</Eyebrow>
          <Card style={{ padding: 8 }}>
            {seed.phantomFriends.map((p, index) => (
              <View key={p.id}>
                {index > 0 ? <Divider style={{ marginHorizontal: 8 }} /> : null}
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
                      <Text
                        style={font('semibold', 11, {
                          color: p.online ? palette.green500 : palette.grey600,
                        })}
                      >
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

      <StaggerIn index={4}>
        <Eyebrow style={{ marginBottom: 12, marginTop: 16 }}>AI PARTNERS</Eyebrow>
        <Card style={{ padding: 8 }}>
          {filteredOpponents.map((o, index) => {
            const { wins, losses } = record(o.id);

            return (
              <View key={o.id}>
                {index > 0 ? <Divider style={{ marginHorizontal: 8 }} /> : null}
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

      {/* The section always renders now. It used to disappear entirely when
          the list was empty, so a failed fetch, a search with no matches and
          genuinely having no friends were indistinguishable. */}
      {filteredCloud.length === 0 ? (
        <StaggerIn index={5}>
          <Eyebrow style={{ marginTop: 24, marginBottom: 12 }}>ON REPCHAMP</Eyebrow>
          <Card style={{ padding: 8 }}>
            {loading ? (
              <FriendRowSkeleton />
            ) : loadFailed ? (
              <ErrorState
                title="Could not load friends"
                message="Your list is still safe — this is just the connection."
                onRetry={refresh}
              />
            ) : search.trim() ? (
              <EmptyState
                glyph="🔍"
                title={`No matches for “${search.trim()}”`}
                message="Try a different name, or add them by username."
                actionLabel="Add a friend"
                onAction={() => router.push('/modal/add-friend')}
              />
            ) : (
              <EmptyState
                glyph="👋"
                title="No friends yet"
                message="Add someone by username and challenge them to a duel."
                actionLabel="Add a friend"
                onAction={() => router.push('/modal/add-friend')}
              />
            )}
          </Card>
        </StaggerIn>
      ) : (
        <StaggerIn index={5}>
          <Eyebrow style={{ marginTop: 24, marginBottom: 12 }}>ON REPCHAMP</Eyebrow>
          <Card style={{ padding: 8 }}>
            {filteredCloud.map((f, index) => (
              <View key={f.uid}>
                {index > 0 ? <Divider style={{ marginHorizontal: 8 }} /> : null}
                <View style={styles.cloudRow}>
                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: '/modal/friend',
                        params: {
                          id: f.uid,
                          name: f.displayName,
                          level: String(f.level),
                          ...(f.avatarUrl ? { avatar: f.avatarUrl } : {}),
                          online: f.online ? '1' : '0',
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`View ${f.displayName}'s profile`}
                    style={styles.friendInfo}
                  >
                    <Avatar
                      initial={(f.displayName || 'A').charAt(0).toUpperCase()}
                      uri={f.avatarUrl}
                      size={44}
                      online={f.online}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={text.cardTitle} numberOfLines={1}>
                        {f.displayName}
                      </Text>
                      <Text
                        style={font('semibold', 11, {
                          color: f.online ? palette.green500 : palette.grey600,
                        })}
                      >
                        {f.online ? '● Active' : 'Offline'} · Lv.{f.level}
                      </Text>
                    </View>
                  </PressableScale>

                  <View style={styles.actionRow}>
                    <PressableScale
                      onPress={() => router.push(inviteParams(f, 'duel'))}
                      accessibilityRole="button"
                      accessibilityLabel={`Duel ${f.displayName}`}
                      style={styles.actionPill}
                    >
                      <Text style={font('extrabold', 11, { color: palette.white })}>Duel</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => router.push(inviteParams(f, 'train'))}
                      accessibilityRole="button"
                      accessibilityLabel={`Train with ${f.displayName}`}
                      style={[styles.actionPill, styles.actionPillSoft]}
                    >
                      <Text style={font('extrabold', 11, { color: palette.green700 })}>Train</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => router.push(inviteParams(f, 'compete'))}
                      accessibilityRole="button"
                      accessibilityLabel={`Compete with ${f.displayName}`}
                      style={[styles.actionPill, styles.actionPillSoft]}
                    >
                      <Text style={font('extrabold', 11, { color: palette.green700 })}>Compete</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => {
                        if (!uid) return;
                        showDialog({
                          title: 'Remove friend?',
                          message: `${f.displayName} will leave your list. They can still have you on theirs.`,
                          tone: 'danger',
                          actions: [
                            { label: 'Cancel', variant: 'cancel' },
                            {
                              label: 'Remove',
                              variant: 'destructive',
                              onPress: () => {
                                void removeFriend(uid, f.uid)
                                  .then(refresh)
                                  .catch((error) => {
                                    captureError(error);
                                    showDialog({
                                      title: "Couldn't remove",
                                      message:
                                        'Check your connection and try again.',
                                      tone: 'danger',
                                      actions: [{ label: 'Got it', variant: 'primary' }],
                                    });
                                  });
                              },
                            },
                          ],
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${f.displayName}`}
                      style={[styles.actionPill, styles.actionPillMuted]}
                    >
                      <Text style={font('extrabold', 11, { color: palette.slate500 })}>Remove</Text>
                    </PressableScale>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </StaggerIn>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 4,
  },
  searchIcon: { width: 16, height: 16, marginRight: 8 },
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
  onlineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  onlineItem: { alignItems: 'center', gap: 4, width: 64 },
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
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  cloudRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  friendInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  duelButton: {
    backgroundColor: palette.green500,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  actionPill: {
    backgroundColor: palette.green500,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  actionPillSoft: {
    backgroundColor: palette.green50,
  },
  actionPillMuted: {
    backgroundColor: palette.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiTag: {
    backgroundColor: palette.green50,
    borderRadius: radius.xs,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  aiTagText: font('extrabold', 8.5, { color: palette.green700, letterSpacing: 0.3 }),
});
