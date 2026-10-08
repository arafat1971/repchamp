/**
 * The system rating sheet, asked for at a good moment.
 *
 * `shouldAskForReview` decides *whether*; this owns the OS call and the ask log.
 * Never throws — an unavailable sheet (no Play Store, an emulator, the OS quota
 * already spent) is a quiet no-op, because a rating prompt must never be the
 * reason a result screen misbehaves.
 *
 * The ask is recorded before the call returns, not after: the OS decides whether
 * to actually show the sheet and does not say, so a prompt it dropped still uses
 * up our cooldown rather than being retried on the very next good set.
 */

import * as StoreReview from 'expo-store-review';

import { track } from '@/lib/analytics';
import { storage } from '@/lib/storage';
import { parseAsks, shouldAskForReview, type ReviewPromptInput } from '@/domain/reviewPrompt';

const ASKS_KEY = 'repchamp.review.asks';

export async function maybeRequestReview(
  moment: Omit<ReviewPromptInput, 'now' | 'asks'>,
  now = Date.now(),
): Promise<boolean> {
  try {
    const asks = parseAsks(storage.getString(ASKS_KEY));
    if (!shouldAskForReview({ ...moment, now, asks })) return false;
    if (!(await StoreReview.isAvailableAsync())) return false;

    storage.set(ASKS_KEY, JSON.stringify([...asks, now]));
    track('review_prompt_requested', { tier: String(moment.highlightTier), sessions: moment.sessionCount });
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
