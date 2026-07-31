/**
 * At most one "rival passed you" alert per week.
 *
 * Fires only on a real overtake vs the last snapshot (friend was at/below you,
 * now above) — not merely "any friend has more weekly XP." First run of the
 * week seeds the snapshot silently.
 */

import { useEffect, useRef } from 'react';

import { presentRivalPassed } from '@/lib/notifications';
import { storage } from '@/lib/storage';
import { fetchFriends, fetchLeaderboard } from '@/services/leaderboardService';
import { currentWeekKey } from '@/services/userService';
import { useAuthStore } from '@/state/authStore';
import { selectWeeklyXp, useProfileStore } from '@/state/profileStore';

const SNAP_KEY = 'repchamp.rival.friendWeeklyXp';
const SNAP_WEEK_KEY = 'repchamp.rival.friendWeeklyXp.week';

function readSnap(): Record<string, number> {
  try {
    const raw = storage.getString(SNAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSnap(map: Record<string, number>, weekKey: string): void {
  storage.set(SNAP_KEY, JSON.stringify(map));
  storage.set(SNAP_WEEK_KEY, weekKey);
}

export function useRivalPassedAlert(): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const weeklyXp = useProfileStore(selectWeeklyXp);
  const username = useProfileStore((s) => s.username);
  /** Last uid we successfully seeded — empty friends must not permanently disable. */
  const seededForUid = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      seededForUid.current = null;
      return;
    }
    if (seededForUid.current === uid) return;

    void (async () => {
      try {
        const weekKey = currentWeekKey();
        const [friends, board] = await Promise.all([
          fetchFriends(uid),
          fetchLeaderboard(uid, weeklyXp, username || 'You', 30),
        ]);
        if (friends.length === 0) return;
        const friendIds = new Set(friends.map((f) => f.uid));
        const me = board.find((r) => r.isYou);
        if (!me) return;

        const next: Record<string, number> = { __me__: me.xp };
        for (const r of board) {
          if (friendIds.has(r.id) && !r.isYou) next[r.id] = r.xp;
        }

        const snapWeek = storage.getString(SNAP_WEEK_KEY);
        const prev = snapWeek === weekKey ? readSnap() : {};
        const seeded = Object.keys(prev).length > 0;

        // Always refresh the snapshot for this week.
        writeSnap(next, weekKey);
        // Latch only after a successful seed so empty/failed first runs can retry.
        seededForUid.current = uid;

        if (!seeded) return;

        const prevMe = typeof prev.__me__ === 'number' ? prev.__me__ : me.xp;
        const passer = board.find((r) => {
          if (!friendIds.has(r.id) || r.isYou || r.xp <= me.xp || r.xp <= 0) return false;
          const was = prev[r.id];
          // They were not ahead of our last known score; now they are above us.
          return (was ?? 0) <= prevMe && r.xp > prevMe;
        });
        if (!passer) return;

        await presentRivalPassed({
          rivalName: passer.name,
          weekKey,
        });
      } catch {
        // Offline — leave latch clear so the next effect can retry.
      }
    })();
  }, [uid, weeklyXp, username]);
}