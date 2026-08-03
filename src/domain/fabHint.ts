/**
 * Teaching the FAB's hold gesture.
 *
 * The FAB does two different things: a tap fires the single best next action,
 * and a hold opens the full menu. The hold is the only route to everything
 * else, and nothing on screen said so — a gesture with no affordance is a
 * feature most athletes never find.
 *
 * The rule here is that the hint teaches and then gets out of the way. It
 * shows for the first few launches, and stops immediately once the athlete
 * has opened the menu even once — at that point they know, and repeating it
 * would just be noise on a button they use every session.
 */

/** Launches to show the hint for, if the gesture is never used. */
export const FAB_HINT_MAX_SHOWS = 3;

export type FabHintState = {
  /** How many times the hint has been shown. */
  shows: number;
  /** Whether the athlete has ever opened the menu with a hold. */
  used: boolean;
};

export const EMPTY_FAB_HINT: FabHintState = { shows: 0, used: false };

/**
 * Whether to show "Hold for more" this launch.
 *
 * Discovering the gesture retires the hint permanently, which is why `used`
 * is checked before the count rather than alongside it.
 */
export function shouldShowFabHint(state: FabHintState): boolean {
  if (state.used) return false;
  return state.shows < FAB_HINT_MAX_SHOWS;
}

/** Records that the hint was displayed. Never counts past the cap. */
export function markFabHintShown(state: FabHintState): FabHintState {
  if (state.used) return state;
  return { ...state, shows: Math.min(state.shows + 1, FAB_HINT_MAX_SHOWS) };
}

/** Records a hold. The athlete knows the gesture, so the hint is done. */
export function markFabHintUsed(state: FabHintState): FabHintState {
  return { ...state, used: true };
}

/**
 * Parses persisted JSON, tolerating anything.
 *
 * A corrupt or partial value must not throw on the launch path — this sits in
 * the tab layout, so an exception here white-screens the app. Falling back to
 * the empty state costs an athlete at most three extra hint impressions.
 */
export function parseFabHint(raw: string | null | undefined): FabHintState {
  if (!raw) return EMPTY_FAB_HINT;
  try {
    const v = JSON.parse(raw) as Partial<FabHintState> | null;
    if (!v || typeof v !== 'object') return EMPTY_FAB_HINT;
    const shows = typeof v.shows === 'number' && Number.isFinite(v.shows) ? v.shows : 0;
    return {
      shows: Math.max(0, Math.min(Math.trunc(shows), FAB_HINT_MAX_SHOWS)),
      used: v.used === true,
    };
  } catch {
    return EMPTY_FAB_HINT;
  }
}
