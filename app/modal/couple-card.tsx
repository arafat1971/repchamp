import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, PressableScale, Screen } from '@/components/ui';
import { inviteLink, lastMilestoneReached } from '@/domain/couple';
import { useCouple } from '@/state/useCouple';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/**
 * The couple's shareable moment — combined reps, shared streak, both names.
 *
 * The visual card is captured to a PNG (`react-native-view-shot`) and handed to
 * the OS share sheet as an image (`expo-sharing`) — so it lands as a proper
 * picture in Instagram/WhatsApp, the outbound growth loop. Falls back to a text
 * share if image capture or the sharing service is unavailable, so the button
 * always does *something*.
 *
 * As everywhere else, the OS sheet chooses the recipient — the app never posts
 * anything on the athlete's behalf.
 */
export default function CoupleCardScreen() {
  const { paired, partner, me, streak, combined, code } = useCouple();
  const cardRef = useRef<View>(null);

  const milestone = lastMilestoneReached(combined);
  const names = paired && partner && me ? `${me.displayName} & ${partner.displayName}` : 'Us';

  const line = milestone
    ? `${names} just passed ${milestone} reps together on RepChamp` +
      (streak > 0 ? ` — ${streak} day streak 🔥` : '')
    : `${names} have done ${combined} reps together on RepChamp` +
      (streak > 0 ? ` — ${streak} day streak 🔥` : '');
  const link = code ? inviteLink(code) : 'https://repchamp.gg';

  /** Text-only share — the fallback when an image can't be produced or shared. */
  const shareText = () => {
    void Share.share({ message: `${line}\n${link}` });
  };

  const share = async () => {
    track('share_opened', { kind: 'couple-card' });
    try {
      // Capture the visual card to a PNG, then hand the file to the OS sheet.
      const canShareFiles = await Sharing.isAvailableAsync();
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (canShareFiles) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your card' });
      } else {
        shareText();
      }
    } catch (error) {
      // Capture/sharing failed (rare) — never dead-end; fall back to text.
      captureError(error);
      shareText();
    }
  };

  if (!paired || !partner || !me) {
    return (
      <Screen>
        <ModalHeader title="Our card" />
        <Card style={styles.muted}>
          <Text style={text.caption}>
            Pair with a partner first — your card shows what the two of you have done together.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader title="Our card" />

      {/* `collapsable={false}` keeps this a real native view so view-shot can
          snapshot it; the ref targets the capture at exactly the card. */}
      <View ref={cardRef} collapsable={false} style={styles.captureWrap}>
        <LinearGradient colors={gradients.brandStrong} style={[styles.card, shadow.brand]}>
          <Text style={styles.brand}>REPCHAMP</Text>

        <View style={styles.avatars}>
          <Avatar
            uri={me.avatarUrl}
            initial={me.displayName.charAt(0).toUpperCase() || '?'}
            size={62}
          />
          <Text style={styles.amp}>+</Text>
          <Avatar
            uri={partner.avatarUrl}
            initial={partner.displayName.charAt(0).toUpperCase() || '?'}
            size={62}
          />
        </View>

        <Text style={styles.names}>
          {me.displayName} & {partner.displayName}
        </Text>

        <Text style={styles.big}>{combined}</Text>
        <Text style={styles.bigLabel}>REPS TOGETHER</Text>

        {streak > 0 ? (
          <View style={styles.streakPill}>
            <Text style={styles.streakText}>🔥 {streak} DAY STREAK</Text>
          </View>
        ) : null}
        </LinearGradient>
      </View>

      <PressableScale
        onPress={() => void share()}
        accessibilityRole="button"
        accessibilityLabel="Share our couple card"
        style={styles.share}
      >
        <Text style={font('extrabold', 16, { color: palette.white })}>Share</Text>
      </PressableScale>

      <Text style={[text.caption, styles.hint]}>
        You choose who to send it to — RepChamp never posts for you.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { padding: 16 },
  // A solid backdrop so the captured PNG has no transparent corners behind the
  // card's rounded edges — some share targets render transparency as black.
  captureWrap: { backgroundColor: palette.canvas, borderRadius: radius['4xl'] },
  card: {
    borderRadius: radius['4xl'],
    padding: 26,
    alignItems: 'center',
    gap: 6,
  },
  brand: {
    ...font('extrabold', 10, { color: 'rgba(255,255,255,0.7)' }),
    letterSpacing: 3,
    marginBottom: 6,
  },
  avatars: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  amp: font('extrabold', 22, { color: 'rgba(255,255,255,0.8)' }),
  names: {
    ...font('extrabold', 17, { color: palette.white }),
    marginTop: 10,
    textAlign: 'center',
  },
  big: {
    ...font('extrabold', 78, { color: palette.white }),
    lineHeight: 84,
    marginTop: 6,
  },
  bigLabel: {
    ...font('extrabold', 10, { color: 'rgba(255,255,255,0.8)' }),
    letterSpacing: 2.4,
  },
  streakPill: {
    marginTop: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  streakText: { ...font('extrabold', 12, { color: palette.white }), letterSpacing: 1.2 },
  share: {
    marginTop: 22,
    height: 56,
    borderRadius: radius['2xl'],
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { marginTop: 12, textAlign: 'center' },
});
