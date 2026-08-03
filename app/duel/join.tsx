import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { track } from '@/lib/analytics';
import { PressableScale, Screen } from '@/components/ui';
import { isJoinableByQr, isOwnDuelInvite, parseDuelInvite } from '@/domain/duelInvite';
import { fetchDuel } from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Deep-link landing for a duel invite — `repchamp://duel/join?id=…`.
 *
 * This is what a *native* camera hits. The in-app scanner
 * (`modal/duel-scan`) never comes through here: it parses the code itself and
 * routes straight on. But a phone camera or Google Lens pointed at the same QR
 * offers "Open in RepChamp" and lands the athlete here instead, so this screen
 * has to repeat the same checks rather than assume a scanner already made them.
 *
 * The duel is only read here, not joined. Seating happens on the duel screen,
 * which owns the join transaction, the live subscription and the countdown —
 * one path into a race, whichever way the athlete arrived at it.
 */
export default function DuelJoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const uid = useAuthStore((s) => s.user?.uid);

  // Parse rather than trust: this value comes from outside the app.
  const duelId = parseDuelInvite(params.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !duelId || !uid) return;
    handled.current = true;

    void (async () => {
      try {
        const duel = await fetchDuel(duelId);
        if (!duel) {
          setError('That duel has expired, or it was cancelled.');
          return;
        }
        if (isOwnDuelInvite(duel, uid)) {
          setError('This is your own duel code — your rival scans it, not you.');
          return;
        }
        if (!isJoinableByQr(duel)) {
          setError('Someone already took this duel. Ask your rival for a fresh code.');
          return;
        }

        track('duel_joined', { via: 'invite' });
        router.replace({
          pathname: '/duel/[id]',
          params: {
            id: duelId,
            role: 'guest',
            exercise: duel.exercise,
            duration: String(duel.duration),
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That duel link did not work.');
      }
    })();
  }, [duelId, uid, router]);

  // Auth can be slow — don't spin forever with no escape.
  useEffect(() => {
    if (uid || error) return;
    const id = setTimeout(() => {
      setError('Still signing you in. Open the Arena and try the code again.');
    }, 8_000);
    return () => clearTimeout(id);
  }, [uid, error]);

  // A link with no usable id is nonsense — send them somewhere they can act.
  if (!duelId) return <Redirect href="/(tabs)/arena" />;

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={{ fontSize: 40 }}>😕</Text>
            <Text style={styles.title}>Couldn’t join</Text>
            <Text style={[text.caption, styles.body]}>{error}</Text>
            <PressableScale
              onPress={() => router.replace('/(tabs)/arena')}
              accessibilityRole="button"
              accessibilityLabel="Go to the Arena"
              style={styles.button}
            >
              <Text style={font('extrabold', 14, { color: palette.white })}>Go to Arena</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <ActivityIndicator color={palette.green500} size="large" />
            <Text style={styles.title}>Joining the duel…</Text>
            <Text style={[text.caption, styles.body]}>Taking your seat</Text>
            <PressableScale
              onPress={() => router.replace('/(tabs)/arena')}
              accessibilityRole="button"
              accessibilityLabel="Cancel joining"
              style={styles.cancel}
            >
              <Text style={font('bold', 13, { color: palette.slate500 })}>Cancel</Text>
            </PressableScale>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { ...font('extrabold', 20, { color: palette.ink }), marginTop: 8 },
  body: { textAlign: 'center' },
  button: {
    marginTop: 16,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: radius['2xl'],
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { marginTop: 18, padding: 8 },
});
