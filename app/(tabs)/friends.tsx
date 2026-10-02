import { QrPlusIcon } from '@/components/QrPlusIcon';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TextInput } from 'react-native';

import {
  Avatar,
  Divider,
  EmptyState,
  ErrorState,
  PressableScale,
  Screen,
  Skeleton,
  SkeletonCircle,
} from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { loadFailureMessage } from '@/domain/connectivity';
import { lastSeenLabel } from '@/domain/lastSeen';
import { useOffline, useReconnectCount } from '@/state/connectivityStore';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { captureError } from '@/lib/crash';
import { OPPONENTS, type Opponent } from '@/domain/opponent';
import { track } from '@/lib/analytics';
import { useTabView } from '@/lib/useTabView';
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
import { SCREEN_GUTTER, palette, radius, surfaceShadow } from '@/theme/tokens';
import type { InviteKind } from '@/domain/presence';

/** Avatar tints, keyed by opponent id, matching the design. */
const TINTS: Record<string, { background: string; color: string }> = {
  adrian: { background: palette.purple300, color: palette.purple900 },
  zheng: { background: palette.blue100, color: palette.blue800 },
  mia: { background: palette.amber100, color: palette.amber900 },
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
      /* The rival's face, so the VS card shows who you are challenging rather
         than the first letter of their name. `avatarUrl` has always been on the
         friend record; it simply was not forwarded. */
      ...(f.avatarUrl ? { avatar: f.avatarUrl } : {}),
      kind,
    },
  };
}

