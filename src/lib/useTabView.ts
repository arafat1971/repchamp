import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { track, type AnalyticsEvents } from '@/lib/analytics';

/**
 * Record that a tab became the active surface.
 *
 * On focus rather than on mount: a tab screen stays mounted once visited, so a
 * mount effect would fire once per app run and undercount every return visit —
 * which is the opposite of what a retention number is for. `useFocusEffect`
 * fires on every switch back, so this counts views rather than first opens.
 *
 * Exists as a shared hook rather than four copies of the same effect so the
 * event name and the firing rule stay in one place; the tab name is the only
 * thing a caller chooses, and it is typed against the event's own union.
 */
export function useTabView(tab: AnalyticsEvents['tab_viewed']['tab']): void {
  useFocusEffect(
    useCallback(() => {
      track('tab_viewed', { tab });
    }, [tab]),
  );
}
