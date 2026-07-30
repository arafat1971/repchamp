import { useLocalSearchParams } from 'expo-router';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { PRIVACY_URL, TERMS_URL, SUPPORT_EMAIL } from '@/lib/urls';
import { font, text } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { Linking, StyleSheet, Text, View } from 'react-native';

/**
 * The app's Privacy Policy and Terms, shown in-app.
 *
 * Onboarding tells the athlete they agree to these, and the app stores reject a
 * build that references a policy the user can't actually read — so this screen
 * makes that promise real. The copy is deliberately written to match what the
 * app *actually* does (on-device pose processing, optional cloud sync, analytics,
 * billing), not boilerplate. `?tab=terms` opens straight to the Terms section.
 *
 * If you later host these at a public URL (recommended, so the stores can crawl
 * them), keep this screen as the in-app mirror and point the onboarding link at
 * whichever the reviewer prefers.
 */
export default function LegalScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const title = tab === 'terms' ? 'Terms of Use' : 'Privacy Policy';

  return (
    <Screen scroll>
      <ModalHeader title={title} />

      <PressableScale
        onPress={() => void Linking.openURL(tab === 'terms' ? TERMS_URL : PRIVACY_URL)}
        accessibilityRole="link"
        accessibilityLabel="Open the full policy in your browser"
        style={styles.onlineLink}
      >
        <Text style={font('extrabold', 12.5, { color: palette.green600 })}>
          View the full, always-current version online ↗
        </Text>
      </PressableScale>

      <Eyebrow style={styles.eyebrow}>PRIVACY POLICY</Eyebrow>
      <Card style={styles.card}>
        <Para>
          RepChamp counts your reps and checks your form using pose estimation
          that runs entirely on your device. The camera feed is processed live
          and is never recorded, uploaded, or sent anywhere. No video or image of
          you ever leaves your phone.
        </Para>

        <Section title="What we store">
          <Para>
            To sync your progress across devices and power leaderboards and couple
            mode, we store your chosen username, display name, optional profile
            photo, weekly goal, XP, personal bests, and workout summaries (exercise,
            rep count, date — never video). If you pair with a partner, the two of
            you share a couple record with your combined reps and streak.
          </Para>
        </Section>

        <Section title="Who processes it">
          <Para>
            Account and progress data is stored in Google Firebase (Firestore,
            Authentication, and Storage for your avatar). Anonymous product
            analytics — which screens are used, not who you are — is processed by
            PostHog. Subscriptions are handled by RevenueCat and the Apple App
            Store or Google Play. Crash diagnostics, when enabled, are processed by
            Sentry. We do not sell your data, and we do not use it for advertising.
          </Para>
        </Section>

        <Section title="Your choices">
          <Para>
            You can export a copy of everything we hold about you, or permanently
            delete your account and all associated data, at any time from
            Settings → Account. Deleting your account erases your profile,
            leaderboard entry, matchmaking ticket, and shared couple record, and
            removes your avatar from storage.
          </Para>
        </Section>

        <Section title="Contact">
          <Para>
            Questions about your data? Email {SUPPORT_EMAIL} and we&apos;ll respond.
          </Para>
        </Section>
      </Card>

      <Eyebrow style={styles.eyebrow}>TERMS OF USE</Eyebrow>
      <Card style={styles.card}>
        <Section title="Fitness disclaimer">
          <Para>
            RepChamp is a fitness tool, not medical advice. Rep counts and form
            cues are estimates from on-device pose detection and can be wrong.
            Train within your ability, warm up, and consult a professional before
            starting a new exercise programme. You are responsible for your own
            safety.
          </Para>
        </Section>

        <Section title="Your account">
          <Para>
            You&apos;re responsible for activity under your account and for keeping
            your login secure. Don&apos;t upload content you don&apos;t have the right to,
            impersonate others, cheat the leaderboard, or try to disrupt the
            service for other athletes.
          </Para>
        </Section>

        <Section title="Subscriptions">
          <Para>
            RepChamp Pro is an auto-renewing subscription billed through your app
            store account. It renews unless cancelled at least 24 hours before the
            period ends; manage or cancel it in your app store settings. Prices are
            shown before you purchase.
          </Para>
        </Section>

        <Section title="Changes">
          <Para>
            We may update these terms and this policy as the app evolves. Continued
            use after a change means you accept the updated version. The current
            version always lives here in the app.
          </Para>
        </Section>

        <Text style={styles.updated}>Last updated: July 2026</Text>
      </Card>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={styles.para}>{children}</Text>;
}

const styles = StyleSheet.create({
  onlineLink: {
    alignSelf: 'flex-start',
    backgroundColor: palette.green50,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  eyebrow: { marginBottom: 10, marginTop: 6 },
  card: { paddingHorizontal: 18, paddingVertical: 6, marginBottom: 22 },
  section: { marginTop: 16 },
  heading: { ...font('extrabold', 14, { color: palette.ink }), marginBottom: 6 },
  para: { ...text.body, color: palette.grey600, lineHeight: 21, marginBottom: 4 },
  updated: { ...text.caption, color: palette.grey450, marginTop: 18, marginBottom: 8 },
});