export default function FriendsScreen() {
  useTabView('friends');
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);
  const uid = useAuthStore((s) => s.user?.uid);
  const [search, setSearch] = useState('');
  const seed = usePhantomSeed();

  const [cloudFriends, setCloudFriends] = useState<ActiveFriend[]>([]);
  const [recent, setRecent] = useState<RecentAthlete[]>([]);
  const [addingUid, setAddingUid] = useState<string | null>(null);
  /* Which friend's extra actions are open. One at a time keeps the list calm. */
  const [openUid, setOpenUid] = useState<string | null>(null);
  /**
   * Distinguish "still loading", "loaded and genuinely empty" and "the fetch
   * failed". Without this the three were pixel-identical — a dropped
   * connection looked exactly like having no friends, with no way to retry.
   */
  const [loading, setLoading] = useState(!!uid);
  const [loadFailed, setLoadFailed] = useState(false);
  const offline = useOffline();
  const reconnects = useReconnectCount();

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
    // `reconnects` is a dependency on purpose: coming back online re-runs the
    // load, so a list that failed while offline heals without a manual retry.
    useCallback(() => {
      refresh();
      void reconnects;
    }, [refresh, reconnects]),
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

  /* Every real-friend invite routes through `inviteParams`; this wraps that so
     the event is recorded once here rather than repeated at six buttons. The
     roster these come from is the human one, hence `isAI: false`. */
  const invite = (f: ActiveFriend, kind: InviteKind) => {
    track('friend_invited', { kind, isAI: false });
    router.push(inviteParams(f, kind));
  };

  /* Bots and phantoms are the labelled-AI roster. Marked as such so a roster
     padded with AI never reads back as organic social activity. */
  const duel = (opponent: Opponent) => {
    track('friend_invited', { kind: 'duel', isAI: true });
    router.push({
      pathname: '/session',
      params: { exercise: 'push', mode: 'versus', opponent: opponent.id },
    });
  };

  const record = (id: string) => {
    const duels = sessions.filter((s) => s.mode === 'versus' && s.opponentId === id);
    return {
      wins: duels.filter((s) => s.won).length,
      // Draws are neither wins nor losses — older records without `drew` still
      // count `!won` as a loss (pre-draw-tracking behaviour).
      losses: duels.filter((s) => !s.won && !s.drew).length,
    };
  };

  const confirmRemove = (f: ActiveFriend) => {
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
            setOpenUid(null);
            void removeFriend(uid, f.uid)
              .then(refresh)
              .catch((error) => {
                captureError(error);
                showDialog({
                  title: "Couldn't remove",
                  message: 'Check your connection and try again.',
                  tone: 'danger',
                  actions: [{ label: 'Got it', variant: 'primary' }],
                });
              });
          },
        },
      ],
    });
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
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {onlineFriends.length > 0
                ? `${onlineFriends.length} ${onlineFriends.length === 1 ? 'friend' : 'friends'} active now`
                : cloudFriends.length > 0
                  ? `${cloudFriends.length} ${cloudFriends.length === 1 ? 'friend' : 'friends'}`
                  : 'Train better together'}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              Friends
            </Text>
          </View>
          <PressableScale
            onPress={() => router.push('/modal/scan')}
            accessibilityRole="button"
            accessibilityLabel="Scan or show a QR code"
            style={styles.headerButton}
          >
            <QrPlusIcon size={22} />
          </PressableScale>
          <PressableScale
            onPress={() => router.push('/modal/add-friend')}
            accessibilityRole="button"
            accessibilityLabel="Add friends"
            style={[styles.headerButton, styles.headerButtonPrimary]}
          >
            <Text style={styles.headerPlus}>+</Text>
          </PressableScale>
        </View>
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
        <HomeSectionHeader title="Active now" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.onlineRow}
        >

          {onlineFriends.map((f) => (
            <PressableScale
              key={f.uid}
              onPress={() => invite(f, 'duel')}
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
        </ScrollView>
      </StaggerIn>

      {/* Real friends lead. They used to sit below the AI partners, so the
          people the tab exists for were the last thing on it. The section
          always renders: a failed fetch, a search with no matches and having
          no friends are three different states and must look different. */}
      <StaggerIn index={2}>
        <HomeSectionHeader
          title="Your friends"
          right={
            cloudFriends.length > 0 ? (
              <Text style={styles.sectionMeta}>{cloudFriends.length}</Text>
            ) : undefined
          }
        />
        {filteredCloud.length === 0 ? (
          loading ? (
            <View style={styles.card}>
              <FriendRowSkeleton />
            </View>
          ) : loadFailed ? (
            <View style={styles.card}>
              <ErrorState
                title="Could not load friends"
                message={loadFailureMessage(
                  offline,
                  'Your list is still safe — this is just the connection.',
                )}
                onRetry={refresh}
              />
            </View>
          ) : search.trim() ? (
            <View style={styles.card}>
              <EmptyState
                title={`No matches for “${search.trim()}”`}
                message="Try a different name, or add them by username."
                actionLabel="Add a friend"
                onAction={() => router.push('/modal/add-friend')}
              />
            </View>
          ) : (
            <View style={styles.inviteHero}>
              <Text style={styles.inviteTitle}>Train harder with someone watching</Text>
              <Text style={styles.inviteBody}>
                Friends see your streak, race you live and keep you showing up. Add one by username
                or scan their code.
              </Text>
              <View style={styles.inviteActions}>
                <PressableScale
                  onPress={() => router.push('/modal/add-friend')}
                  accessibilityRole="button"
                  accessibilityLabel="Add a friend"
                  style={[styles.inviteButton, { backgroundColor: palette.white }]}
                >
                  <Text style={font('extrabold', 14, { color: palette.green700 })}>Add a friend</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => router.push('/modal/scan')}
                  accessibilityRole="button"
                  accessibilityLabel="Scan or show a QR code"
                  style={[styles.inviteButton, styles.inviteButtonGhost]}
                >
                  <Text style={font('extrabold', 14, { color: palette.white })}>Scan a code</Text>
                </PressableScale>
              </View>
            </View>
          )
        ) : (
          <View style={{ gap: 10 }}>
            {filteredCloud.map((f) => {
              const open = openUid === f.uid;
              return (
                <View key={f.uid} style={styles.friendCard}>
                  <View style={styles.friendMain}>
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
                        size={48}
                        online={f.online}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {f.displayName}
                        </Text>
                        <Text
                          style={font('semibold', 12, {
                            color: f.online ? palette.green600 : palette.grey600,
                          })}
                          numberOfLines={1}
                        >
                          {lastSeenLabel(f.online, f.lastActiveAt)} · Lv.{f.level}
                        </Text>
                      </View>
                    </PressableScale>
                    <PressableScale
                      onPress={() => invite(f, 'duel')}
                      accessibilityRole="button"
                      accessibilityLabel={`Duel ${f.displayName}`}
                      style={styles.duelButton}
                    >
                      <Text style={font('extrabold', 13, { color: palette.white })}>Duel</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => setOpenUid(open ? null : f.uid)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`More for ${f.displayName}`}
                      style={styles.moreButton}
                    >
                      <Text style={styles.moreGlyph}>{open ? '×' : '⋯'}</Text>
                    </PressableScale>
                  </View>

                  {open ? (
                    <View style={styles.moreRow}>
                      <PressableScale
                        onPress={() => invite(f, 'train')}
                        accessibilityRole="button"
                        accessibilityLabel={`Train with ${f.displayName}`}
                        style={styles.actionPill}
                      >
                        <Text style={font('extrabold', 12, { color: palette.green700 })}>Train together</Text>
                      </PressableScale>
                      <PressableScale
                        onPress={() => invite(f, 'compete')}
                        accessibilityRole="button"
                        accessibilityLabel={`Compete with ${f.displayName}`}
                        style={styles.actionPill}
                      >
                        <Text style={font('extrabold', 12, { color: palette.green700 })}>Compete</Text>
                      </PressableScale>
                      <PressableScale
                        onPress={() => confirmRemove(f)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${f.displayName}`}
                        style={[styles.actionPill, styles.actionPillMuted]}
                      >
                        <Text style={font('extrabold', 12, { color: palette.slate500 })}>Remove</Text>
                      </PressableScale>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </StaggerIn>


      {newAthletes.length > 0 ? (
        <StaggerIn index={2}>
          <HomeSectionHeader title="New on RepChamp" />
          <View style={styles.card}>
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
                    style={styles.addButton}
                  >
                    <Text style={font('extrabold', 12, { color: palette.green700 })}>
                      {addingUid === a.uid ? '…' : 'Add'}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </View>
        </StaggerIn>
      ) : null}

      {seed.isSeeding && seed.phantomFriends.length > 0 ? (
        <StaggerIn index={3}>
          <HomeSectionHeader title="Suggested friends" />
          <View style={styles.card}>
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
                    onPress={() => {
                      track('friend_invited', { kind: 'duel', isAI: true });
                      router.push({
                        pathname: '/session',
                        params: { exercise: 'push', mode: 'versus', opponent: p.id },
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Duel ${p.name}`}
                    style={styles.duelButton}
                  >
                    <Text style={font('extrabold', 12, { color: palette.white })}>Duel</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </View>
        </StaggerIn>
      ) : null}

      <StaggerIn index={4}>
        <HomeSectionHeader title="Practice with AI partners" />
        <View style={styles.card}>
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
        </View>
      </StaggerIn>

    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Sentence case, one size up: tracked all-caps labels read as template. */
  sectionTitle: font('semibold', 14, { color: palette.grey600 }),
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 14 },
  eyebrow: font('semibold', 13, { color: palette.grey600 }),
  title: { ...font('extrabold', 28, { color: palette.ink }), letterSpacing: -0.8 },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  headerButtonPrimary: { backgroundColor: palette.green500, borderColor: palette.green500 },
  headerPlus: { ...font('extrabold', 26, { color: palette.white }), marginTop: -2 },
  bleed: { marginHorizontal: -SCREEN_GUTTER },
  sectionMeta: font('bold', 12, { color: palette.grey600 }),
  friendCard: {
    borderRadius: radius['4xl'],
    padding: 12,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  friendMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendName: { ...font('extrabold', 15.5, { color: palette.ink }), letterSpacing: -0.3 },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreGlyph: { ...font('extrabold', 18, { color: palette.grey600 }), marginTop: -3 },
  moreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.divider,
  },
  inviteHero: {
    borderRadius: radius['6xl'],
    padding: 20,
    backgroundColor: '#0B5132',
    overflow: 'hidden',
  },
  inviteTitle: { ...font('extrabold', 21, { color: palette.white }), letterSpacing: -0.5, lineHeight: 26 },
  inviteBody: { ...font('medium', 13.5, { color: 'rgba(255,255,255,0.85)' }), lineHeight: 19, marginTop: 6 },
  inviteActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  inviteButton: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButtonGhost: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  card: {
    borderRadius: radius['4xl'],
    padding: 8,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    minHeight: 46,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.08)',
    ...surfaceShadow,
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
  onlineRow: { flexDirection: 'row', gap: 16, paddingHorizontal: SCREEN_GUTTER, paddingVertical: 6 },
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
  /* "Add" shares a shape with "Duel" but not its weight.
   *
   * Both were solid brand green, so a list of six suggestions was six of the
   * loudest colour on the screen stacked down one edge — no priority, and the
   * eye had nowhere to rest. Duelling is what the app is for; adding someone
   * is administrative. A tinted fill keeps it clearly tappable and lets the
   * green buttons that start a race actually mean something. */
  addButton: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
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
  aiTagText: font('extrabold', 9.5, { color: palette.green700, letterSpacing: 0.3 }),
});
