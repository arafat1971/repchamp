import { QrPlusIcon } from '@/components/QrPlusIcon';
import { LinearGradient } from 'expo-linear-gradient';
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
  addFriendByUid,
  fetchActiveFriends,
  fetchRecentAthletes,
  removeFriend,
  type ActiveFriend,
  type RecentAthlete,
} from '@/services/leaderboardService';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { usePublicAvatar } from '@/state/usePublicAvatar';
import { showDialog } from '@/state/useDialog';
import { selectTotalReps, useProfileStore } from '@/state/profileStore';
import { useEffectivePro } from '@/state/proStore';
import { isPurchasesConfigured } from '@/services/purchases';
import { isWalled } from '@/domain/hardPaywall';
import { font, text } from '@/theme/typography';
import { SCREEN_GUTTER, gradients, palette, radius, surfaceShadow } from '@/theme/tokens';
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

/**
 * The couple bond, at the top of the tab it belongs on.
 *
 * Pairing is the app's closest relationship and it had no door here: the only
 * ways in were buried in Home and a modal. Three honest states — paired (open
 * the shared day), waiting (an invite is out), and not paired (start one).
 */
function PartnerCard() {
  const router = useRouter();
  const couple = useCouple();
  const myAvatar = useProfileStore((st) => st.avatarUri);
  const partnerAvatar = usePublicAvatar(couple.partner?.uid, couple.partner?.avatarUrl);

  if (couple.loading) return null;

  if (couple.paired && couple.partner) {
    const name = couple.partner.displayName?.trim() || 'your partner';
    return (
      <PressableScale
        onPress={() => router.push('/couple/partner')}
        accessibilityRole="button"
        accessibilityLabel={`Open today together with ${name}`}
      >
        <LinearGradient
          colors={gradients.heroEmerald}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.partnerCard, surfaceShadow]}
        >
          <View style={styles.partnerFaces}>
            <Avatar
              initial={(couple.me?.displayName || 'Y').charAt(0).toUpperCase()}
              uri={myAvatar}
              size={46}
              background={palette.green50}
            />
            <View style={styles.partnerFaceBack}>
              <Avatar
                initial={(couple.partner.displayName || 'P').charAt(0).toUpperCase()}
                uri={partnerAvatar}
                size={46}
                background={palette.purple100}
                color={palette.purple900}
              />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.partnerTitle} numberOfLines={1}>
              You & {name}
            </Text>
            <Text style={styles.partnerSub} numberOfLines={1}>
              {couple.streak > 0
                ? `${couple.streak}-day streak together${couple.atRisk ? ' · keep it alive today' : ''}`
                : 'Start your streak together today'}
            </Text>
          </View>
          <View style={styles.partnerGo}>
            <Text style={styles.partnerGoText}>Open</Text>
          </View>
        </LinearGradient>
      </PressableScale>
    );
  }

  const waiting = couple.awaitingPartner;
  return (
    <PressableScale
      onPress={() => router.push('/modal/couple-invite')}
      accessibilityRole="button"
      accessibilityLabel={waiting ? 'Share your pair invite' : 'Pair with your partner'}
      style={[styles.pairCard, surfaceShadow]}
    >
      <View style={styles.pairIcon}>
        <QrPlusIcon size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pairTitle}>{waiting ? 'Waiting for your partner' : 'Pair with your partner'}</Text>
        <Text style={styles.pairSub}>
          {waiting
            ? 'Your invite is out. Share the code again.'
            : 'Shared streak, two pandas, live water.'}
        </Text>
      </View>
      <View style={styles.pairGo}>
        <Text style={styles.pairGoText}>{waiting ? 'Share' : 'Pair'}</Text>
      </View>
    </PressableScale>
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
  const isPro = useEffectivePro();
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
  const q = search.trim().toLowerCase().replace(/^@+/, '');
  const filteredOpponents = OPPONENTS.filter((o) => !q || o.name.toLowerCase().includes(q));
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

  /* Every route into a set against an AI partner goes through here. The
     session redirects a walled athlete to the paywall on its own, but only
     after mounting and unmounting — the same bounce Home's `startSolo` exists
     to avoid. Asking first sends them straight to the paywall instead. */
  const walled = isWalled({
    isPro,
    repsSoFar: selectTotalReps({ sessions }),
    billingReady: isPurchasesConfigured(),
  });
  const startAiDuel = (opponentId: string) => {
    track('friend_invited', { kind: 'duel', isAI: true });
    if (walled) {
      router.push({ pathname: '/modal/paywall', params: { source: 'rep-limit', hard: '1' } });
      return;
    }
    router.push({
      pathname: '/session',
      params: { exercise: 'push', mode: 'versus', opponent: opponentId },
    });
  };

  /* Bots and phantoms are the labelled-AI roster. Marked as such so a roster
     padded with AI never reads back as organic social activity. */
  const duel = (opponent: Opponent) => startAiDuel(opponent.id);

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

  /* By uid, not username: the athlete on this row is already identified, so
     a missing username no longer blocks the add and two accounts sharing a
     handle can no longer collide ("Several athletes share that username"). */
  const addRecent = async (athlete: RecentAthlete) => {
    if (!uid) return;
    setAddingUid(athlete.uid);
    try {
      await addFriendByUid(uid, athlete.uid);
      showDialog({
        title: 'Friend added',
        message: `${athlete.displayName} is on your list. They can add you back from their Friends tab.`,
        tone: 'success',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
      refresh();
    } catch (err) {
      showDialog({
        title: 'Could not add',
        message: offline
          ? "You're offline. Connect to the internet and try again."
          : err instanceof Error
            ? err.message
            : 'Please try again.',
        tone: 'danger',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    } finally {
      setAddingUid(null);
    }
  };

  const botRow = (o: Opponent, index: number) => {
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
            <Avatar initial={o.initial} ai={o.id} size={46} background={tint(o.id).background} color={tint(o.id).color} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={text.cardTitle} numberOfLines={1}>{o.name}</Text>
                <AiTag />
              </View>
              <Text style={font('semibold', 11.5, { color: o.online ? palette.green600 : palette.grey600 })} numberOfLines={1}>
                {o.online ? 'Ready to race' : 'Offline'} · Lv.{o.level}
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
            <Text style={font('extrabold', 12.5, { color: palette.white })}>Duel</Text>
          </PressableScale>
        </View>
      </View>
    );
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
            placeholder="Search friends or rivals"
            placeholderTextColor={palette.grey450}
            style={styles.searchInput}
          />
        </View>
      </StaggerIn>

      {/* Your partner first: the closest bond has the top spot. Hidden while
          searching so results lead. */}
      {search.trim() ? null : (
        <StaggerIn index={1} style={{ marginTop: 14 }}>
          <PartnerCard />
        </StaggerIn>
      )}

      <StaggerIn index={1}>
        <HomeSectionHeader title="Active now" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.onlineRow}
        >
          <PressableScale
            onPress={() => router.push('/modal/add-friend')}
            accessibilityRole="button"
            accessibilityLabel="Add a friend"
            style={styles.onlineItem}
          >
            <View style={styles.addCircle}>
              <Text style={styles.addCirclePlus}>+</Text>
            </View>
            <Text style={styles.onlineName}>Add</Text>
          </PressableScale>

          {onlineFriends.map((f) => (
            <PressableScale
              key={f.uid}
              onPress={() => invite(f, 'duel')}
              accessibilityRole="button"
              accessibilityLabel={`Invite ${f.displayName}`}
              style={styles.onlineItem}
            >
              <View style={styles.liveRing}>
                <Avatar initial={(f.displayName || 'A').charAt(0).toUpperCase()} uri={f.avatarUrl} size={54} online />
              </View>
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
              <View style={styles.liveRing}>
                <Avatar
                  initial={o.initial}
                  ai={o.id}
                  size={54}
                  background={tint(o.id).background}
                  color={tint(o.id).color}
                  online
                />
              </View>
              <Text style={[styles.onlineName, { color: palette.ink }]} numberOfLines={1}>{o.name}</Text>
              <AiTag style={{ alignSelf: 'center' }} />
            </PressableScale>
          ))}

          {seed.phantomOnline.map((p) => (
            <PressableScale
              key={p.id}
              onPress={() => startAiDuel(p.id)}
              accessibilityRole="button"
              accessibilityLabel={`Duel ${p.name}`}
              style={styles.onlineItem}
            >
              <View style={styles.liveRing}>
                <Avatar
                  initial={p.initial}
                  emoji={p.emoji}
                  size={54}
                  background={p.tintBg}
                  color={p.tintColor}
                  online
                />
              </View>
              <Text style={[styles.onlineName, { color: palette.ink }]} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
              <AiTag style={{ alignSelf: 'center' }} />
            </PressableScale>
          ))}
        </ScrollView>
      </StaggerIn>

      {/* Real friends lead. The section always renders: a failed fetch, a
          search with no matches and having no friends are three different
          states and must look different. */}
      <StaggerIn index={2}>
        <HomeSectionHeader
          title="Your friends"
          right={cloudFriends.length > 0 ? <Text style={styles.sectionMeta}>{cloudFriends.length}</Text> : undefined}
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
                message={loadFailureMessage(offline, 'Your list is still safe — this is just the connection.')}
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
            <View style={[styles.emptyCard, surfaceShadow]}>
              <View style={styles.emptyIcon}>
                <QrPlusIcon size={28} />
              </View>
              <Text style={styles.emptyTitle}>Train harder with someone watching</Text>
              <Text style={styles.emptyBody}>
                Friends see your streak, race you live and keep you showing up. Add one by username or
                scan their code.
              </Text>
              <View style={styles.emptyActions}>
                <PressableScale
                  onPress={() => router.push('/modal/add-friend')}
                  accessibilityRole="button"
                  accessibilityLabel="Add a friend"
                  style={[styles.emptyButton, styles.emptyButtonPrimary]}
                >
                  <Text style={font('extrabold', 14, { color: palette.white })}>Add a friend</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => router.push('/modal/scan')}
                  accessibilityRole="button"
                  accessibilityLabel="Scan or show a QR code"
                  style={[styles.emptyButton, styles.emptyButtonSoft]}
                >
                  <Text style={font('extrabold', 14, { color: palette.green700 })}>Scan a code</Text>
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
                        size={50}
                        online={f.online}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {f.displayName}
                        </Text>
                        <View style={styles.statusRow}>
                          <View style={[styles.statusDot, { backgroundColor: f.online ? palette.green500 : palette.grey400 }]} />
                          <Text
                            style={font('semibold', 12, { color: f.online ? palette.green600 : palette.grey600 })}
                            numberOfLines={1}
                          >
                            {lastSeenLabel(f.online, f.lastActiveAt)}
                          </Text>
                          <View style={styles.levelChip}>
                            <Text style={styles.levelChipText}>Lv.{f.level}</Text>
                          </View>
                        </View>
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
                        style={[styles.actionPill, styles.actionPillSoft]}
                      >
                        <Text style={font('extrabold', 12, { color: palette.green700 })}>Train together</Text>
                      </PressableScale>
                      <PressableScale
                        onPress={() => invite(f, 'compete')}
                        accessibilityRole="button"
                        accessibilityLabel={`Compete with ${f.displayName}`}
                        style={[styles.actionPill, styles.actionPillSoft]}
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
        <StaggerIn index={3}>
          <HomeSectionHeader title="New on RepChamp" />
          <View style={styles.card}>
            {newAthletes.slice(0, 8).map((a, index) => (
              <View key={a.uid}>
                {index > 0 ? <Divider style={{ marginHorizontal: 8 }} /> : null}
                <View style={styles.friendRow}>
                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: '/modal/friend',
                        params: {
                          id: a.uid,
                          name: a.displayName,
                          level: String(a.level),
                          ...(a.avatarUrl ? { avatar: a.avatarUrl } : {}),
                          online: '0',
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`View ${a.displayName}'s profile`}
                    style={styles.friendInfo}
                  >
                    <Avatar initial={(a.displayName || 'A').charAt(0).toUpperCase()} uri={a.avatarUrl} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={text.cardTitle} numberOfLines={1}>
                        {discoveryTitle(a)}
                      </Text>
                      <Text style={font('semibold', 11.5, { color: palette.grey600 })}>
                        {isPlaceholderName(a) ? 'New athlete' : a.username ? `@${a.username}` : 'Just joined'}
                      </Text>
                    </View>
                  </PressableScale>
                  <PressableScale
                    onPress={() => void addRecent(a)}
                    disabled={addingUid === a.uid}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${a.displayName}`}
                    style={styles.addButton}
                  >
                    <Text style={font('extrabold', 12.5, { color: palette.green700 })}>
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
          <HomeSectionHeader title="Suggested training partners" />
          <View style={styles.card}>
            {seed.phantomFriends.map((p, index) => (
              <View key={p.id}>
                {index > 0 ? <Divider style={{ marginHorizontal: 8 }} /> : null}
                <View style={styles.friendRow}>
                  <View style={styles.friendInfo}>
                    <Avatar initial={p.initial} emoji={p.emoji} size={46} background={p.tintBg} color={p.tintColor} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={text.cardTitle} numberOfLines={1}>{p.name}</Text>
                        <AiTag />
                      </View>
                      <Text style={font('semibold', 11.5, { color: p.online ? palette.green600 : palette.grey600 })} numberOfLines={1}>
                        {p.tagline.replace(/^AI · /, '')} · Lv.{p.level}
                      </Text>
                    </View>
                  </View>
                  <PressableScale
                    onPress={() => startAiDuel(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Duel ${p.name}`}
                    style={styles.duelButton}
                  >
                    <Text style={font('extrabold', 12.5, { color: palette.white })}>Duel</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </View>
        </StaggerIn>
      ) : null}

      {filteredOpponents.length > 0 ? (
        <StaggerIn index={4}>
          <HomeSectionHeader title="Practice with AI partners" />
          <View style={styles.card}>{filteredOpponents.map((o, i) => botRow(o, i))}</View>
        </StaggerIn>
      ) : null}
    </Screen>
  );
}

