import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { DEFAULT_STEP_GOAL, type StepsState } from '@/domain/steps';
import { readStepsToday } from '@/services/pedometer';

/**
 * Today's step count, refreshed when it can have changed.
 *
 * Re-read on foreground rather than polled. Neither platform delivers
 * pedometer updates to a backgrounded app, so the count cannot move while the
 * athlete is away — but it will have moved *by the time they come back*, which
 * is exactly when the card is about to be looked at. A timer would spend
 * battery to learn nothing.
 *
 * Starts in `loading` rather than assuming unsupported, so the ring shows a
 * neutral dash for the moment the first read takes instead of flashing an
 * "iPhone-only" line at an iPhone.
 */
export function useStepsToday(goal: number = DEFAULT_STEP_GOAL): {
  steps: StepsState;
  refresh: () => void;
  openSettings: () => void;
} {
  const [steps, setSteps] = useState<StepsState>({ status: 'loading' });

  const refresh = useCallback(() => {
    let cancelled = false;
    void readStepsToday(goal).then((next) => {
      if (!cancelled) setSteps(next);
    });
    return () => {
      cancelled = true;
    };
  }, [goal]);

  useEffect(() => {
    const cancel = refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      cancel?.();
      sub.remove();
    };
  }, [refresh]);

  /* Offered only for a denied permission — the one reason an athlete can
     actually act on. `openSettings` lands on this app's own page. */
  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {});
  }, []);

  return { steps, refresh, openSettings };
}
