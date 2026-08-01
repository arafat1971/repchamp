import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, PressableScale, PrimaryButton, Screen } from '@/components/ui';
import { successHaptic } from '@/lib/feedback';
import { type QueueTicket } from '@/domain/matchmaking';
import { OPPONENTS } from '@/domain/opponent';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { enqueue, leaveQueue, tryPair, watchTicket, clearQueueTicket } from '@/services/matchmakingService';
import { fetchDuel } from '@/services/duelService';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import { font } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';
import { parseDuelExercise } from '@/domain/duelExercises';
import { EXERCISES, type ExerciseId } from '@/vision/exercises';

/** How often we re-attempt pairing while sitting in the queue. */
const PAIR_RETRY_MS = 2500;

/** Seconds searching for a real athlete before auto-starting an AI rival. */
const WAIT_HINT_SEC = 8;

/** Offer a manual AI skip a few seconds before auto-fallback. */
const AI_SKIP_FROM_SEC = 5;

/**
 * Open-matchmaking queue — real athletes first, paced AI if nobody pairs.
 *
 * Prefers a live opponent in the open queue. If nobody pairs within a short
 * window, falls back to an AI rival so Quick Match always starts a playable set.
 */
export default function QueueScreen() {
  const router = useRouter();
  const self = useSelfPlayer();
  const seed = usePhantomSeed();
  const params = useLocalSearchParams<{ exercise?: string; duration?: string }>();
  const exercise: ExerciseId = parseDuelExercise(params.exercise);
  const duration = params.duration ? Number(params.duration) : 20;
  const exerciseLabel = EXERCISES[exercise].label;

  const [status, setStatus] = useState<'searching' | 'unavailable'>('searching');
  const launchedRef = useRef(false);
  /** Set once we've intentionally left the ticket (Cancel / unmount). */
  const leftQueueRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  const phase = useMemo(() => {
    if (elapsed >= WAIT_HINT_SEC) return 'ai' as const;
    if (elapsed >= AI_SKIP_FROM_SEC) return 'expand' as const;
    return 'live' as const;
  }, [elapsed]);

  const progress = Math.min(1, elapsed / WAIT_HINT_SEC);

  // Radar pulse — two rings expand and fade on a stagger.
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  useEffect(() => {
    const loop = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    ring1.value = loop;
    ring2.value = withDelay(1000, loop);
  }, [ring1, ring2]);
  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring1.value * 0.85 }],
    opacity: 0.45 * (1 - ring1.value),
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring2.value * 0.85 }],
    opacity: 0.45 * (1 - ring2.value),
  }));

  const launch = (duelId: string) => {
    if (launchedRef.current) return;
    // Prefer the duel doc's format — the host ticket sets exercise/duration and
    // the seeker's local params can disagree after an open-match claim.
    void (async () => {
      const duel = await fetchDuel(duelId);
      // Stale / hostile / mismatched ticket — clear and stay searching.
      const seated =
        !!self &&
        !!duel &&
        (duel.hostUid === self.uid || duel.guestUid === self.uid);
      const formatOk =
        !!duel &&
        (!duel.exercise || duel.exercise === exercise) &&
        (!duel.duration || duel.duration === duration);
      if (!duel || duel.status === 'finished' || !seated || !formatOk) {
        if (self) void clearQueueTicket(self.uid);
        return;
      }
      if (launchedRef.current) return;
      launchedRef.current = true;
      successHaptic();
      // Clear once we're in-session — a leftover matched ticket would relaunch
      // the finished duel on the next Quick Match.
      if (self) void clearQueueTicket(self.uid);
      router.replace({
        pathname: '/session',
        params: {
          exercise: duel.exercise ?? exercise,
          mode: 'versus',
          duel: duelId,
          duration: String(duel.duration ?? duration),
        },
      });
    })();
  };

  // Enter the queue once we have a signed-in athlete. Depend on uid so a late
  // auth hydrate doesn't leave the screen stuck on "unavailable" forever.
  useEffect(() => {
    if (!self) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unavailable');
      return;
    }
    setStatus('searching');
    setElapsed(0);

    let cancelled = false;
    let pairTimer: ReturnType<typeof setInterval> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;

    const clearHunt = () => {
      if (pairTimer) {
        clearInterval(pairTimer);
        pairTimer = undefined;
      }
    };

    const hunt = async () => {
      clearHunt();
      const existingDuel = await enqueue({ ...self, exercise, duration });
      if (cancelled || launchedRef.current) return;
      // Foreground resume must not wipe a ticket that was matched while we were
      // backgrounded — enqueue returns that duel id instead of resetting waiting.
      if (existingDuel) {
        launch(existingDuel);
        return;
      }

      const attempt = async () => {
        if (cancelled || launchedRef.current) return;
        const duelId = await tryPair({ ...self, exercise, duration });
        if (!cancelled && duelId) launch(duelId);
      };

      void attempt();
      pairTimer = setInterval(() => void attempt(), PAIR_RETRY_MS);
    };

    void hunt();
    tick = setInterval(() => setElapsed((s) => s + 1), 1000);

    const sub = AppState.addEventListener('change', (state) => {
      if (launchedRef.current || cancelled) return;
      if (state === 'background') {
        clearHunt();
        // Matched while leaving — launch immediately; don't drop the partner.
        void leaveQueue(self.uid).then((leave) => {
          if (!cancelled && !launchedRef.current && leave.outcome === 'matched') {
            launch(leave.duelId);
          }
        });
      } else if (state === 'active') {
        // Re-join after a background leave so we don't sit in a ghost search.
        void hunt();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
      clearHunt();
      if (tick) clearInterval(tick);
      // Cancel already left — don't double-delete. If we matched mid-leave, launch.
      if (!launchedRef.current && !leftQueueRef.current) {
        leftQueueRef.current = true;
        void leaveQueue(self.uid).then((leave) => {
          if (leave.outcome === 'matched' && !launchedRef.current) {
            launch(leave.duelId);
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.uid, exercise, duration]);

  useEffect(() => {
    if (!self) return;
    const unsub = watchTicket(self.uid, (ticket: QueueTicket | null) => {
      if (ticket?.status === 'matched' && ticket.duelId) launch(ticket.duelId);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.uid]);

  const launchAiRival = () => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    const pool = [
      ...OPPONENTS.filter((o) => o.online),
      ...(seed.isSeeding ? seed.phantomOnline.map((p) => ({ id: p.id })) : []),
    ];
    const pick = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : OPPONENTS[0]!;
    successHaptic();
    router.replace({
      pathname: '/session',
      params: {
        exercise,
        mode: 'versus',
        opponent: pick.id,
        duration: String(duration),
      },
    });
  };

  const botFallback = () => {
    if (launchedRef.current) return;
    // Offline / auth not ready — still allow a paced AI duel (CTA must work).
    if (!self) {
      launchAiRival();
      return;
    }
    void (async () => {
      // Atomic leave: if tryPair matched us mid-flight, launch that duel instead
      // of inventing an AI rival and orphaning the partner.
      leftQueueRef.current = true;
      const leave = await leaveQueue(self.uid);
      if (leave.outcome === 'matched') {
        launch(leave.duelId);
        return;
      }
      // Transient leave failure — stay searching; never AI-orphan a live partner.
      if (leave.outcome === 'error') {
        leftQueueRef.current = false;
        return;
      }
      if (launchedRef.current) return;
      launchAiRival();
    })();
  };

  /** Cancel search — if we matched mid-leave, launch instead of orphaning. */
  const cancelSearch = () => {
    if (launchedRef.current) return;
    if (!self) {
      router.back();
      return;
    }
    if (leftQueueRef.current) {
      router.back();
      return;
    }
    leftQueueRef.current = true;
    void (async () => {
      const leave = await leaveQueue(self.uid);
      if (leave.outcome === 'matched') {
        launch(leave.duelId);
        return;
      }
      // Transient failure — stay searching so cleanup can retry leave later.
      if (leave.outcome === 'error') {
        leftQueueRef.current = false;
        return;
      }
      if (launchedRef.current) return;
      router.back();
    })();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelSearch();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.uid]);

  useEffect(() => {
    if (status !== 'searching' || elapsed < WAIT_HINT_SEC) return;
    botFallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, status]);

  const statusTitle =
    phase === 'ai'
      ? 'Matching an AI rival…'
      : phase === 'expand'
        ? 'Still searching…'
        : 'Finding a live opponent';

  const statusSub =
    phase === 'ai'
      ? 'Same rules · same XP · starting now'
      : phase === 'expand'
        ? 'No live athlete yet — AI ready in a moment'
        : `Live queue · ${exerciseLabel} · ${duration}s`;

  /* ------------------------------------------------------------------ */

  if (status === 'unavailable') {
    return (
      <Screen>
        <ModalHeader title="Quick match" />
        <Animated.View entering={FadeIn.duration(280)} style={styles.center}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconMark}>VS</Text>
          </View>
          <Text style={styles.emptyTitle}>Matchmaking offline</Text>
          <Text style={styles.emptyBody}>
            Live pairing needs the cloud. You can still start a paced AI duel —
            same rules, same XP.
          </Text>
          <PrimaryButton label="Duel an AI rival" onPress={botFallback} style={{ marginTop: 8 }} />
          <PressableScale
            onPress={() => router.back()}
            style={styles.textCancel}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.textCancelLabel}>Go back</Text>
          </PressableScale>
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader title="Quick match" onBack={cancelSearch} />

      <Animated.View entering={FadeInDown.duration(320)} style={styles.stage}>
        {/* Live / AI mode chip */}
        <View style={styles.chipRow}>
          <View style={[styles.chip, phase === 'ai' ? styles.chipAi : styles.chipLive]}>
            <View style={[styles.chipDot, phase === 'ai' && styles.chipDotAi]} />
            <Text style={[styles.chipText, phase === 'ai' && styles.chipTextAi]}>
              {phase === 'ai' ? 'AI rival' : 'Live queue'}
            </Text>
          </View>
          <Text style={styles.chipMeta}>
            {exerciseLabel} · {duration}s
          </Text>
        </View>

        {/* VS radar */}
        <View style={styles.radar}>
          <Animated.View style={[styles.radarRing, ring1Style]} />
          <Animated.View style={[styles.radarRing, ring2Style]} />
          <View style={styles.vsRow}>
            <Avatar
              initial={(self?.displayName ?? 'Y').charAt(0).toUpperCase()}
              uri={self?.avatarUrl ?? undefined}
              size={52}
            />
            <View style={styles.vsBadge}>
              <Text style={styles.vsBadgeText}>VS</Text>
            </View>
            <View style={styles.opponentSlot}>
              <Text style={styles.opponentSlotMark}>?</Text>
            </View>
          </View>
        </View>

        <Text style={styles.searching}>{statusTitle}</Text>
        <Text style={styles.timer}>{statusSub}</Text>

        {/* Progress toward AI fallback — honest, not a fake “match %”. */}
        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressLabel}>
              {phase === 'ai' ? 'Starting AI duel' : 'Searching athletes'}
            </Text>
            <Text style={styles.progressTime}>{elapsed}s</Text>
          </View>
        </View>

        <View style={styles.selfRow}>
          <View style={styles.readyPill}>
            <View style={styles.readyDot} />
            <Text style={styles.readyText}>You · ready</Text>
          </View>
          <Text style={styles.selfName} numberOfLines={1}>
            {self?.displayName ?? 'You'} · Lv.{self?.level ?? 1}
          </Text>
        </View>
      </Animated.View>

      <View style={styles.footer}>
        {phase === 'expand' ? (
          <Animated.View entering={FadeInDown.duration(240)}>
            <PrimaryButton label="Skip to AI rival" onPress={botFallback} />
            <Text style={styles.footerHint}>Or wait a few more seconds for a live athlete</Text>
          </Animated.View>
        ) : phase === 'ai' ? (
          <Text style={styles.footerHint}>Locking in your opponent…</Text>
        ) : (
          <Text style={styles.footerHint}>
            Real athletes first. If nobody’s free, we match you with AI.
          </Text>
        )}

        <PressableScale
          onPress={cancelSearch}
          style={styles.textCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel search"
        >
          <Text style={styles.textCancelLabel}>Cancel</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconMark: font('extrabold', 18, { color: palette.green700 }),
  emptyTitle: { ...font('extrabold', 22, { color: palette.ink }), textAlign: 'center' },
  emptyBody: {
    ...font('semibold', 14, { color: palette.grey600 }),
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  stage: {
    borderRadius: radius['4xl'],
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginTop: 4,
    alignItems: 'center',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  chipRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green200,
  },
  chipLive: {},
  chipAi: {
    backgroundColor: '#f5f3ff',
    borderColor: palette.purple200,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.green500,
  },
  chipDotAi: { backgroundColor: palette.purple500 },
  chipText: font('extrabold', 11, { color: palette.green700 }),
  chipTextAi: { color: palette.purple600 },
  chipMeta: font('bold', 11, { color: palette.grey600 }),
  radar: {
    width: 200,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  radarRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: palette.green300,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
  },
  vsBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsBadgeText: font('extrabold', 11, { color: palette.white }),
  opponentSlot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.borderStrong,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opponentSlotMark: font('extrabold', 18, { color: palette.grey450 }),
  searching: {
    ...font('extrabold', 18, { color: palette.ink }),
    marginTop: 8,
    textAlign: 'center',
  },
  timer: {
    ...font('semibold', 13, { color: palette.grey600 }),
    marginTop: 4,
    textAlign: 'center',
  },
  progressBlock: { alignSelf: 'stretch', marginTop: 16, gap: 8 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: palette.green500,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: font('bold', 11, { color: palette.grey600 }),
  progressTime: font('extrabold', 11, { color: palette.ink }),
  selfRow: {
    alignSelf: 'stretch',
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.xl,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green100,
  },
  readyPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readyDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green500 },
  readyText: font('bold', 11, { color: palette.green700 }),
  selfName: { ...font('extrabold', 12, { color: palette.ink }), flexShrink: 1 },
  footer: { marginTop: 20, gap: 4 },
  footerHint: {
    ...font('semibold', 12.5, { color: palette.grey600 }),
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  textCancel: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  textCancelLabel: font('bold', 14, { color: palette.grey600 }),
});