/**
 * Accounts that never set a name carry the app's placeholder, "Champion". Three
 * of them in a row are indistinguishable, so discovery leads with the handle
 * instead — the one thing that tells them apart.
 */
function isPlaceholderName(a: { displayName: string; username?: string | null }): boolean {
  return a.displayName === 'Champion' && Boolean(a.username);
}

function discoveryTitle(a: { displayName: string; username?: string | null }): string {
  return isPlaceholderName(a) ? (a.username as string) : a.displayName;
}

const styles = StyleSheet.create({
  /* Sentence case, one size up: tracked all-caps labels read as template. */
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

  /* Partner card — paired: the emerald hero Home and Train use. */
  partnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius['4xl'],
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  partnerFaces: { flexDirection: 'row', alignItems: 'center' },
  partnerFaceBack: { marginLeft: -14, borderRadius: 30, borderWidth: 3, borderColor: '#0B5132' },
  partnerTitle: { ...font('extrabold', 17, { color: palette.white }), letterSpacing: -0.3 },
  partnerSub: { ...font('semibold', 12.5, { color: 'rgba(255,255,255,0.82)' }), marginTop: 2 },
  partnerGo: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  partnerGoText: font('extrabold', 12.5, { color: palette.white }),

  /* Partner card — not paired / waiting: light, inviting. */
  pairCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius['4xl'],
    padding: 14,
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.green300,
  },
  pairIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairTitle: font('extrabold', 15.5, { color: palette.ink }),
  pairSub: { ...font('semibold', 12.5, { color: palette.grey600 }), marginTop: 2, lineHeight: 17 },
  pairGo: { backgroundColor: palette.green500, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  pairGoText: font('extrabold', 13, { color: palette.white }),

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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  levelChip: { backgroundColor: palette.divider, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  levelChipText: font('extrabold', 10.5, { color: palette.grey600 }),
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

  /* No friends yet: a light card, not a dark slab. */
  emptyCard: {
    borderRadius: radius['6xl'],
    padding: 20,
    alignItems: 'center',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...font('extrabold', 19, { color: palette.ink }), letterSpacing: -0.4, textAlign: 'center', marginTop: 14 },
  emptyBody: { ...font('medium', 13.5, { color: palette.grey600 }), lineHeight: 19, textAlign: 'center', marginTop: 6 },
  emptyActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  emptyButton: { flex: 1, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  emptyButtonPrimary: { backgroundColor: palette.green500 },
  emptyButtonSoft: { backgroundColor: palette.green50, borderWidth: 1, borderColor: '#bfeccb' },

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
  onlineItem: { alignItems: 'center', gap: 4, width: 76 },
  liveRing: {
    padding: 3,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: palette.green300,
  },
  addCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.green300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCirclePlus: { ...font('extrabold', 26, { color: palette.green600 }), marginTop: -2 },
  onlineName: font('bold', 11.5, { color: palette.grey600 }),
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
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
    borderRadius: radius.pill,
  },
  /* "Add" shares a shape with "Duel" but not its weight: duelling is what the
     app is for; adding someone is administrative. */
  addButton: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
  actionPill: {
    backgroundColor: palette.green500,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  actionPillSoft: {
    backgroundColor: palette.green50,
  },
  actionPillMuted: {
    backgroundColor: palette.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTag: {
    backgroundColor: palette.green50,
    borderRadius: radius.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  aiTagText: font('extrabold', 9.5, { color: palette.green700, letterSpacing: 0.3 }),
});
