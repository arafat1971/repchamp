import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { DEFAULT_STEP_GOAL, type StepsState } from '@/domain/steps';
import { readStepsToday, requestAndroidStepPermission } from '@/services/pedometer';

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

  /* One flag shared by every in-flight read, rather than one per call.
     
     The previous shape returned a per-call `cancelled` closure, and only the
     read started in the effect body was ever cancelled — each AppState
     refresh created a flag nobody kept, so a foregrounded read could resolve
     after unmount and call `setSteps` on a dead component. React reported it
     as "Can't perform a React state update on a component that hasn't mounted
     yet", which showed up on the physical device and nowhere in the tests,
     since they never mount the hook. */
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    void readStepsToday(goal).then((next) => {
      if (mounted.current) setSteps(next);
    });
  }, [goal]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [refresh]);

  /* Offered only for a denied permission — the one reason an athlete can
     actually act on.
     
     On Android the first refusal is recoverable in-app: ask for
     ACTIVITY_RECOGNITION and re-read on a grant. Only once the OS stops
     showing the dialog (a permanent denial) does Settings become the only
     route, and `request` resolving false covers both cases identically from
     here — so try the dialog first and fall back. */
  const openSettings = useCallback(() => {
    void (async () => {
      if (Platform.OS === 'android') {
        const granted = await requestAndroidStepPermission();
        if (granted) {
          refresh();
          return;
        }
      }
      void Linking.openSettings().catch(() => {});
    })();
  }, [refresh]);

  return { steps, refresh, openSettings };
}
