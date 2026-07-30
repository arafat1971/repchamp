import { Image } from 'expo-image';
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
import { palette, radius } from '@/theme/tokens';

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
  const link = code ? inviteLink(code) : 'https://repchamp.web.app';

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
        <View style={styles.card}>
          {/* Header — brand mark left, single-accent "together" tag right. */}
          <View style={styles.header}>
            <View style={styles.brandGroup}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <Text style={styles.brandTitle}>REPCHAMP</Text>
            </View>
            <View style={styles.tag}>
              <View style={styles.tagDot} />
              <Text style={styles.tagText}>TOGETHER</Text>
            </View>
          </View>

          <View style={styles.avatars}>
            <View style={styles.avatarRing}>
              <Avatar
                uri={me.avatarUrl}
                initial={me.displayName.charAt(0).toUpperCase() || '?'}
                size={60}
              />
            </View>
            <View style={styles.plusBadge}>
              <Text style={styles.plus}>+</Text>
            </View>
            <View style={styles.avatarRing}>
              <Avatar
                uri={partner.avatarUrl}
                initial={partner.displayName.charAt(0).toUpperCase() || '?'}
                size={60}
              />
            </View>
          </View>

          <Text style={styles.names}>
            {me.displayName} & {partner.displayName}
          </Text>

          <Text style={styles.big}>{combined}</Text>
          <Text style={styles.bigLabel}>REPS TOGETHER</Text>

          {streak > 0 ? (
            <View style={styles.streakPill}>
              <View style={styles.streakDot} />
              <Text style={styles.streakText}>{streak} DAY STREAK</Text>
            </View>
          ) : null}
        </View>
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
  // Transparent so the rounded card's corners stay clean in the captured PNG
  // (no white square poking past the radius). Matches the result share card.
  captureWrap: { backgroundColor: 'transparent', alignSelf: 'center' },
  card: {
    width: 340,
    borderRadius: 32,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    // Clip children (avatars, tag) to the card's rounded corners.
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 22,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24, borderRadius: 7, overflow: 'hidden' },
  brandTitle: font('extrabold', 14, { color: palette.ink, letterSpacing: 2 }),
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.green50,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green500 },
  tagText: { ...font('extrabold', 9.5, { color: palette.green700 }), letterSpacing: 1 },
  avatars: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: { borderRadius: 40, borderWidth: 2.5, borderColor: palette.green500, padding: 2 },
  plusBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: font('extrabold', 20, { color: palette.green600 }),
  names: {
    ...font('extrabold', 17, { color: palette.ink }),
    marginTop: 14,
    textAlign: 'center',
  },
  big: {
    ...font('extrabold', 72, { color: palette.ink }),
    lineHeight: 78,
    marginTop: 10,
  },
  bigLabel: {
    ...font('extrabold', 10, { color: palette.slate500 }),
    letterSpacing: 2.4,
    marginTop: 2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    backgroundColor: palette.green50,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  streakDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green500 },
  streakText: { ...font('extrabold', 12, { color: palette.green700 }), letterSpacing: 1 },
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
