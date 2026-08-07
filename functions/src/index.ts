/**
 * Challenge push delivery.
 *
 * Why this has to be server-side, when the couple nudge is not: a push token
 * lives at `users/{uid}/private/push`, which is owner-only on purpose — the
 * client rules say so, and `saveExpoPushToken` actively deletes any copy left
 * on the world-readable profile. Couples get around that by each partner writing
 * their own token onto the shared couple document, which is safe because a
 * couple is a two-person bond both sides opted into. A duel is not: anyone may
 * challenge anyone, so there is no equivalent place to publish a token that
 * would not also hand it to strangers.
 *
 * So the sender cannot read the target's token, and should not be able to.
 * Admin SDK can, and never returns it to any client.
 *
 * The client already routes `{ type: 'challenge', duelId }` — see the
 * notification handler in `app/_layout.tsx` — so this emits exactly that
 * payload and no new client wiring is needed to make a tap land in the duel.
 */

import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

// europe-west1 would be closer to most of the userbase, but the Firestore
// database is us-central1 and a trigger must sit in its region.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo rejects anything that is not one of its own tokens; don't spend a POST. */
function isExpoToken(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('ExponentPushToken');
}

/** Mirrors `InviteKind` in the app — the wording the athlete already expects. */
function verbFor(kind: unknown): string {
  if (kind === 'train') return 'wants to train together';
  if (kind === 'compete') return 'challenged you this week';
  return 'challenged you to a duel';
}

export const challengeOnCreate = onDocumentCreated('duels/{duelId}', async (event) => {
  const duel = event.data?.data();
  if (!duel) return;

  const duelId = event.params.duelId;
  const targetUid = duel.targetUid;

  // Open/QR duels have no addressee — nobody to notify, by design.
  if (typeof targetUid !== 'string' || !targetUid) return;
  // Only a fresh invite is worth a push; an already-joined duel is not news.
  if (duel.status !== 'pending') return;
  // Never notify someone about their own challenge.
  if (targetUid === duel.hostUid) return;

  const db = getFirestore();

  /* The target may have blocked the host. The client checks this before
   * sending, but that check runs on the sender's device and reads the
   * sender's own block list — it cannot see the *target's*. This is the only
   * place both sides are visible, so it is the only place the target's
   * decision can actually be honoured. */
  const blocked = await db
    .collection('users')
    .doc(targetUid)
    .collection('blocks')
    .doc(duel.hostUid)
    .get();
  if (blocked.exists) {
    logger.info('challenge push suppressed: target blocked host', { duelId });
    return;
  }

  const pushDoc = await db
    .collection('users')
    .doc(targetUid)
    .collection('private')
    .doc('push')
    .get();

  const token = pushDoc.get('expoPushToken');
  if (!isExpoToken(token)) {
    // No token is ordinary: notifications declined, or a device that has not
    // registered yet. The in-app inbox still shows the challenge.
    logger.info('challenge push skipped: no usable token', { duelId });
    return;
  }

  const hostName =
    (typeof duel.host?.displayName === 'string' && duel.host.displayName) || 'Someone';

  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title: 'Challenge invite',
        body: `${hostName} ${verbFor(duel.kind)}.`,
        // Matches the local notification the inbox poller raises, so a tap
        // routes the same way whichever arrived first.
        data: { type: 'challenge', duelId },
        channelId: 'social',
        priority: 'high',
      }),
    });

    /* Expo answers 200 with per-message errors in the body, so a bare status
     * check would call a DeviceNotRegistered a success. Log the real outcome —
     * a token that has gone stale is the likeliest reason a challenge silently
     * stops arriving, and it is invisible without this. */
    const body = (await res.json()) as {
      data?: { status?: string; message?: string; details?: { error?: string } };
    };
    const status = body?.data?.status;
    if (status !== 'ok') {
      logger.warn('expo rejected challenge push', {
        duelId,
        status,
        message: body?.data?.message,
        error: body?.data?.details?.error,
      });
      return;
    }
    logger.info('challenge push sent', { duelId });
  } catch (err) {
    // Best-effort: the challenge already exists in the target's inbox, so a
    // failed push costs freshness, not the invite.
    logger.error('challenge push failed', { duelId, err });
  }
});
