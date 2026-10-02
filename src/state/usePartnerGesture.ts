import { useEffect, useRef, useState } from 'react';

import type { CoupleMember } from '@/domain/couple';
import { partnerPokeToday } from '@/domain/couple';
import { actionFromCode, cleanActionPoke, type PandaAction } from '@/domain/pandaActions';
import { isNewPoke } from '@/domain/ritual';

/**
 * The partner's panda gestures as they arrive live: each one once, only while
 * fresh, never replayed from history when the screen first opens. `key` is
 * the gesture's time, so the same kind twice in a row still plays twice.
 */
export function usePartnerGesture(
  partner: CoupleMember | null | undefined,
  today: string,
): { action: PandaAction; key: number } | null {
  const poke = cleanActionPoke(partnerPokeToday(partner, today));
  const last = useRef<number | null>(null);
  const [incoming, setIncoming] = useState<{ action: PandaAction; key: number } | null>(null);
  useEffect(() => {
    if (last.current === null) {
      // First look: whatever is there already happened.
      last.current = poke?.at ?? 0;
      return;
    }
    if (!isNewPoke(poke, last.current, Date.now())) return;
    last.current = poke!.at;
    const action = actionFromCode(poke!.e);
    if (!action) return;
    const at = poke!.at;
    const t = setTimeout(() => setIncoming({ action, key: at }), 0);
    return () => clearTimeout(t);
    // Keyed by the poke's time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poke?.at]);
  return incoming;
}
