/**
 * Leaderboard & friends service.
 *
 * Sits behind the existing `buildLeaderboard` seam (src/domain/leaderboard.ts).
 * When Firebase is live it reads the flat `leaderboard` collection — a single
 * ordered query, cheap at any scale — and shapes rows into the exact
 * `LeaderboardRow` type the UI already consumes. When it isn't, it defers to the
 * local hardcoded board so the screen is never empty.
 *
 * The friend graph lives under `users/{uid}/friends/{friendUid}`; adding a
 * friend is a single doc write. Real async duels are intentionally out of scope
 * for this pass — opponents stay bot-paced (see src/domain/opponent.ts) — but
 * the friend list here is real once provisioned.
 */

import firestore from '@react-native-firebase/firestore';

import { isFirebaseConfigured } from '@/lib/firebase';
import { buildLeaderboard, type LeaderboardRow } from '@/domain/leaderboard';
import { ACTIVE_WINDOW_MS, isRecentlyActive } from '@/domain/presence';
import { currentWeekKey } from '@/services/userService';

const AVATAR_TINTS = ['#fde68a', '#ddd6fe', '#bfdbfe', '#fecdd3', '#bbf7d0', '#bae6fd'];
const AVATAR_INK = ['#92400e', '#5b21b6', '#1e40af', '#be123c', '#15803d', '#0369a1'];

function tintFor(uid: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  const idx = hash % AVATAR_TINTS.length;
  return { background: AVATAR_TINTS[idx]!, color: AVATAR_INK[idx]! };
}

/**
 * Top-N weekly leaderboard with the athlete merged in.
 *
 * Live path: order by weeklyXp desc, take the top slice, and guarantee the
 * current user appears even if they're below the cutoff. Falls back to the
 * local board on any error or when unconfigured, so the UI degrades gracefully
 * rather than throwing.
 */
export async function fetchLeaderboard(
  myUid: string,
  myWeeklyXp: number,
  myUsername: string,
  limit = 20,
): Promise<LeaderboardRow[]> {
  if (!isFirebaseConfigured()) {
    return buildLeaderboard(myWeeklyXp, myUsername);
  }

  try {
    const snap = await firestore()
      .collection('leaderboard')
      .where('weekKey', '==', currentWeekKey())
      .orderBy('weeklyXp', 'desc')
      .limit(limit)
      .get();

    const rows = snap.docs.map((doc) => {
      const d = doc.data() as {
        displayName?: string;
        weeklyXp?: number;
        level?: number;
        uid?: string;
      };
      const uid = d.uid ?? doc.id;
      const tint = tintFor(uid);
      const name = d.displayName ?? 'Athlete';
      return {
        id: uid,
        name,
        initial: (name || 'A').charAt(0).toUpperCase(),
        xp: d.weeklyXp ?? 0,
        level: d.level ?? 1,
        background: tint.background,
        color: tint.color,
        rank: 0,
        isYou: uid === myUid,
      } satisfies LeaderboardRow;
    });

    // Guarantee "you" is present even when below the fetched cutoff.
    if (!rows.some((r) => r.isYou)) {
      const tint = tintFor(myUid);
      rows.push({
        id: myUid,
        name: myUsername,
        initial: (myUsername || 'Y').charAt(0).toUpperCase(),
        xp: myWeeklyXp,
        level: 1,
        background: tint.background,
        color: tint.color,
        rank: 0,
        isYou: true,
      });
    }

    return rows
      .sort((a, b) => (b.xp !== a.xp ? b.xp - a.xp : a.isYou ? -1 : b.isYou ? 1 : 0))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  } catch {
    // Network/permission hiccup — never leave the board blank.
    return buildLeaderboard(myWeeklyXp, myUsername);
  }
}

