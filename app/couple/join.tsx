import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { track } from '@/lib/analytics';
import { PressableScale, Screen } from '@/components/ui';
import { normalizePairCode } from '@/domain/couple';
import { successHaptic } from '@/lib/feedback';
import { joinCoupleByCode } from '@/services/coupleService';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Deep-link landing for a couple invite — `repchamp://couple/join?code=XXXX`
 * (and the matching web link once associated domains are set up).
 *
 * This is the payoff of the viral loop: a partner taps the shared link and lands
 * straight in pairing, no code to type. It joins on mount, then routes to the
 * couple screen (already subscribed, so it flips to the paired state). Any
 * failure — bad code, already full, no account — falls back to the manual invite
 * screen with a clear message rather than dead-ending here.
 */
export default function CoupleJoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const uid = useAuthStore((s) => s.user?.uid);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);

  const code = normalizePairCode(params.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !code || !uid) return;
    handled.current = true;

    void (async () => {
      try {
        await joinCoupleByCode(code, { uid, displayName, avatarUrl: avatarUri });
        track('couple_paired', { via: 'link' });
        successHaptic();
        router.replace('/modal/couple-invite');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That invite link did not work.');
      }
    })();
  }, [code, uid, displayName, avatarUri, router]);

  // A link with no usable code is nonsense — send them to pair by hand.
  if (!code) return <Redirect href="/modal/couple-invite" />;

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={{ fontSize: 40 }}>😕</Text>
            <Text style={styles.title}>Couldn’t pair</Text>
            <Text style={[text.caption, styles.body]}>{error}</Text>
            <PressableScale
              onPress={() => router.replace('/modal/couple-invite')}
              accessibilityRole="button"
              accessibilityLabel="Pair by hand instead"
              style={styles.button}
            >
              <Text style={font('extrabold', 14, { color: palette.white })}>Pair by hand</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <ActivityIndicator color={palette.green500} size="large" />
            <Text style={styles.title}>Pairing you up…</Text>
            <Text style={[text.caption, styles.body]}>Joining with code {code}</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  title: { ...font('extrabold', 20, { color: palette.ink }), marginTop: 10 },
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
});
