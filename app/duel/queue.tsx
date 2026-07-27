import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, PressableScale, Screen } from '@/components/ui';
import { successHaptic } from '@/lib/feedback';
import { type QueueTicket } from '@/domain/matchmaking';
import { enqueue, leaveQueue, tryPair, watchTicket } from '@/services/matchmakingService';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';
import type { ExerciseId } from '@/vision/exercises';

/** How often we re-attempt pairing while sitting in the queue. */
const PAIR_RETRY_MS = 2500;

/**
 * Open-matchmaking queue screen — "find me any opponent".
 *
 * On mount we `enqueue` this athlete, then poll `tryPair` on an interval: each
 * attempt either claims a waiting stranger (minting a live duel) or leaves us
 * queued for a later entrant to claim us. In parallel we `watchTicket` our own
 * ticket, so whether *we* paired or someone paired *us*, the ticket flips to
 * `matched` with a shared `duelId` and both clients route into the same live
 * session (`/session?duel=<id>`) — reusing the whole live-duel path unchanged.
 *
 * Leaving the screen (cancel or unmount) removes our ticket, so an abandoned
 * search never leaves a stale `waiting` row for someone to match into a ghost.
 *
 * Live matchmaking requires Firebase. Unconfigured, `enqueue`/`tryPair` no-op and
 * `watchTicket` yields null, so we surface the same "backend not set up" state as
 * the waiting room and offer the bot duel — never a dead end.
 */
export default function QueueScreen() {
  const router = useRouter();
  const self = useSelfPlayer();
  const params = useLocalSearchParams<{ exercise?: string; duration?: string }>();
  const exercise: ExerciseId = params.exercise === 'squat' ? 'squat' : 'push';
  const duration = params.duration ? Number(params.duration) : 20;

  const [status, setStatus] = useState<'searching' | 'unavailable'>('searching');
  const launchedRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  /** Route both athletes into the shared live duel, exactly once. The session
   *  reads the authoritative exercise from the duel doc via its `duel` param, so
   *  passing our chosen exercise here is just the initial HUD hint. */
  const launch = (duelId: string) => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    successHaptic();
    router.replace({ pathname: '/session', params: { exercise, mode: 'versus', duel: duelId } });
  };

  // Enter the queue and keep trying to pair until matched.
  useEffect(() => {
    if (!self) {
      setStatus('unavailable');
      return;
    }
    let cancelled = false;
    let pairTimer: ReturnType<typeof setInterval> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      await enqueue({ ...self, exercise, duration });
      if (cancelled) return;

      const attempt = async () => {
        if (cancelled || launchedRef.current) return;
        const duelId = await tryPair({ ...self, exercise, duration });
        if (!cancelled && duelId) launch(duelId);
      };

      // Try immediately, then on an interval until paired.
      void attempt();
      pairTimer = setInterval(() => void attempt(), PAIR_RETRY_MS);
      tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    })();

    return () => {
      cancelled = true;
      if (pairTimer) clearInterval(pairTimer);
      if (tick) clearInterval(tick);
    };
    // self identity is fixed for this screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch our own ticket — if someone else paired us first, follow their duel.
  useEffect(() => {
    if (!self) return;
    const unsub = watchTicket(self.uid, (ticket: QueueTicket | null) => {
      if (ticket?.status === 'matched' && ticket.duelId) launch(ticket.duelId);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.uid]);

  // Leave the queue when the screen goes away without a match.
  useEffect(() => {
    return () => {
      if (self && !launchedRef.current) void leaveQueue(self.uid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.uid]);

  // Also leave the queue if the app is backgrounded — the user may not return,
  // and a stale `waiting` ticket would pair an unsuspecting stranger into a ghost.
  useEffect(() => {
    if (!self) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && !launchedRef.current) void leaveQueue(self.uid);
    });
    return () => sub.remove();
  }, [self?.uid]);

  const botFallback = () =>
    router.replace({ pathname: '/session', params: { exercise: 'push', mode: 'versus' } });

  /* ------------------------------------------------------------------ */

  if (status === 'unavailable') {
    return (
      <Screen>
        <ModalHeader title="Quick match" />
        <View style={styles.center}>
          <Text style={styles.bigEmoji}>🛰️</Text>
          <Text style={[text.h2, { textAlign: 'center', marginTop: 12 }]}>
            Open matchmaking goes online once the backend is set up
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

  return (
    <Screen>
      <ModalHeader title="Quick match" />

      <LinearGradient colors={gradients.ink} style={styles.stage}>
        <View style={styles.pulse}>
          <ActivityIndicator color={palette.white} size="large" />
        </View>
        <Text style={styles.searching}>Finding you an opponent…</Text>
        <Text style={styles.timer}>{elapsed}s</Text>

        <View style={styles.selfRow}>
          <Avatar
            initial={(self?.displayName ?? 'Y').charAt(0).toUpperCase()}
            uri={self?.avatarUrl ?? undefined}
            size={44}
          />
          <Text style={styles.selfName}>
            {self?.displayName ?? 'You'} · Lv.{self?.level ?? 1}
          </Text>
        </View>
      </LinearGradient>

      <Text style={[text.captionMd, styles.hint]}>
        We’ll drop you into a {exercise === 'squat' ? 'squat' : 'push-up'} duel ({duration}s) the moment someone else is searching.
      </Text>

      <PressableScale onPress={() => router.back()} style={styles.cancel} accessibilityRole="button">
        <Text style={styles.cancelLabel}>Cancel search</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  bigEmoji: { fontSize: 56 },
  stage: { borderRadius: radius['5xl'], padding: 28, marginTop: 6, alignItems: 'center' },
  pulse: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searching: { ...font('extrabold', 16, { color: palette.white }), marginTop: 20 },
  timer: { ...font('semibold', 13, { color: 'rgba(255,255,255,0.7)' }), marginTop: 6 },
  selfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
  },
  selfName: font('extrabold', 13, { color: palette.white }),
  hint: { textAlign: 'center', marginTop: 18, paddingHorizontal: 10 },
  primaryBtn: {
    marginTop: 26,
    backgroundColor: palette.green500,
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: radius.xl,
  },
  primaryLabel: font('extrabold', 15, { color: palette.white }),
  cancel: { alignSelf: 'center', marginTop: 22, padding: 10 },
  cancelLabel: font('extrabold', 14, { color: palette.grey600 }),
});
