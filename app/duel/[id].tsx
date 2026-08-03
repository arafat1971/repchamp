import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, PressableScale, Screen } from '@/components/ui';
import { seatOf, type Duel } from '@/domain/duel';
import { BrandedQR } from '@/components/BrandedQR';
import { parseDuelExercise } from '@/domain/duelExercises';
import { duelInviteDeepLink } from '@/domain/duelInvite';
import { createDuel, fetchDuel, joinDuel, watchDuel, cancelDuel } from '@/services/duelService';
import { commitClientRateLimit } from '@/services/safetyService';
import { successHaptic } from '@/lib/feedback';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import { font, text } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';
import type { ExerciseId } from '@/vision/exercises';

/**
 * Duel waiting room — the matchmaking bridge between a challenge and the live set.
 *
 * Two roles reach this screen:
 *  - **host**: opened it from a "Challenge" action. We `createDuel` on mount and
 *    sit on "waiting for opponent…", watching the doc until a guest joins.
 *  - **guest**: opened it from a challenge/invite. We `joinDuel` on mount, which
 *    flips the duel to `active`.
 *
 * When the doc reaches `active` with both seats filled, both clients route into
 * `/session?duel=<id>` together, so the live wiring (useLiveDuel) takes over.
 *
 * Live duels require Firebase. When it isn't configured `createDuel`/`joinDuel`
 * return null, so we surface a friendly "duels go live once the backend is set up"
 * state and offer the bot duel instead — the app is never dead-ended.
 *
 * Params:
 *   role       'host' | 'guest'
 *   id         duel id (guest only; host mints its own)
 *   name/level opponent display fields, for the host's waiting card
 */
