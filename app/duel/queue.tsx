import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, PressableScale, Screen } from '@/components/ui';
import { successHaptic } from '@/lib/feedback';
import { type QueueTicket } from '@/domain/matchmaking';
import { enqueue, leaveQueue, tryPair, watchTicket } from '@/services/matchmakingService';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import { font, text } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';
import type { ExerciseId } from '@/vision/exercises';

/** How often we re-attempt pairing while sitting in the queue. */
const PAIR_RETRY_MS = 2500;

/** After this many seconds with no match, offer the instant paced-rival duel. */
const WAIT_HINT_SEC = 10;

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

  // Radar pulse — two rings expand and fade on a stagger to signal live searching.
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  useEffect(() => {
    const loop = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    ring1.value = loop;
    ring2.value = withDelay(900, loop);
  }, [ring1, ring2]);
  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring1.value * 0.9 }],
    opacity: 0.5 * (1 - ring1.value),
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring2.value * 0.9 }],
    opacity: 0.5 * (1 - ring2.value),
  }));

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const botFallback = () => {
    if (self && !launchedRef.current) void leaveQueue(self.uid);
    router.replace({ pathname: '/session', params: { exercise, mode: 'versus' } });
  };

  /* ------------------------------------------------------------------ */

  if (status === 'unavailable') {
    return (
      <Screen>
        <ModalHeader title="Quick match" />
        <View style={styles.center}>
          <Avatar
            initial={(self?.displayName ?? 'Y').charAt(0).toUpperCase()}
            uri={self?.avatarUrl ?? undefined}
            size={80}
          />
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

      <View style={styles.stage}>
        <View style={styles.radar}>
          <Animated.View style={[styles.radarRing, ring1Style]} />
          <Animated.View style={[styles.radarRing, ring2Style]} />
          <View style={styles.pulse}>
            <ActivityIndicator color={palette.green600} size="large" />
          </View>
        </View>
        <Text style={styles.searching}>Finding you an opponent…</Text>
        <Text style={styles.timer}>{elapsed}s elapsed</Text>

        <View style={styles.selfRow}>
          <Avatar
            initial={(self?.displayName ?? 'Y').charAt(0).toUpperCase()}
            uri={self?.avatarUrl ?? undefined}
            size={44}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.selfName} numberOfLines={1}>
              {self?.displayName ?? 'You'}
            </Text>
            <Text style={styles.selfMeta}>Level {self?.level ?? 1} · ready</Text>
          </View>
          <View style={styles.readyDot} />
        </View>
      </View>

      <Text style={[text.captionMd, styles.hint]}>
        {elapsed < WAIT_HINT_SEC
          ? `We’ll drop you into a ${exercise === 'squat' ? 'squat' : 'push-up'} duel (${duration}s) the moment someone else is searching.`
          : "No one's searching right now — jump into a paced rival duel instead and settle it for the same XP."}
      </Text>

      {/* Never a dead end: once the wait runs long, offer an instant paced-rival
          duel so Quick Match always lands in a real, playable set. */}
      {elapsed >= WAIT_HINT_SEC ? (
        <PressableScale
          onPress={botFallback}
          style={styles.primaryBtn}
          accessibilityRole="button"
          accessibilityLabel="Duel a paced rival now"
        >
          <Text style={styles.primaryLabel}>Duel a rival now</Text>
        </PressableScale>
      ) : null}

      <PressableScale
        onPress={() => router.back()}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
      >
        <View style={styles.cancelDot} />
        <Text style={styles.cancelLabel}>Cancel search</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  stage: {
    borderRadius: radius['5xl'],
    paddingVertical: 36,
    paddingHorizontal: 28,
    marginTop: 6,
    alignItems: 'center',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  radar: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: palette.green400,
  },
  pulse: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderColor: palette.green200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searching: { ...font('extrabold', 17, { color: palette.ink }), marginTop: 24 },
  timer: { ...font('semibold', 13, { color: palette.slate500 }), marginTop: 6 },
  selfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 26,
    alignSelf: 'stretch',
    backgroundColor: palette.green50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
  },
  selfName: font('extrabold', 14, { color: palette.ink }),
  selfMeta: { ...font('semibold', 11.5, { color: palette.slate500 }), marginTop: 1 },
  readyDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: palette.green500 },
  hint: { textAlign: 'center', marginTop: 18, paddingHorizontal: 10 },
  primaryBtn: {
    marginTop: 26,
    backgroundColor: palette.green500,
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: radius.xl,
  },
  primaryLabel: font('extrabold', 15, { color: palette.white }),
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    alignSelf: 'stretch',
    marginTop: 24,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: palette.red100,
    ...shadow.card,
  },
  cancelDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: palette.red500 },
  cancelLabel: font('extrabold', 15, { color: palette.red500 }),
});
