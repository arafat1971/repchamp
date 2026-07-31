import { Redirect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { BackHandler, Share, StyleSheet, Text, View, ScrollView } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/session/Confetti';
import { ResultShareCard } from '@/components/session/ResultShareCard';
import { CountUp } from '@/components/motion';
import { PressableScale } from '@/components/ui';
import { getOpponent } from '@/domain/opponent';
import { canUse } from '@/domain/pro';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { playLoseSound, playWinSound } from '@/lib/feedback';
import {
  armLiveResultSettle,
  isLiveSettleArmed,
  wasLiveSettleBanked,
} from '@/services/liveResultSettle';
import { useProfileStore, selectStreak } from '@/state/profileStore';
import { useIsPro } from '@/state/proStore';
import { useAuthStore } from '@/state/authStore';
import { useSessionStore } from '@/state/sessionStore';
import { showDialog } from '@/state/useDialog';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSessionStore();
  const recordSession = useProfileStore((s) => s.recordSession);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const streak = useProfileStore(selectStreak);
  const isPro = useIsPro();
  const authUid = useAuthStore((s) => s.user?.uid ?? null);
  const authReady = useAuthStore((s) => s.ready);

  // The off-screen card captured to a PNG when the athlete shares.
  const shareCardRef = useRef<View>(null);

  // Persist exactly once
  const persisted = useRef(false);

  // Snapshot outcome fields once — do not re-run settle when late store writes
  // (e.g. share snapshot) churn the whole session object.
  const settleKey = `${session.config?.duelId ?? ''}:${session.config?.mode ?? ''}:${session.reps}:${authUid ?? ''}`;

  // Live versus: prefer cloud winner; settle is detached so Done/Rematch cannot
  // drop XP while the opponent seat is still open.
  useEffect(() => {
    if (persisted.current || !session.config) return;

    const config = session.config;
    const localWon = session.won;
    const localDrew = session.drew;
    const localXp = session.xpGained;
    const localOpponentReps = session.opponentReps;
    const localReps = session.reps;
    const localForfeited = session.forfeited;
    const formScore = session.formReport?.score ?? 0;

    const persist = (input: {
      won: boolean;
      drew: boolean;
      xp: number;
      opponentReps: number;
      opponentId?: string | null;
      /** When set, refuse to bank/push if auth switched accounts mid-settle. */
      expectUid?: string | null;
    }): boolean => {
      if (persisted.current) return true;
      if (
        input.expectUid &&
        useAuthStore.getState().user?.uid !== input.expectUid
      ) {
        // Account changed — keep settle outbox armed for the original uid.
        return false;
      }
      persisted.current = true;

      recordSession({
        exercise: config.exercise,
        mode: config.mode,
        reps: localReps,
        opponentReps: config.mode === 'versus' ? input.opponentReps : null,
        opponentId: input.opponentId ?? config.opponentId,
        target: config.target,
        won: input.won,
        drew: input.drew,
        xp: input.xp,
        formScore,
        durationSec: config.duration,
      });

      if (input.won) playWinSound();
      else if (!input.drew) playLoseSound();

      void useAuthStore.getState().pushProfile();
      return true;
    };

    const duelId = config.duelId;
    const liveMode = config.mode === 'versus' || config.mode === 'together';

    // Solo / bot / practice — bank immediately.
    if (!duelId || !liveMode) {
      persist({
        won: localWon,
        drew: localDrew,
        xp: localXp,
        opponentReps: localOpponentReps,
      });
      return;
    }

    // Live duel with no uid yet — wait for auth (do NOT treat as solo).
    if (!authReady || !authUid) return;

    if (wasLiveSettleBanked(duelId, authUid)) {
      persisted.current = true;
      return;
    }

    armLiveResultSettle({
      duelId,
      uid: authUid,
      mode: config.mode === 'together' ? 'together' : 'versus',
      outcome: {
        reps: localReps,
        formScore,
        forfeited: localForfeited,
      },
      local: {
        won: localWon,
        drew: localDrew,
        xp: localXp,
        opponentReps: localOpponentReps,
      },
      record: {
        exercise: config.exercise,
        sessionMode: config.mode,
        reps: localReps,
        target: config.target,
        opponentId: config.opponentId,
        formScore,
        durationSec: config.duration,
      },
      onBank: (bank) => {
        if (useAuthStore.getState().user?.uid !== authUid) return false;
        // Only paint HUD if this result is still on screen — never clobber a
        // newer session the athlete started after tapping Done.
        const live = useSessionStore.getState();
        if (live.config?.duelId === duelId) {
          useSessionStore.setState({
            won: bank.won,
            drew: bank.drew,
            xpGained: bank.xp,
            opponentReps: bank.opponentReps,
          });
          if (bank.opponentName) {
            useSessionStore.getState().setOpponentName(bank.opponentName);
          }
          if (bank.opponentId) {
            useSessionStore.getState().setOpponentId(bank.opponentId);
          }
        }
        return persist({
          won: bank.won,
          drew: bank.drew,
          xp: bank.xp,
          opponentReps: bank.opponentReps,
          opponentId: bank.opponentId,
          expectUid: authUid,
        });
      },
    });
    // Detached settle must outlive this screen — no teardown on unmount.
    // settleKey captures duel/mode/reps/uid; avoid depending on the whole session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey, recordSession, authReady, authUid]);

  const leaveResult = (navigate: () => void) => {
    const cfg = useSessionStore.getState().config;
    const duelId = cfg?.duelId;
    const live =
      typeof duelId === 'string' &&
      !!duelId &&
      !!cfg &&
      (cfg.mode === 'versus' || cfg.mode === 'together');
    if (live && cfg && duelId) {
      const uid = useAuthStore.getState().user?.uid;
      // Cold-start auth gap — don't wipe the set before settle can arm.
      if (!uid) {
        showDialog({
          title: 'Still settling',
          message: 'Hang tight a moment while we connect your account.',
          tone: 'info',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
        return;
      }
      if (!wasLiveSettleBanked(duelId, uid) && !isLiveSettleArmed(duelId, uid)) {
        // Effect hasn't armed yet (race) — arm from the leave path.
        const formScore = useSessionStore.getState().formReport?.score ?? 0;
        const snap = useSessionStore.getState();
        armLiveResultSettle({
          duelId,
          uid,
          mode: cfg.mode === 'together' ? 'together' : 'versus',
          outcome: {
            reps: snap.reps,
            formScore,
            forfeited: snap.forfeited,
          },
          local: {
            won: snap.won,
            drew: snap.drew,
            xp: snap.xpGained,
            opponentReps: snap.opponentReps,
          },
          record: {
            exercise: cfg.exercise,
            sessionMode: cfg.mode,
            reps: snap.reps,
            target: cfg.target,
            opponentId: cfg.opponentId,
            formScore,
            durationSec: cfg.duration,
          },
          onBank: (bank) => {
            if (useAuthStore.getState().user?.uid !== uid) return false;
            if (persisted.current) return true;
            persisted.current = true;
            useProfileStore.getState().recordSession({
              exercise: cfg.exercise,
              mode: cfg.mode,
              reps: snap.reps,
              opponentReps: cfg.mode === 'versus' ? bank.opponentReps : null,
              opponentId: bank.opponentId ?? cfg.opponentId,
              target: cfg.target,
              won: bank.won,
              drew: bank.drew,
              xp: bank.xp,
              formScore,
              durationSec: cfg.duration,
            });
            void useAuthStore.getState().pushProfile();
            return true;
          },
        });
      }
    }
    // Live settle is detached — XP still banks after navigation. Reset UI state.
    useSessionStore.getState().reset();
    navigate();
  };

  // Hardware back must arm settle the same way Done/Rematch do.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveResult(() => router.replace('/(tabs)'));
      return true;
    });
    return () => sub.remove();
    // leaveResult reads fresh state via .getState() internally, so it's safe
    // to omit here — it never closes over stale values.
  }, [router]);

  if (!session.config) {
    return <Redirect href="/(tabs)" />;
  }

  const { mode, target, opponentId, exercise, opponentName } = session.config;
  const opponent = getOpponent(opponentId);
  const definition = getExercise(exercise);
  const opponentLabel = (opponentName || opponent?.name || 'Opponent').toUpperCase();
  const userName = displayName ? displayName.split(' ')[0] : 'Athlete';
  const formScore = session.formReport?.score ?? 0;
  const fullDepthReps = session.formReport?.fullDepthReps ?? session.reps;
  /** Mean peak depth across counted reps (0–100). Honest — not a faked floor. */
  const peakDepth =
    session.repRecords.length > 0
      ? Math.round(
          (session.repRecords.reduce((sum, r) => sum + r.peakDepth, 0) /
            session.repRecords.length) *
            100,
        )
      : 0;
  const aiVerified = session.reps > 0 && session.formReport != null;

  const title =
    mode === 'practice'
      ? `Unstoppable, ${userName}`
      : mode === 'solo'
        ? session.won
          ? `Target cleared, ${userName}`
          : `Great hustle, ${userName}`
        : session.drew
          ? `Dead heat, ${userName}`
          : session.won
            ? `Victory, ${userName}`
            : `Battle finished, ${userName}`;

  const subtitle =
    mode === 'practice'
      ? 'Every rep counts. You built real momentum today!'
      : mode === 'solo'
        ? session.won
          ? session.formReport
            ? `${fullDepthReps} of ${session.reps} reps at full depth. Your streak is on fire!`
            : 'Target cleared! Your streak is on fire!'
          : 'Solid effort! Push a little harder on the next set.'
        : session.drew
          ? `Tied with ${opponentLabel} — rematch to settle it.`
          : session.won
            ? `You defeated ${opponentLabel}!`
            : `Close match against ${opponentLabel}! Rematch now?`;

  const rematch = () => {
    // Live human duel — challenge setup with their uid when we have it.
    const duelId = session.config?.duelId;
    const durationSec = session.config?.duration;
    const rematchParams = {
      role: 'host' as const,
      exercise,
      ...(durationSec ? { duration: String(durationSec) } : {}),
      ...(opponentName ? { name: opponentName } : {}),
      ...(opponentId ? { target: opponentId } : {}),
    };
    if (mode === 'versus' && (duelId || (opponentName && !opponentId))) {
      leaveResult(() =>
        router.replace({
          pathname: '/duel/new',
          params: rematchParams,
        }),
      );
      return;
    }
    if (mode === 'together') {
      leaveResult(() =>
        router.replace({
          pathname: '/duel/new',
          params: { ...rematchParams, kind: 'train' },
        }),
      );
      return;
    }
    leaveResult(() =>
      router.replace({
        pathname: '/session',
        params: {
          exercise,
          mode,
          ...(durationSec ? { duration: String(durationSec) } : {}),
          ...(target ? { target: String(target) } : {}),
          ...(opponentId ? { opponent: opponentId } : {}),
        },
      }),
    );
  };

  const done = () => {
    leaveResult(() => router.replace('/(tabs)'));
  };

  const shareText = () =>
    void Share.share({
      message: `💪 I just completed ${session.reps} ${definition.label} on RepChamp — think you can beat me? repchamp.web.app`,
    });

  const shareResult = async () => {
    track('share_opened', { kind: 'result-card' });
    try {
      const canShareFiles = await Sharing.isAvailableAsync();
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
      if (canShareFiles) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your result' });
      } else {
        shareText();
      }
    } catch (error) {
      captureError(error);
      shareText();
    }
  };

  return (
    <View style={styles.root}>
      <Confetti />

      {/* Off-screen shareable card — captured to PNG on share. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ResultShareCard
          ref={shareCardRef}
          name={displayName}
          avatarUri={avatarUri}
          snapshotUri={session.capturedSnapshotUri}
          reps={session.reps}
          exerciseLabel={definition.label}
          exerciseId={exercise}
          streak={streak}
          formScore={formScore}
          fullDepthReps={fullDepthReps}
          peakDepthPct={peakDepth}
          trackingStatus={aiVerified ? 'AI POSE TRACKED' : 'SESSION'}
          aiVerified={aiVerified}
          drew={session.drew}
          durationSec={session.config.duration}
          mode={mode}
          opponentName={opponentLabel}
          opponentReps={session.opponentReps}
          won={session.won}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 44) + 8, paddingBottom: insets.bottom + 208 },
        ]}
      >
        {/* Trophy — reserved for genuine wins. */}
        {session.won ? (
          <Animated.View entering={ZoomIn.duration(500)} style={styles.trophyWrapper}>
            <Image
              source={require('../../assets/trophy-gold.png')}
              style={styles.trophyHeroImg}
              contentFit="contain"
            />
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(450).delay(100)} style={styles.titleSection}>
          <Text style={styles.screenTitleText}>{title}</Text>
          <Text style={styles.screenSubtitleText}>{subtitle}</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(500).delay(180)} style={styles.rewardRow}>
          <View style={styles.rewardChip}>
            <Text style={styles.rewardChipText}>+</Text>
            <CountUp
              value={session.xpGained}
              duration={900}
              delay={220}
              style={styles.rewardChipText}
            />
            <Text style={styles.rewardChipText}> XP</Text>
          </View>
          {streak > 0 ? (
            <View style={styles.rewardChipFire}>
              <Text style={styles.rewardChipTextDark}>🔥 {streak} day streak</Text>
            </View>
          ) : null}
          {session.drew ? (
            <View style={styles.rewardChipGold}>
              <Text style={styles.rewardChipTextDark}>🤝 Draw</Text>
            </View>
          ) : null}
          {session.won && (mode === 'versus' || mode === 'solo') ? (
            <View style={styles.rewardChipGold}>
              <Text style={styles.rewardChipTextDark}>🥇 Win secured</Text>
            </View>
          ) : null}
        </Animated.View>

        {/* The Beautiful 3D Viral Share Card rendered on screen */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.shareCardOnScreen}>
          <ResultShareCard
            name={displayName}
            avatarUri={avatarUri}
            snapshotUri={session.capturedSnapshotUri}
            reps={session.reps}
            exerciseLabel={definition.label}
            exerciseId={exercise}
            streak={streak}
            formScore={formScore}
            fullDepthReps={fullDepthReps}
            peakDepthPct={peakDepth}
            trackingStatus={aiVerified ? 'AI POSE TRACKED' : 'SESSION'}
            aiVerified={aiVerified}
            drew={session.drew}
            durationSec={session.config.duration}
            mode={mode}
            opponentName={opponentLabel}
            opponentReps={session.opponentReps}
            won={session.won}
          />
        </Animated.View>
      </ScrollView>

      {/* Pinned bottom action bar */}
      <Animated.View entering={FadeInUp.duration(500).delay(500)} style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.secondaryRow}>
          <PressableScale
            onPress={() => {
              if (!canUse(isPro, 'advanced-stats')) {
                router.push({ pathname: '/modal/paywall', params: { source: 'form-report' } });
                return;
              }
              router.push('/session/form-report');
            }}
            accessibilityRole="button"
            accessibilityLabel="View form report"
            style={styles.secondaryButtonLight}
          >
            <Text style={styles.secondaryLabelLight}>
              {canUse(isPro, 'advanced-stats') ? 'Form Report' : 'Form Report · Pro'}
            </Text>
          </PressableScale>

          <PressableScale
            onPress={shareResult}
            accessibilityRole="button"
            accessibilityLabel="Share workout achievement"
            style={styles.secondaryButtonLight}
          >
            <Text style={styles.secondaryLabelLight}>Share Card</Text>
          </PressableScale>
        </View>

        <PressableScale
          onPress={rematch}
          accessibilityRole="button"
          accessibilityLabel="Play Again"
          style={styles.playAgainButton}
        >
          <Text style={font('extrabold', 17, { color: palette.white, letterSpacing: 0.3 })}>Play Again</Text>
        </PressableScale>

        <PressableScale
          onPress={done}
          accessibilityRole="button"
          accessibilityLabel="Back to Train"
          style={styles.doneLinkButton}
        >
          <Text style={font('bold', 15, { color: palette.slate500 })}>Back to Train</Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
  scrollContent: { paddingHorizontal: 20, alignItems: 'center' },
  shareCardOnScreen: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  trophyWrapper: { marginBottom: 12, alignItems: 'center' },
  trophyHeroImg: { width: 88, height: 88 },

  titleSection: { alignItems: 'center', alignSelf: 'stretch', width: '100%', marginBottom: 16 },
  screenTitleText: {
    ...font('bold', 30, { color: palette.ink }),
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  screenSubtitleText: {
    ...font('regular', 15, { color: palette.slate500 }),
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  rewardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  rewardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.green500,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rewardChipFire: {
    backgroundColor: palette.amber50,
    borderWidth: 1,
    borderColor: '#fcd34d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rewardChipGold: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rewardChipText: font('bold', 13, { color: palette.white }),
  rewardChipTextDark: font('semibold', 13, { color: palette.ink }),

  /* Pinned bottom action bar (Apple-style toolbar) */
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    backgroundColor: palette.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryButtonLight: {
    flex: 1,
    height: 50,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  secondaryLabelLight: font('extrabold', 14, { color: palette.ink }),

  playAgainButton: {
    width: '100%',
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.brand,
  },
  doneLinkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
});
