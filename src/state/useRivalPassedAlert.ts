/**
 * At most one "rival passed you" alert per week.
 *
 * Compares this athlete's weekly XP to friends on the live leaderboard. Purely
 * best-effort — offline or empty friends = silence.
 */

import { useEffect, useRef } from 'react';

import { presentRivalPassed } from '@/lib/notifications';
import { fetchFriends, fetchLeaderboard } from '@/services/leaderboardService';
import { currentWeekKey } from '@/services/userService';
import { useAuthStore } from '@/state/authStore';
import { selectWeeklyXp, useProfileStore } from '@/state/profileStore';

export function useRivalPassedAlert(): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const weeklyXp = useProfileStore(selectWeeklyXp);
  const username = useProfileStore((s) => s.username);
  const ran = useRef(false);

  useEffect(() => {
    if (!uid || ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const [friends, board] = await Promise.all([
          fetchFriends(uid),
          fetchLeaderboard(uid, weeklyXp, username || 'You', 30),
        ]);
        if (friends.length === 0) return;
        const friendIds = new Set(friends.map((f) => f.uid));
        const me = board.find((r) => r.isYou);
        if (!me) return;

        const passer = board.find(
          (r) => friendIds.has(r.id) && !r.isYou && r.xp > me.xp && r.xp > 0,
        );
        if (!passer) return;

        await presentRivalPassed({
          rivalName: passer.name,
          weekKey: currentWeekKey(),
        });
      } catch {
        // Offline — skip.
      }
    })();
  }, [uid, weeklyXp, username]);
}
