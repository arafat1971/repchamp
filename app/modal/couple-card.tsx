import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef } from 'react';
import { Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen } from '@/components/ui';
import { LinkedAvatars } from '@/components/connected/LinkedAvatars';
import { LineIcon, PairPitch } from '@/components/together/kit';
import { ME, THEM } from '@/components/together/RitualCard';
import { inviteLink, lastMilestoneReached } from '@/domain/couple';
import { useCouple } from '@/state/useCouple';
import { reservedControlHeight } from '@/theme/fontScale';
import { font, scaleForRole, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

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
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const { paired, partner, me, streak, combined, code, level } = useCouple();
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
      <Screen enter>
        <ModalHeader title="Our card" />
        <PairPitch
          name="You"
          title="A card for two"
          body="Pair with a partner first — your card shows what the two of you have done together."
          onInvite={() => router.replace('/modal/couple-invite')}
        />
      </Screen>
    );
  }

  return (
    <Screen enter>
      <ModalHeader title="Our card" />

      {/* `collapsable={false}` keeps this a real native view so view-shot can
          snapshot it; the ref targets the capture at exactly the card. */}
      <View ref={cardRef} collapsable={false} style={styles.captureWrap}>
        <LinearGradient colors={gradients.heroEmerald} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.glow} />
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

          {/* The same linked pair, in the same colours, as the bond hero. */}
          <LinkedAvatars
            lit={streak > 0}
            size={60}
            me={{ initial: me.displayName.charAt(0).toUpperCase() || '?', uri: me.avatarUrl, color: ME }}
            them={{ initial: partner.displayName.charAt(0).toUpperCase() || '?', uri: partner.avatarUrl, color: THEM }}
          />

          <Text style={styles.names} numberOfLines={1}>
            {me.displayName} & {partner.displayName}
          </Text>

          <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>
            {combined.toLocaleString()}
          </Text>
          <Text style={styles.bigLabel}>REPS TOGETHER</Text>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{streak}</Text>
              <Text style={styles.statLabel}>day streak</Text>
            </View>
            <View style={[styles.stat, styles.statRule]}>
              <Text style={styles.statValue}>Lv {level.level}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>
                {level.name}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <PressableScale
        onPress={() => void share()}
        accessibilityRole="button"
        accessibilityLabel="Share our couple card"
        style={[styles.share, { minHeight: reservedControlHeight(56, fontScale) }]}
      >
        <LineIcon name="share" size={18} color={palette.white} />
        <Text style={font('extrabold', 16, { color: palette.white })} {...scaleForRole('control')}>
          Share card
        </Text>
      </PressableScale>

      <Text style={[text.caption, styles.hint]}>
        You choose who to send it to — RepChamp never posts for you.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Transparent so the rounded card's corners stay clean in the captured PNG
  // (no white square poking past the radius). Matches the result share card.
  captureWrap: { backgroundColor: 'transparent', alignSelf: 'center' },
  card: {
    width: 340,
    borderRadius: radius['6xl'],
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    // Clip children (avatars, tag) to the card's rounded corners.
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(134,239,172,0.10)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24, borderRadius: radius.sm, overflow: 'hidden' },
  brandTitle: font('extrabold', 14, { color: palette.white, letterSpacing: 2 }),
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green400 },
  tagText: { ...font('extrabold', 9.5, { color: palette.white }), letterSpacing: 1 },
  names: {
    ...font('bold', 15, { color: 'rgba(255,255,255,0.82)' }),
    marginTop: 14,
    textAlign: 'center',
    maxWidth: '100%',
  },
  big: {
    ...font('extrabold', 76, { color: palette.white }),
    lineHeight: 82,
    letterSpacing: -2.5,
    marginTop: 10,
    fontVariant: ['tabular-nums'],
  },
  bigLabel: {
    ...font('extrabold', 10.5, { color: 'rgba(255,255,255,0.7)' }),
    letterSpacing: 2.4,
    marginTop: 2,
  },
  stats: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    marginTop: 22,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  statRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.25)' },
  statValue: { ...font('extrabold', 19, { color: palette.white }), fontVariant: ['tabular-nums'] },
  statLabel: { ...font('medium', 11.5, { color: 'rgba(255,255,255,0.68)' }), marginTop: 1 },
  share: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    marginTop: 20,
    borderRadius: 28,
    backgroundColor: palette.ink,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { marginTop: 12, textAlign: 'center' },
});
