import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, PressableScale, Screen } from '@/components/ui';
import { type Duel } from '@/domain/duel';
import { createDuel, joinDuel, watchDuel, cancelDuel } from '@/services/duelService';
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
  const exercise: ExerciseId = params.exercise === 'squat' ? 'squat' : 'push';
  const duration = params.duration ? Number(params.duration) : 20;
  const inviteKind =
    params.kind === 'train' || params.kind === 'compete' || params.kind === 'duel'
      ? params.kind
      : 'duel';

  const [duelId, setDuelId] = useState<string | null>(params.id ?? null);
  const [status, setStatus] = useState<'starting' | 'waiting' | 'unavailable'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const launchedRef = useRef(false);
  // Mirror the live duel id into a ref so the unmount cleanup reads the latest
  // value without re-subscribing.
  const duelIdRef = useRef<string | null>(duelId);
  // eslint-disable-next-line react-hooks/refs
  duelIdRef.current = duelId;

  // Host cleanup: if we leave the waiting room before the duel launched, delete
  // the pending doc so abandoned challenges don't pile up. A guest never owns
  // the doc, and a launched duel is a normal hand-off, so both are left alone.
  useEffect(() => {
    return () => {
      if (role === 'host' && !launchedRef.current && duelIdRef.current) {
        void cancelDuel(duelIdRef.current);
      }
    };
  }, [role]);

  // Create (host) or join (guest) the duel exactly once on mount.
  useEffect(() => {
    if (!self) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unavailable');
      return;
    }
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
          if (cancelled) return;
          if (!id) return setStatus('unavailable');
          setDuelId(id);
          setStatus('waiting');
        } else {
          const id = params.id;
          if (!id || id === 'new') return setStatus('unavailable');
          const joined = await joinDuel(id, {
            uid: self.uid,
            displayName: self.displayName,
            avatarUrl: self.avatarUrl,
            level: self.level,
          });
          if (cancelled) return;
          if (!joined) return setStatus('unavailable');
          setDuelId(id);
          setStatus('waiting');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not start the duel.');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Self identity and role are fixed for this screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch the duel doc; when both players are seated and it goes active, launch.
  useEffect(() => {
    if (!duelId || !self) return;

    const unsub = watchDuel(duelId, (duel: Duel | null) => {
      if (!duel) return;
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
    router.replace({ pathname: '/session', params: { exercise: 'push', mode: 'versus' } });

  const opponentName = params.name ?? 'your rival';
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

  return (
    <Screen>
      <ModalHeader title={role === 'guest' ? 'Joining duel' : 'Challenge sent'} />

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
            Share this duel code so they can jump in from anywhere.
          </Text>
          <PressableScale onPress={copyCode} style={styles.codeBox} accessibilityRole="button">
            <Text style={styles.code} numberOfLines={1}>
              {duelId}
            </Text>
            <Text style={styles.copy}>{copied ? 'Copied ✓' : 'Copy'}</Text>
          </PressableScale>
        </>
      ) : null}

      <PressableScale
        onPress={() => router.back()}
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
    marginTop: 6,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vsSide: { alignItems: 'center', gap: 10, flex: 1 },
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
  hint: { textAlign: 'center', marginTop: 18, paddingHorizontal: 10 },
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
