import type { HomeFocus } from '@/domain/homeFocus';

/** How long "Not now" keeps the invite card away. */
export const INVITE_CARD_SNOOZE_DAYS = 7;
const DAY_MS = 86_400_000;

export interface InviteCardInput {
  /** Both couple seats filled. */
  paired: boolean;
  /** The couple document has not answered yet — a paired athlete must not flash the invite. */
  coupleLoading: boolean;
  /** Has finished at least one session. A brand-new athlete needs a first rep, not a partner. */
  hasTrained: boolean;
  /** What the hero is already saying. */
  focusKind: HomeFocus['kind'];
  /** When "Not now" was last tapped, in ms, or null. */
  dismissedAt: number | null;
  now: number;
}

/**
 * Should Home show a standing "train with a partner" card?
 *
 * The hero only asks for a partner when nothing else is pending, which for a
 * solo athlete is rarely: the daily challenge takes that slot most days, so the
 * couple loop — the app's growth path — was effectively invisible. This card
 * gives it a stable home of its own.
 *
 * Quiet by construction: never for someone paired or still loading, never
 * before a first session, never while the hero is already the same invite, and
 * hidden for a week after "Not now" so a standing card cannot turn into a nag.
 */
export function showInvitePartnerCard(input: InviteCardInput): boolean {
  if (input.paired || input.coupleLoading || !input.hasTrained) return false;
  if (input.focusKind === 'invite-partner') return false;
  if (input.dismissedAt != null && input.now - input.dismissedAt < INVITE_CARD_SNOOZE_DAYS * DAY_MS) {
    return false;
  }
  return true;
}
