import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { CoupleQR } from '@/components/CoupleQR';
import { inviteLink } from '@/domain/couple';
import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, Divider, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { track } from '@/lib/analytics';
import { cancelStreakReminder, scheduleStreakReminder } from '@/lib/notifications';
import { createCouple, joinCoupleByCode, leaveCouple, nudgePartner } from '@/services/coupleService';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { selectPairingBonusActive, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/**
 * Pair up with a partner — the entry point to couple mode, and the app's viral
 * loop: couple mode is unusable alone, so unlocking it always means bringing
 * one other person in.
 *
 * The share flow deliberately mirrors `add-friend.tsx`: we copy or hand the code
 * to the OS share sheet and the athlete picks the recipient. The app never sends
 * anything on their behalf.
 */
export default function CoupleInviteScreen() {
  const uid = useAuthStore((s) => s.user?.uid);
  const cloudConfigured = useAuthStore((s) => s.configured);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const bonusActive = useProfileStore(selectPairingBonusActive);

  const router = useRouter();
  const { couple, paired, partner, streak, combined, code, loading, atRisk, level, badges } =
    useCouple();

  /**
   * Keep the local streak reminder in step with the bond: armed while a paired
   * streak still needs today's session, dropped the moment it is safe or the
   * couple breaks up. Local-only — see `lib/notifications.ts` for why reaching a
   * backgrounded partner needs a Cloud Function.
   */
  useEffect(() => {
    if (paired && partner && atRisk) {
      void scheduleStreakReminder(partner.displayName);
    } else {
      void cancelStreakReminder();
    }
  }, [paired, partner, atRisk]);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [entered, setEntered] = useState('');
  const [copied, setCopied] = useState(false);

  // Share a tappable link, not a bare code — one tap opens the app straight into
  // pairing. The code stays in the text as a fallback for anyone without the app.
  const inviteLine = code
    ? `Train with me on RepChamp 💪\n\nTap to pair: ${inviteLink(code)}\n(or enter code ${code})`
    : 'Train with me on RepChamp';

  const copyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // The OS sheet owns the recipient choice — we never message anyone directly.
  const shareCode = () => {
    void Share.share({ message: inviteLine });
  };

  /** Shown whenever an action needs an account the local-only build has not got. */
  const requireAccount = () => {
    Alert.alert(
      'Not available yet',
      'Couple mode needs a signed-in account. Connect Firebase (see FIREBASE_SETUP.md) to pair with your partner.',
    );
  };

  const startInvite = async () => {
    // Never let a primary button be a silent no-op — say why instead.
    if (!uid) return requireAccount();
    setCreating(true);
    try {
      const created = await createCouple({ uid, displayName, avatarUrl: avatarUri });
      if (created) {
        track('couple_invite_created');
      } else {
        Alert.alert('Not available yet', 'Connect Firebase to pair with a partner.');
      }
    } catch (error) {
      // Surface the real reason rather than a dead end — a pairing failure the
      // athlete can't act on is worse than none.
      Alert.alert(
        'Could not create a code',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setCreating(false);
    }
  };

  const redeem = async () => {
    if (!uid) return requireAccount();
    setJoining(true);
    try {
      await joinCoupleByCode(entered, { uid, displayName, avatarUrl: avatarUri });
      track('couple_paired', { via: 'code' });
      setEntered('');
    } catch (error) {
      Alert.alert(
        'Could not pair',
        error instanceof Error ? error.message : 'Please check the code and try again.',
      );
    } finally {
      setJoining(false);
    }
  };

  const unpair = () => {
    if (!couple) return;
    Alert.alert('Break the bond?', 'Your shared streak and combined total will be lost.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Unpair',
        style: 'destructive',
        onPress: () => void leaveCouple(couple.id),
      },
    ]);
  };

  return (
    <Screen>
      <ModalHeader title="Couple mode" />

      {!cloudConfigured ? (
        <Card style={styles.muted}>
          <Text style={text.caption}>
            Pairing needs the cloud. Connect Firebase (see FIREBASE_SETUP.md) to train with a
            partner.
          </Text>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.green500} />
        </View>
      ) : null}

      {/* ---------------- Paired ---------------- */}
      {!loading && paired && partner ? (
        <>
          {bonusActive ? (
            <View style={styles.bonusBanner}>
              <Text style={{ fontSize: 18 }}>🎁</Text>
              <Text style={styles.bonusText}>
                You both unlocked a free week of Pro — the full library and programmes are on.
              </Text>
            </View>
          ) : null}

          <LinearGradient colors={gradients.brandStrong} style={[styles.pairedCard, shadow.brand]}>
            <Text style={styles.pairedEyebrow}>YOU'RE PAIRED WITH</Text>
            <View style={styles.pairedRow}>
              <Avatar
                uri={partner.avatarUrl}
                initial={partner.displayName.charAt(0).toUpperCase() || '?'}
                size={54}
              />
              <Text style={font('extrabold', 22, { color: palette.white })}>
                {partner.displayName}
              </Text>
            </View>
            <View style={styles.pairedStats}>
              <View>
                <Text style={styles.statValue}>{streak}</Text>
                <Text style={styles.statLabel}>DAY STREAK</Text>
              </View>
              <View>
                <Text style={styles.statValue}>{combined}</Text>
                <Text style={styles.statLabel}>REPS TOGETHER</Text>
              </View>
            </View>

            {/* Shared couple level — the "we're building something" progress bar. */}
            <View style={styles.levelBlock}>
              <View style={styles.levelHeader}>
                <Text style={styles.levelName}>
                  Lv.{level.level} · {level.name}
                </Text>
                {level.nextAt ? (
                  <Text style={styles.levelNext}>
                    {level.points} / {level.nextAt}
                  </Text>
                ) : (
                  <Text style={styles.levelNext}>MAX</Text>
                )}
              </View>
              <View style={styles.levelTrack}>
                <View style={[styles.levelFill, { width: `${Math.round(level.progress * 100)}%` }]} />
              </View>
            </View>
          </LinearGradient>

          {/* Badge shelf — shared achievements, earned ones lit. */}
          <View style={styles.badgeShelf}>
            {badges.map((b) => (
              <View key={b.id} style={[styles.badge, !b.earned && styles.badgeLocked]}>
                <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                <Text style={styles.badgeTitle} numberOfLines={1}>
                  {b.title}
                </Text>
              </View>
            ))}
          </View>

          <Text style={[text.caption, styles.hint]}>
            Your streak only grows on days you <Text style={styles.bold}>both</Text> train.
          </Text>

          <View style={styles.actions}>
            <PressableScale
              onPress={() => {
                if (!couple || !uid) return;
                void nudgePartner(couple.id, uid, displayName || 'Your partner');
                track('couple_nudge_sent');
                Alert.alert('Nudge sent', `${partner.displayName} will get a push to come train.`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Nudge ${partner.displayName} to train`}
              style={styles.action}
            >
              <Text style={styles.actionLabel}>👋 Nudge</Text>
            </PressableScale>
            <PressableScale
              onPress={() => router.push('/modal/couple-card')}
              accessibilityRole="button"
              accessibilityLabel="Open our shareable couple card"
              style={styles.actionPrimary}
            >
              <Text style={font('extrabold', 14, { color: palette.white })}>Our card</Text>
            </PressableScale>
          </View>

          <Divider style={{ marginVertical: 22 }} />

          <PressableScale onPress={unpair} accessibilityRole="button" style={styles.unpair}>
            <Text style={font('extrabold', 14, { color: palette.red500 })}>Unpair</Text>
          </PressableScale>
        </>
      ) : null}

      {/* ---------------- Invite open, waiting ---------------- */}
      {!loading && !paired && code ? (
        <>
          <Eyebrow>SCAN OR SHARE THIS CODE</Eyebrow>
          <Card style={styles.codeCard}>
            {/* The QR is the fast path — the partner scans it in-app; the text
                code below is the fallback for typing it in. */}
            <CoupleQR code={code} />
            <Text style={styles.code}>{code}</Text>
            <Text style={text.caption}>Waiting for your partner to join…</Text>
          </Card>

          <View style={styles.actions}>
            <PressableScale onPress={copyCode} accessibilityRole="button" style={styles.action}>
              <Text style={styles.actionLabel}>{copied ? '✓ Copied' : 'Copy code'}</Text>
            </PressableScale>
            <PressableScale onPress={shareCode} accessibilityRole="button" style={styles.actionPrimary}>
              <Text style={font('extrabold', 14, { color: palette.white })}>Share invite</Text>
            </PressableScale>
          </View>
        </>
      ) : null}

      {/* ---------------- Not paired at all ---------------- */}
      {!loading && !paired && !code ? (
        <>
          <LinearGradient colors={gradients.brandStrong} style={[styles.pitch, shadow.brand]}>
            <Text style={{ fontSize: 44 }}>🤝</Text>
            <Text style={font('extrabold', 20, { color: palette.white, marginTop: 8 })}>
              Train together
            </Text>
            <Text style={styles.pitchBody}>
              You each film yourselves on your own phone. Reps combine into one total, and your
              streak only survives if you both show up.
            </Text>
          </LinearGradient>

          <PressableScale
            onPress={startInvite}
            accessibilityRole="button"
            accessibilityLabel="Create a pair code to invite your partner"
            disabled={creating}
          >
            <LinearGradient colors={gradients.brandStrong} style={[styles.cta, shadow.brand]}>
              <Text style={font('extrabold', 16, { color: palette.white })}>
                {creating ? 'Creating…' : 'Invite my partner'}
              </Text>
            </LinearGradient>
          </PressableScale>

          <Divider style={{ marginVertical: 24 }} />

          <Eyebrow>GOT A CODE?</Eyebrow>

          {/* Scanning your partner's QR is the quick path; the text field below
              is the manual fallback. */}
          <PressableScale
            onPress={() => (uid ? router.push('/modal/couple-scan') : requireAccount())}
            accessibilityRole="button"
            accessibilityLabel="Scan your partner's QR code"
            style={styles.scanButton}
          >
            <Text style={font('extrabold', 15, { color: palette.white })}>📷 Scan QR code</Text>
          </PressableScale>

          <View style={styles.joinRow}>
            <TextInput
              value={entered}
              onChangeText={setEntered}
              placeholder="ABC234"
              placeholderTextColor={palette.grey400}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              style={styles.input}
            />
            <PressableScale
              onPress={redeem}
              accessibilityRole="button"
              accessibilityLabel="Pair using this code"
              style={styles.joinButton}
              disabled={joining || !entered.trim()}
            >
              <Text style={font('extrabold', 14, { color: palette.white })}>
                {joining ? '…' : 'Pair'}
              </Text>
            </PressableScale>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { padding: 14, marginBottom: 16 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  pitch: { borderRadius: radius['4xl'], padding: 22, alignItems: 'center', marginBottom: 18 },
  pitchBody: {
    ...font('bold', 13, { color: 'rgba(255,255,255,0.9)' }),
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  cta: {
    height: 58,
    borderRadius: radius['2xl'],
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  input: {
    flex: 1,
    height: 52,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    ...font('extrabold', 16, { color: palette.ink }),
    letterSpacing: 2,
  },
  joinButton: {
    paddingHorizontal: 22,
    height: 52,
    borderRadius: radius['2xl'],
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCard: { padding: 22, alignItems: 'center', gap: 12 },
  scanButton: {
    height: 54,
    borderRadius: radius['2xl'],
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  code: {
    ...font('extrabold', 40, { color: palette.ink }),
    letterSpacing: 8,
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  action: {
    flex: 1,
    height: 52,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: font('extrabold', 14, { color: palette.ink }),
  actionPrimary: {
    flex: 1,
    height: 52,
    borderRadius: radius['2xl'],
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bonusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.amber50,
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: radius['2xl'],
    padding: 14,
    marginBottom: 14,
  },
  bonusText: { ...font('bold', 12.5, { color: palette.amber900 }), flex: 1, lineHeight: 17 },
  pairedCard: { borderRadius: radius['4xl'], padding: 22, gap: 16 },
  levelBlock: { gap: 6 },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  levelName: font('extrabold', 13, { color: palette.white }),
  levelNext: { ...font('bold', 11, { color: 'rgba(255,255,255,0.8)' }) },
  levelTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  levelFill: { height: '100%', borderRadius: 4, backgroundColor: palette.white },
  badgeShelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  badge: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
  },
  badgeLocked: { opacity: 0.4 },
  badgeEmoji: { fontSize: 22 },
  badgeTitle: { ...font('extrabold', 9, { color: palette.ink }), letterSpacing: 0.3 },
  pairedEyebrow: {
    ...font('extrabold', 9, { color: 'rgba(255,255,255,0.75)' }),
    letterSpacing: 2,
  },
  pairedRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pairedStats: { flexDirection: 'row', gap: 32 },
  statValue: font('extrabold', 26, { color: palette.white }),
  statLabel: {
    ...font('bold', 9, { color: 'rgba(255,255,255,0.75)' }),
    letterSpacing: 1.2,
  },
  hint: { marginTop: 14, textAlign: 'center' },
  bold: font('extrabold', 13, { color: palette.ink }),
  unpair: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
});
