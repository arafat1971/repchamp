import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { advanceClock, clockAt, type HomeClock } from '@/domain/homeClock';

/**
 * A minute clock for Home that only costs a render when it has to.
 *
 * Ticks while the screen is focused, and re-reads on focus and on foreground —
 * the two ways a phone left on this screen overnight comes back with a stale
 * "today". Tabs stay mounted, so without the focus gate the interval kept
 * running (and re-rendering) while another tab was on screen.
 *
 * `readsMinute` is true only when something visible depends on the minute;
 * see `advanceClock`.
 */
export function useHomeClock(readsMinute: boolean): HomeClock {
  const [clock, setClock] = useState<HomeClock>(() => clockAt(Date.now()));
  const reads = useRef(readsMinute);
  useEffect(() => {
    reads.current = readsMinute;
  }, [readsMinute]);

  const tick = useCallback(() => {
    setClock((prev) => advanceClock(prev, Date.now(), reads.current));
  }, []);

  useFocusEffect(
    useCallback(() => {
      tick();
      const id = setInterval(tick, 60_000);
      return () => clearInterval(id);
    }, [tick]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => sub.remove();
  }, [tick]);

  return clock;
}