export interface Friend {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

/** Live friend list, empty array when unconfigured. */
export async function fetchFriends(uid: string): Promise<Friend[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const snap = await firestore()
      .collection('users')
      .doc(uid)
      .collection('friends')
      .get();
    return snap.docs.map((d) => {
      const data = d.data() as Partial<Friend>;
      return {
        uid: d.id,
        displayName: data.displayName ?? 'Athlete',
        avatarUrl: data.avatarUrl ?? null,
        level: data.level ?? 1,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Add a friend by their public username.
 *
 * Writes **your** edge only (owner-scoped). The other athlete can add you back
 * by username — Firestore rules forbid force-injecting yourself onto someone
 * else's list. Resolves to false when unconfigured.
 */
export async function addFriendByUsername(
  myUid: string,
  username: string,
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  const match = await firestore()
    .collection('users')
    .where('username', '==', username.trim().toLowerCase())
    .limit(1)
    .get();

  if (match.empty) throw new Error(`No athlete found with username "${username}"`);
  const friendDoc = match.docs[0]!;
  if (friendDoc.id === myUid) throw new Error("That's you!");

  const theirs = friendDoc.data() as Partial<Friend> & { displayName?: string };

  await firestore()
    .collection('users')
    .doc(myUid)
    .collection('friends')
    .doc(friendDoc.id)
    .set({
      displayName: theirs.displayName ?? 'Athlete',
      avatarUrl: theirs.avatarUrl ?? null,
      level: theirs.level ?? 1,
      addedAt: firestore.FieldValue.serverTimestamp(),
    });

  return true;
}

export interface ActiveFriend extends Friend {
  lastActiveAt: number | null;
  online: boolean;
  username: string | null;
}

/**
 * Friends enriched with live presence from their public profile heartbeat.
 * Stale / missing stamps count as offline. Empty when unconfigured.
 */
export async function fetchActiveFriends(
  uid: string,
  withinMs = ACTIVE_WINDOW_MS,
  now = Date.now(),
): Promise<ActiveFriend[]> {
  const friends = await fetchFriends(uid);
  if (!friends.length || !isFirebaseConfigured()) {
    return friends.map((f) => ({
      ...f,
      lastActiveAt: null,
      online: false,
      username: null,
    }));
  }

  try {
    const snaps = await Promise.all(
      friends.map((f) => firestore().collection('users').doc(f.uid).get()),
    );
    return friends.map((f, i) => {
      const data = snaps[i]?.data() as
        | {
            lastActiveAt?: number;
            username?: string;
            displayName?: string;
            avatarUrl?: string | null;
            level?: number;
          }
        | undefined;
      const lastActiveAt =
        typeof data?.lastActiveAt === 'number' ? data.lastActiveAt : null;
      return {
        uid: f.uid,
        displayName: data?.displayName ?? f.displayName,
        avatarUrl: data?.avatarUrl ?? f.avatarUrl,
        level: data?.level ?? f.level,
        lastActiveAt,
        online: isRecentlyActive(lastActiveAt, now, withinMs),
        username: data?.username ?? null,
      };
    });
  } catch {
    return friends.map((f) => ({
      ...f,
      lastActiveAt: null,
      online: false,
      username: null,
    }));
  }
}

export interface RecentAthlete {
  uid: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  level: number;
  createdAt: number | null;
}

/**
 * Newest public profiles — "New on RepChamp". Excludes `excludeUid`. Empty when
 * unconfigured or on query error.
 */
export async function fetchRecentAthletes(
  excludeUid: string,
  limit = 12,
): Promise<RecentAthlete[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const snap = await firestore()
      .collection('users')
      .orderBy('createdAt', 'desc')
      .limit(limit + 4)
      .get();

    return snap.docs
      .filter((d) => d.id !== excludeUid)
      .slice(0, limit)
      .map((d) => {
        const data = d.data() as {
          displayName?: string;
          username?: string;
          avatarUrl?: string | null;
          level?: number;
          createdAt?: number;
        };
        return {
          uid: d.id,
          displayName: data.displayName ?? 'Athlete',
          username: data.username ?? null,
          avatarUrl: data.avatarUrl ?? null,
          level: data.level ?? 1,
          createdAt: typeof data.createdAt === 'number' ? data.createdAt : null,
        };
      });
  } catch {
    return [];
  }
}