export default function DuelWaitingScreen() {
  const router = useRouter();
  const self = useSelfPlayer();
  const params = useLocalSearchParams<{
    role?: string;
    id?: string;
    name?: string;
    level?: string;
    target?: string;
    exercise?: string;
    duration?: string;
    kind?: string;
  }>();
  const role = params.role === 'guest' ? 'guest' : 'host';
  const exercise: ExerciseId = parseDuelExercise(params.exercise);
  const duration = params.duration ? Number(params.duration) : 20;
  const inviteKind =
    params.kind === 'train' || params.kind === 'compete' || params.kind === 'duel'
      ? params.kind
      : 'duel';

  const [duelId, setDuelId] = useState<string | null>(params.id ?? null);
  const [status, setStatus] = useState<'starting' | 'waiting' | 'unavailable' | 'cancelled'>(
    'starting',
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const launchedRef = useRef(false);
  // Mirror the live duel id into a ref so the unmount cleanup reads the latest
  // value without re-subscribing.
  const duelIdRef = useRef<string | null>(duelId);
  // eslint-disable-next-line react-hooks/refs
  duelIdRef.current = duelId;

  // Host cleanup: only cancel still-pending invites. An already-active duel must
  // not be abandoned here — the Cancel button launches into /session instead.
  useEffect(() => {
    return () => {
      if (role !== 'host' || launchedRef.current || !duelIdRef.current) return;
      const id = duelIdRef.current;
      void fetchDuel(id).then((duel) => {
        if (!duel || duel.status === 'active' || duel.status === 'finished') return;
        void cancelDuel(id);
      });
    };
  }, [role]);

  const enterSession = (id: string, duel: Duel) => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    successHaptic();
    router.replace({
      pathname: '/session',
      params: {
        exercise: duel.exercise,
        mode: duel.cooperative ? 'together' : 'versus',
        duel: id,
        duration: String(duel.duration),
      },
    });
  };

  const leaveWaiting = () => {
    void (async () => {
      const id = duelIdRef.current;
      if (!id) {
        router.back();
        return;
      }
      const duel = await fetchDuel(id);
      // Guest already joined — enter the set instead of orphaning the partner.
      if (
        duel &&
        duel.status === 'active' &&
        self &&
        seatOf(duel, self.uid)
      ) {
        enterSession(id, duel);
        return;
      }
      if (role === 'host' && !launchedRef.current) {
        await cancelDuel(id);
        // Guest may have joined between snapshot and cancel (cancel no-ops).
        const again = await fetchDuel(id);
        if (
          again &&
          again.status === 'active' &&
          self &&
          seatOf(again, self.uid)
        ) {
          enterSession(id, again);
          return;
        }
      }
      if (launchedRef.current) return;
      router.back();
    })();
  };

  // Header chevron + Android back must use the same leave path as Cancel.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveWaiting();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, self?.uid]);

  // Create (host) or join (guest) once auth identity is ready. Cold-start from
  // a push notification can mount before `self` exists — wait, don't dead-end
  // on "backend not set up".
  const bootstrappedUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!self) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('starting');
      return;
    }
    if (bootstrappedUidRef.current === self.uid) return;
    bootstrappedUidRef.current = self.uid;
    let cancelled = false;

    void (async () => {
      try {
        if (role === 'host') {
          // Train Together (and similar) mint the duel first, then open this
          // screen with a real id — reuse it. Don't create a second pending doc.
          const existingId = params.id && params.id !== 'new' ? params.id : null;
          if (existingId) {
            if (cancelled) return;
            setDuelId(existingId);
            setStatus('waiting');
            return;
          }

          const id = await createDuel({
            uid: self.uid,
            displayName: self.displayName,
            avatarUrl: self.avatarUrl,
            level: self.level,
            exercise,
            duration,
            targetUid: params.target ?? null,
            kind: inviteKind,
            cooperative: inviteKind === 'train',
          });
          if (!id) {
            if (!cancelled) setStatus('unavailable');
            return;
          }
          // Keep the id on the cleanup ref immediately so a mid-create unmount
          // still cancels the pending doc (and cancel here if already gone).
          duelIdRef.current = id;
          if (cancelled) {
            void cancelDuel(id);
            return;
          }
          // Rate-limit slot after a real challenge exists — cancel/fail must not burn it.
          if (params.target) commitClientRateLimit('duelInvite', self.uid);
          setDuelId(id);
          setStatus('waiting');
        } else {
          const id = params.id;
          if (!id || id === 'new') return setStatus('unavailable');

          // Re-open after accept / notification remount: already seated → resume.
          const existing = await fetchDuel(id);
          if (
            existing &&
            (existing.hostUid === self.uid || existing.guestUid === self.uid)
          ) {
            if (existing.status === 'active') {
              // Even if this screen is unmounting, enter — don't leave host alone.
              enterSession(id, existing);
              return;
            }
            if (cancelled) return;
            if (existing.status === 'finished') {
              setStatus('cancelled');
              setError('This match already finished.');
              return;
            }
            // Still pending and we're already the guest — just watch.
            setDuelId(id);
            setStatus('waiting');
            return;
          }

          const joined = await joinDuel(id, {
            uid: self.uid,
            displayName: self.displayName,
            avatarUrl: self.avatarUrl,
            level: self.level,
          });
          // Join already wrote active+guest — unmount must still enter session.
          if (joined) {
            const live = await fetchDuel(id);
            if (live?.status === 'active') {
              enterSession(id, live);
              return;
            }
            if (cancelled) return;
            setDuelId(id);
            setStatus('waiting');
            return;
          }
          if (cancelled) return;
          setStatus('unavailable');
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('cancelled');
          setError(e instanceof Error ? e.message : 'Could not start the duel.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-run when cold-start auth hydrates a uid (queue already does this).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.uid, role]);

  // Watch the duel doc; when both players are seated and it goes active, launch.
  useEffect(() => {
    if (!duelId || !self) return;

    const unsub = watchDuel(duelId, (duel: Duel | null) => {
      // Declined / host-cancelled deletes the doc — don't leave the host stuck
      // on "Waiting for opponent…" forever.
      if (!duel) {
        if (!launchedRef.current) {
          setStatus('cancelled');
          setError('This challenge was declined or cancelled.');
        }
        return;
      }
      const ready = duel.status === 'active' && !!duel.guestUid && !launchedRef.current;
      if (!ready) return;
      launchedRef.current = true;
      successHaptic();
      // The duel doc is authoritative for the exercise: a guest who joined from
      // the inbox never picked one, so trust the doc over our param default.
      router.replace({
        pathname: '/session',
        params: {
          exercise: duel.exercise,
          // The doc decides the mode: a couple's together set rides the same
          // two-seat transport but is scored cooperatively.
          mode: duel.cooperative ? 'together' : 'versus',
          duel: duelId,
          duration: String(duel.duration),
        },
      });
    });

    return unsub;
  }, [duelId, self, router]);

  const copyCode = async () => {
    if (!duelId) return;
    await Clipboard.setStringAsync(duelId);
    setCopied(true);
  };

  const botFallback = () =>
    router.replace({ pathname: '/session', params: { exercise, mode: 'versus' } });

  const opponentName = params.name ?? 'your rival';

  /* An open invite — no named target — is the only kind a stranger's camera
     can join, matching `isOpenInvite` in firestore.rules. */
  const scannable = !params.target;
  const opponentLevel = params.level ? Number(params.level) : null;

  /* ------------------------------------------------------------------ */

  if (status === 'unavailable') {
    return (
      <Screen>
        <ModalHeader title="Live duels" />
        <View style={styles.center}>
          <Avatar
            initial={(self?.displayName ?? 'Y').charAt(0).toUpperCase()}
            uri={self?.avatarUrl ?? undefined}
            size={80}
          />
          <Text style={[text.h2, { textAlign: 'center', marginTop: 12 }]}>
            Live duels go online once the backend is set up
          </Text>
          <Text style={[text.captionMd, styles.hint]}>
            Until then you can still settle it against a paced rival — same rules,
            same XP.
          </Text>
          <PressableScale onPress={botFallback} style={styles.primaryBtn} accessibilityRole="button">
            <Text style={styles.primaryLabel}>Duel a rival instead</Text>
          </PressableScale>
        </View>
      </Screen>
    );
  }

  if (status === 'cancelled') {
    return (
      <Screen>
        <ModalHeader title="Challenge closed" />
        <View style={styles.center}>
          <Text style={[text.h2, { textAlign: 'center', marginTop: 12 }]}>
            Challenge declined
          </Text>
          <Text style={[text.captionMd, styles.hint]}>
            {error ?? 'This challenge was declined or cancelled.'}
          </Text>
          <PressableScale onPress={botFallback} style={styles.primaryBtn} accessibilityRole="button">
            <Text style={styles.primaryLabel}>Duel a rival instead</Text>
          </PressableScale>
          <PressableScale
            onPress={() => router.back()}
            style={styles.cancel}
            accessibilityRole="button"
          >
            <Text style={styles.cancelLabel}>Back</Text>
          </PressableScale>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader
        title={role === 'guest' ? 'Joining duel' : 'Challenge sent'}
        onBack={leaveWaiting}
      />

      <View style={styles.stage}>
        <View style={styles.vsRow}>
          <View style={styles.vsSide}>
            <Avatar
              initial={(self?.displayName ?? 'Y').charAt(0).toUpperCase()}
              uri={self?.avatarUrl ?? undefined}
              size={64}
            />
            <Text style={styles.vsName}>You</Text>
          </View>

          <Text style={styles.vs}>VS</Text>

          <View style={styles.vsSide}>
            <View style={styles.pendingAvatar}>
              <ActivityIndicator color={palette.green600} />
            </View>
            <Text style={styles.vsName} numberOfLines={1}>
              {opponentName}
              {opponentLevel ? ` · Lv.${opponentLevel}` : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.status}>
          {error
            ? error
            : role === 'guest'
              ? 'Joining the arena…'
              : 'Waiting for your opponent to accept…'}
        </Text>
      </View>

      {role === 'host' && duelId ? (
        <>
          <Text style={[text.captionMd, styles.hint]}>
            {scannable
              ? 'Point their camera at this, or share the code.'
              : 'Share this duel code so they can jump in from anywhere.'}
          </Text>
          {/* Only an *open* invite gets a QR. A duel aimed at one athlete is
              already on its way to them, and a code anyone could scan would
              seat the wrong person — which the Firestore read rule refuses
              anyway, so showing one would only promise something broken. */}
          {scannable ? (
            <BrandedQR
              payload={duelInviteDeepLink(duelId)}
              size={188}
              accessibilityLabel="Duel invite QR code"
            />
          ) : null}
          <PressableScale onPress={copyCode} style={styles.codeBox} accessibilityRole="button">
            <Text style={styles.code} numberOfLines={1}>
              {duelId}
            </Text>
            <Text style={styles.copy}>{copied ? 'Copied ✓' : 'Copy'}</Text>
          </PressableScale>
        </>
      ) : null}

      <PressableScale
        onPress={leaveWaiting}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityLabel={role === 'guest' ? 'Cancel joining' : 'Cancel challenge'}
      >
        <View style={styles.cancelDot} />
        <Text style={styles.cancelLabel}>{role === 'guest' ? 'Cancel' : 'Cancel challenge'}</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  stage: {
    borderRadius: radius['5xl'],
    padding: 24,
    marginTop: 4,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vsSide: { alignItems: 'center', gap: 8, flex: 1 },
  vs: {
    ...font('extrabold', 18, { color: palette.slate400 }),
    marginHorizontal: 8,
  },
  vsName: { ...font('extrabold', 13, { color: palette.ink }), maxWidth: 110, textAlign: 'center' },
  pendingAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderColor: palette.green200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    ...font('semibold', 12, { color: palette.slate500 }),
    textAlign: 'center',
    marginTop: 20,
  },
  hint: { textAlign: 'center', marginTop: 16, paddingHorizontal: 8 },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: palette.green50,
    borderWidth: 1.5,
    borderColor: palette.green200,
  },
  code: { ...font('extrabold', 14, { color: palette.ink }), flex: 1, marginRight: 12 },
  copy: font('extrabold', 13, { color: palette.green600 }),
  primaryBtn: {
    marginTop: 24,
    backgroundColor: palette.green500,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: radius.xl,
  },
  primaryLabel: font('extrabold', 15, { color: palette.white }),
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: 24,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: palette.red100,
    ...shadow.card,
  },
  cancelDot: { width: 8, height: 8, borderRadius: radius.xs, backgroundColor: palette.red500 },
  cancelLabel: font('extrabold', 15, { color: palette.red500 }),
});
