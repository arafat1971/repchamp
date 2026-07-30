import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { CoupleQR } from '@/components/CoupleQR';
import { coupleBondPresentation, inviteLink } from '@/domain/couple';
import { dayKey, lastNDayKeys, weekdayLetter } from '@/domain/progression';
import { ModalHeader } from '@/components/ModalHeader';
import { Card, Divider, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { cancelStreakReminder } from '@/lib/notifications';
import { createCouple, joinCoupleByCode, leaveCouple, nudgePartner } from '@/services/coupleService';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { selectPairingBonusActive, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';

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
  const { couple, paired, partner, me, streak, combined, code, loading, atRisk, level, badges } =
    useCouple();

  /**
   * Streak reminders are owned by `useNotificationSync` (root). On unpair we
   * still cancel immediately so a leftover evening nag doesn't fire.
   */
  useEffect(() => {
    if (!paired) void cancelStreakReminder();
  }, [paired]);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [entered, setEntered] = useState('');
  const [copied, setCopied] = useState(false);

  // Animated pulse for waiting QR
  const qrPulse = useSharedValue(1);
  useEffect(() => {
    if (!paired && code) {
      qrPulse.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 1200 }),
          withTiming(1, { duration: 1200 }),
        ),
        -1,
        true,
      );
    }
  }, [paired, code, qrPulse]);
  const qrPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: qrPulse.value }],
  }));

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
    showDialog({
      title: 'Not available yet',
      message:
        'Couple mode needs a signed-in account. Connect Firebase to pair with your partner.',
      tone: 'info',
      actions: [{ label: 'Got it', variant: 'primary' }],
    });
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
        showDialog({
          title: 'Not available yet',
          message: 'Connect Firebase to pair with a partner.',
          tone: 'info',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
      }
    } catch (error) {
      // Surface the real reason rather than a dead end — a pairing failure the
      // athlete can't act on is worse than none.
      showDialog({
        title: 'Could not create a code',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'danger',
        actions: [{ label: 'Try again', variant: 'primary' }],
      });
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
      showDialog({
        title: 'Could not pair',
        message: error instanceof Error ? error.message : 'Please check the code and try again.',
        tone: 'danger',
        actions: [{ label: 'Try again', variant: 'primary' }],
      });
    } finally {
      setJoining(false);
    }
  };

  const unpair = () => {
    if (!couple) return;
    showDialog({
      title: 'Break the bond?',
      message: 'Your shared streak and combined total will be lost. This can’t be undone.',
      tone: 'danger',
      actions: [
        { label: 'Keep it', variant: 'cancel' },
        {
          label: 'Unpair',
          variant: 'destructive',
          onPress: async () => {
            try {
              await leaveCouple(couple.id);
            } catch (error) {
              // A failed unpair leaves the bond intact — say so, rather than
              // letting the athlete believe they've left.
              captureError(error);
              showDialog({
                title: 'Could not unpair',
                message:
                  "We couldn't break the bond just now. Check your connection and try again.",
                tone: 'danger',
                actions: [{ label: 'Try again', variant: 'primary' }],
              });
            }
          },
        },
      ],
    });
  };

  // Activity calendar data
  const today = dayKey();
  const week = lastNDayKeys(7);
  const myDays = new Set(me?.trainedDays ?? []);
  const partnerDays = new Set(partner?.trainedDays ?? []);
  const bond = coupleBondPresentation({
    me,
    partner,
    streak,
    combined,
    atRisk,
    today,
    levelName: level.name,
  });

  const myInitial = displayName ? displayName.trim().charAt(0).toUpperCase() : 'A';
  const partnerInitial = partner?.displayName
    ? partner.displayName.trim().charAt(0).toUpperCase()
    : '?';

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

      {/* ═══════════════════ PAIRED STATE ═══════════════════ */}
      {!loading && paired && partner ? (
        <>
          {bonusActive ? (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.bonusBanner}>
              <Text style={{ fontSize: 18 }}>🎁</Text>
              <Text style={styles.bonusText}>
                You both unlocked a free week of Pro — the full library and programmes are on.
              </Text>
            </Animated.View>
          ) : null}

          {/* ── Pairing status (highlighted) ── */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.statusRow}>
            <View style={styles.statusAvatars}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.statusAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.statusAvatar, styles.statusAvatarFallback]}>
                  <Text style={styles.statusAvatarInitial}>{myInitial}</Text>
                </View>
              )}
              {partner.avatarUrl ? (
                <Image
                  source={{ uri: partner.avatarUrl }}
                  style={[styles.statusAvatar, styles.statusAvatarOverlap]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.statusAvatar, styles.statusAvatarOverlap, styles.statusAvatarFallback]}>
                  <Text style={styles.statusAvatarInitial}>{partnerInitial}</Text>
                </View>
              )}
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusName} numberOfLines={1}>
                Paired with {partner.displayName}
              </Text>
              <View style={styles.statusMetaRow}>
                <View
                  style={[
                    styles.statusDot,
                    bond.tone === 'risk' && { backgroundColor: palette.amber500 },
                    bond.tone === 'locked' && { backgroundColor: palette.green500 },
                    bond.tone === 'nudge' && { backgroundColor: palette.amber500 },
                  ]}
                />
                <Text style={styles.statusMeta} numberOfLines={1}>
                  {bond.headline}
                </Text>
              </View>
            </View>
            <View style={styles.statusTag}>
              <Text style={styles.statusTagText}>PAIRED</Text>
            </View>
          </Animated.View>

          {/* ── Hero Bond Card ── */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <LinearGradient
              colors={['#059669', '#10b981', '#34d399']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bondCard, shadow.brand]}
            >
              {/* Overlapping Avatar Pair with Photos */}
              <View style={styles.avatarPairRow}>
                <View style={styles.avatarRingMe}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: '#047857' }]}>
                      <Text style={styles.avatarInitial}>{myInitial}</Text>
                    </View>
                  )}
                </View>
                {/* Heart connector */}
                <Animated.View entering={ZoomIn.duration(500).delay(300)} style={styles.heartBadge}>
                  <Text style={{ fontSize: 18 }}>❤️</Text>
                </Animated.View>
                <View style={styles.avatarRingPartner}>
                  {partner.avatarUrl ? (
                    <Image source={{ uri: partner.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: '#065f46' }]}>
                      <Text style={styles.avatarInitial}>{partnerInitial}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Names row */}
              <View style={styles.namesPairRow}>
                <Text style={styles.myName} numberOfLines={1}>You</Text>
                <Text style={styles.bondLabel}>BONDED</Text>
                <Text style={styles.partnerName} numberOfLines={1}>{partner.displayName}</Text>
              </View>

              {/* Bond stats — clean numeric row, no emoji noise. */}
              <View style={styles.bigStatsRow}>
                <View style={styles.bigStatCol}>
                  <Text style={styles.bigStatNumber}>{streak}</Text>
                  <Text style={styles.bigStatLabel}>DAY STREAK</Text>
                </View>
                <View style={styles.bigStatDivider} />
                <View style={styles.bigStatCol}>
                  <Text style={styles.bigStatNumber}>{combined}</Text>
                  <Text style={styles.bigStatLabel}>REPS TOGETHER</Text>
                </View>
                <View style={styles.bigStatDivider} />
                <View style={styles.bigStatCol}>
                  <Text style={styles.bigStatNumber}>Lv.{level.level}</Text>
                  <Text style={styles.bigStatLabel}>{level.name.toUpperCase()}</Text>
                </View>
              </View>

              {/* Level progress */}
              <View style={styles.levelBlock}>
                <View style={styles.levelHeader}>
                  <Text style={styles.levelName}>
                    Bond Level {level.level}
                  </Text>
                  {level.nextAt ? (
                    <Text style={styles.levelNext}>
                      {level.points} / {level.nextAt} XP
                    </Text>
                  ) : (
                    <Text style={styles.levelNext}>MAX LEVEL</Text>
                  )}
                </View>
                <View style={styles.levelTrack}>
                  <Animated.View
                    entering={FadeInDown.duration(800).delay(600)}
                    style={[styles.levelFill, { width: `${Math.round(level.progress * 100)}%` }]}
                  />
                </View>
              </View>

              {/* Smart status banner — hook copy for fresh / nudge / risk */}
              {bond.tone === 'risk' || bond.tone === 'fresh' || bond.tone === 'nudge' ? (
                <Animated.View
                  entering={FadeInDown.duration(400).delay(400)}
                  style={[
                    styles.riskBanner,
                    bond.tone === 'fresh' && styles.hookBannerFresh,
                    bond.tone === 'nudge' && styles.hookBannerNudge,
                  ]}
                >
                  <Text style={styles.riskText}>{bond.headline}</Text>
                </Animated.View>
              ) : null}
            </LinearGradient>
          </Animated.View>

          {/* ── 7-Day Activity Calendar ── */}
          <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>Last 7 days</Text>
              <Text style={styles.calendarHint}>Both train = full glow</Text>
            </View>
            <View style={styles.calendarRow}>
              {week.map((day) => {
                const both = myDays.has(day) && partnerDays.has(day);
                const meOnly = myDays.has(day) && !partnerDays.has(day);
                const partnerOnly = !myDays.has(day) && partnerDays.has(day);
                const none = !myDays.has(day) && !partnerDays.has(day);
                return (
                  <Animated.View
                    key={day}
                    entering={FadeInUp.duration(300).delay(250)}
                    style={styles.calendarDayCol}
                  >
                    <Text style={styles.calendarDayLabel}>{weekdayLetter(day)}</Text>
                    <View
                      style={[
                        styles.calendarDot,
                        both && styles.calendarDotBoth,
                        meOnly && styles.calendarDotMe,
                        partnerOnly && styles.calendarDotPartner,
                        none && styles.calendarDotNone,
                      ]}
                    >
                      {both ? <Text style={{ fontSize: 10 }}>✓</Text> : null}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
                <Text style={styles.legendText}>Both</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#86efac' }]} />
                <Text style={styles.legendText}>You</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#cbd5e1' }]} />
                <Text style={styles.legendText}>{partner.displayName.split(' ')[0]}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#e2e8f0' }]} />
                <Text style={styles.legendText}>None</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Badge Shelf ── */}
          <Animated.View entering={FadeInUp.duration(400).delay(300)}>
            <Text style={styles.sectionTitle}>Couple Badges</Text>
            <View style={styles.badgeShelf}>
              {badges.map((b, i) => (
                <Animated.View
                  key={b.id}
                  entering={ZoomIn.duration(350).delay(400 + i * 80)}
                  style={[styles.badge, !b.earned && styles.badgeLocked]}
                >
                  <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                  <Text style={styles.badgeTitle} numberOfLines={1}>
                    {b.title}
                  </Text>
                  {b.earned ? (
                    <View style={styles.badgeEarnedDot} />
                  ) : null}
                </Animated.View>
              ))}
            </View>
          </Animated.View>

          <Text style={[text.caption, styles.hint]}>
            Your streak only grows on days you <Text style={styles.bold}>both</Text> train.
          </Text>

          {/* ── Action Buttons ── */}
          <Animated.View entering={FadeInUp.duration(400).delay(450)} style={styles.actions}>
            <PressableScale
              onPress={async () => {
                if (!couple || !uid || nudging) return;
                setNudging(true);
                try {
                  await nudgePartner(couple.id, uid, displayName || 'Your partner');
                  track('couple_nudge_sent');
                  showDialog({
                    title: 'Nudge sent',
                    message: `${partner.displayName} will get a push to come train.`,
                    tone: 'success',
                    actions: [{ label: 'Got it', variant: 'primary' }],
                  });
                } catch (error) {
                  captureError(error);
                  showDialog({
                    title: 'Nudge failed',
                    message:
                      "We couldn't send that nudge. Check your connection and try again.",
                    tone: 'danger',
                    actions: [{ label: 'Try again', variant: 'primary' }],
                  });
                } finally {
                  setNudging(false);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`Nudge ${partner.displayName} to train`}
              style={styles.actionOutline}
            >
              <Text style={styles.actionOutlineLabel}>{nudging ? 'Sending…' : 'Nudge'}</Text>
            </PressableScale>
            <PressableScale
              onPress={() => router.push('/modal/couple-card')}
              accessibilityRole="button"
              accessibilityLabel="Open our shareable couple card"
            >
              <LinearGradient
                colors={['#22c55e', '#15803d']}
                style={styles.actionPrimaryGrad}
              >
                <Text style={font('extrabold', 14, { color: palette.white })}>Our Card</Text>
              </LinearGradient>
            </PressableScale>
          </Animated.View>

          <Divider style={{ marginVertical: 22 }} />

          {/* ── Manage bond (professional danger action) ── */}
          <Text style={styles.manageLabel}>MANAGE BOND</Text>
          <PressableScale
            onPress={unpair}
            accessibilityRole="button"
            accessibilityLabel={`Unpair from ${partner.displayName}`}
            style={styles.unpairCard}
          >
            <View style={styles.unpairIcon}>
              <View style={styles.unpairIconBar} />
            </View>
            <View style={styles.unpairTextCol}>
              <Text style={styles.unpairTitle}>Unpair from {partner.displayName}</Text>
              <Text style={styles.unpairSub}>
                Ends your shared streak and combined total. This can&apos;t be undone.
              </Text>
            </View>
            <Text style={styles.unpairChevron}>›</Text>
          </PressableScale>
        </>
      ) : null}

      {/* ═══════════════════ INVITE OPEN, WAITING ═══════════════════ */}
      {!loading && !paired && code ? (
        <>
          <Animated.View entering={FadeInDown.duration(500)} style={styles.waitingHero}>
            <LinearGradient
              colors={['#f0fdf4', '#dcfce7', '#bbf7d0']}
              style={styles.waitingGradient}
            >
              <Animated.View style={qrPulseStyle}>
                <CoupleQR code={code} />
              </Animated.View>
              <Text style={styles.waitingCode}>{code}</Text>
              <View style={styles.waitingPulseRow}>
                <View style={styles.waitingPulseDot} />
                <Text style={styles.waitingLabel}>Waiting for your partner to join…</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.actions}>
            <PressableScale onPress={copyCode} accessibilityRole="button" style={styles.actionOutline}>
              <Text style={styles.actionOutlineLabel}>{copied ? 'Copied' : 'Copy code'}</Text>
            </PressableScale>
            <PressableScale onPress={shareCode} accessibilityRole="button">
              <LinearGradient
                colors={['#22c55e', '#15803d']}
                style={styles.actionPrimaryGrad}
              >
                <Text style={font('extrabold', 14, { color: palette.white })}>Share invite</Text>
              </LinearGradient>
            </PressableScale>
          </Animated.View>
        </>
      ) : null}

      {/* ═══════════════════ NOT PAIRED AT ALL ═══════════════════ */}
      {!loading && !paired && !code ? (
        <>
          <Animated.View entering={FadeInDown.duration(600)}>
            <LinearGradient
              colors={['#059669', '#10b981', '#6ee7b7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.pitchCard, shadow.brand]}
            >
              {/* Overlapping silhouette avatars */}
              <View style={styles.pitchAvatarRow}>
                <View style={styles.pitchAvatarMe}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.pitchAvatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.pitchAvatarInitial}>{myInitial}</Text>
                  )}
                </View>
                <View style={styles.pitchHeartBubble}>
                  <Text style={styles.pitchPlus}>+</Text>
                </View>
                <View style={styles.pitchAvatarPartner}>
                  <Text style={styles.pitchAvatarInitial}>?</Text>
                </View>
              </View>

              <Text style={styles.pitchTitle}>Train Together</Text>
              <Text style={styles.pitchBody}>
                You each film yourselves on your own phone. Reps combine into one total, and your
                streak only survives if you both show up.
              </Text>

              {/* Feature pills */}
              <View style={styles.featurePills}>
                <View style={styles.featurePill}>
                  <View style={styles.featurePillDot} />
                  <Text style={styles.featurePillText}>Shared streak</Text>
                </View>
                <View style={styles.featurePill}>
                  <View style={styles.featurePillDot} />
                  <Text style={styles.featurePillText}>Combined reps</Text>
                </View>
                <View style={styles.featurePill}>
                  <View style={styles.featurePillDot} />
                  <Text style={styles.featurePillText}>Couple badges</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(200)}>
            <PressableScale
              onPress={startInvite}
              accessibilityRole="button"
              accessibilityLabel="Create a pair code to invite your partner"
              disabled={creating}
            >
              <LinearGradient
                colors={['#22c55e', '#059669']}
                style={[styles.ctaButton, shadow.brand]}
              >
                <Text style={font('extrabold', 16, { color: palette.white })}>
                  {creating ? 'Creating…' : 'Invite My Partner'}
                </Text>
              </LinearGradient>
            </PressableScale>
          </Animated.View>

          <Divider style={{ marginVertical: 24 }} />

          <Animated.View entering={FadeInUp.duration(400).delay(300)}>
            <Eyebrow>GOT A CODE?</Eyebrow>

            <PressableScale
              onPress={() => (uid ? router.push('/modal/couple-scan') : requireAccount())}
              accessibilityRole="button"
              accessibilityLabel="Scan your partner's QR code"
              style={styles.scanButton}
            >
              <Text style={font('extrabold', 15, { color: palette.white })}>Scan QR code</Text>
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
          </Animated.View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { padding: 14, marginBottom: 16 },
  loading: { paddingVertical: 40, alignItems: 'center' },

  /* ── PAIRED STATE ── */
  bondCard: {
    borderRadius: radius['4xl'],
    padding: 24,
    gap: 20,
    alignItems: 'center',
  },
  avatarPairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarRingMe: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    backgroundColor: '#047857',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 2,
  },
  avatarRingPartner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    backgroundColor: '#065f46',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginLeft: -16,
    zIndex: 1,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: font('extrabold', 28, { color: palette.white }),
  heartBadge: {
    position: 'absolute',
    zIndex: 10,
    backgroundColor: palette.white,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  namesPairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  myName: font('extrabold', 15, { color: 'rgba(255,255,255,0.9)' }),
  bondLabel: {
    ...font('extrabold', 9, { color: 'rgba(255,255,255,0.6)' }),
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  partnerName: font('extrabold', 15, { color: 'rgba(255,255,255,0.9)' }),

  bigStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: radius['3xl'],
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  bigStatCol: { flex: 1, alignItems: 'center', gap: 4 },
  bigStatNumber: font('extrabold', 26, { color: palette.white }),
  bigStatLabel: {
    ...font('bold', 8, { color: 'rgba(255,255,255,0.7)' }),
    letterSpacing: 1,
  },
  bigStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  levelBlock: { width: '100%', gap: 6 },
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

  riskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 8,
    width: '100%',
  },
  hookBannerFresh: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  hookBannerNudge: {
    backgroundColor: 'rgba(245,158,11,0.28)',
  },
  riskText: font('bold', 12, { color: '#fef2f2' }),

  /* ── Calendar ── */
  calendarCard: {
    backgroundColor: palette.white,
    borderRadius: radius['3xl'],
    padding: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  calendarTitle: font('extrabold', 14, { color: palette.ink }),
  calendarHint: font('bold', 10, { color: palette.grey500 }),
  calendarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  calendarDayCol: { alignItems: 'center', gap: 6, flex: 1 },
  calendarDayLabel: font('bold', 10, { color: palette.grey500 }),
  calendarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDotBoth: { backgroundColor: '#22c55e' },
  calendarDotMe: { backgroundColor: '#86efac' },
  calendarDotPartner: { backgroundColor: '#cbd5e1' },
  calendarDotNone: { backgroundColor: '#f1f5f9' },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: font('bold', 9, { color: palette.grey500 }),

  /* ── Badges ── */
  sectionTitle: {
    ...font('extrabold', 14, { color: palette.ink }),
    marginTop: 18,
    marginBottom: 10,
  },
  badgeShelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: radius['2xl'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    position: 'relative',
  },
  badgeLocked: { opacity: 0.35 },
  badgeEmoji: { fontSize: 24 },
  badgeTitle: { ...font('extrabold', 9, { color: palette.ink }), letterSpacing: 0.3 },
  badgeEarnedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },

  /* ── Shared styles ── */
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionOutline: {
    flex: 1,
    height: 52,
    borderRadius: radius['2xl'],
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionOutlineLabel: font('extrabold', 14, { color: palette.ink }),
  actionPrimaryGrad: {
    flex: 1,
    height: 52,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  hint: { marginTop: 14, textAlign: 'center' },
  bold: font('extrabold', 13, { color: palette.ink }),

  /* ── Pairing status header ── */
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius['3xl'],
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    ...shadow.card,
  },
  statusAvatars: { flexDirection: 'row', alignItems: 'center' },
  statusAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: palette.white,
    overflow: 'hidden',
    backgroundColor: palette.green50,
  },
  statusAvatarOverlap: { marginLeft: -12 },
  statusAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  statusAvatarInitial: font('extrabold', 15, { color: palette.green600 }),
  statusTextCol: { flex: 1 },
  statusName: font('extrabold', 15, { color: palette.ink }),
  statusMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green500 },
  statusMeta: font('medium', 12, { color: palette.slate500 }),
  statusTag: {
    backgroundColor: palette.green50,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  statusTagText: font('extrabold', 10, { color: palette.green700, letterSpacing: 1 }),

  /* ── Manage bond / unpair ── */
  manageLabel: {
    ...font('extrabold', 10, { color: palette.slate400, letterSpacing: 1.5 }),
    marginBottom: 10,
  },
  unpairCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.red100,
    borderRadius: radius['2xl'],
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  unpairIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.red100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unpairIconBar: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.red500,
  },
  unpairTextCol: { flex: 1 },
  unpairTitle: font('extrabold', 14, { color: palette.red500 }),
  unpairSub: { ...font('medium', 11.5, { color: palette.slate500 }), marginTop: 2, lineHeight: 16 },
  unpairChevron: font('extrabold', 22, { color: palette.red400 }),

  /* ── WAITING STATE ── */
  waitingHero: { marginBottom: 4 },
  waitingGradient: {
    borderRadius: radius['4xl'],
    padding: 28,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  waitingCode: {
    ...font('extrabold', 40, { color: '#059669' }),
    letterSpacing: 8,
  },
  waitingPulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  waitingLabel: font('semibold', 13, { color: '#047857' }),

  /* ── NOT PAIRED ── */
  pitchCard: {
    borderRadius: radius['4xl'],
    padding: 28,
    alignItems: 'center',
    marginBottom: 18,
    gap: 12,
  },
  pitchAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  pitchAvatarMe: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 2,
  },
  pitchAvatarPartner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -12,
    zIndex: 1,
  },
  pitchAvatarImg: { width: '100%', height: '100%' },
  pitchAvatarInitial: font('extrabold', 24, { color: palette.white }),
  pitchPlus: font('extrabold', 22, { color: palette.green600 }),
  pitchHeartBubble: {
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -10,
  },
  pitchTitle: font('extrabold', 22, { color: palette.white }),
  pitchBody: {
    ...font('bold', 13, { color: 'rgba(255,255,255,0.9)' }),
    textAlign: 'center',
    lineHeight: 19,
  },
  featurePills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  featurePillDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.85)' },
  featurePillText: font('bold', 10, { color: palette.white }),
  ctaButton: {
    height: 58,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButton: {
    height: 54,
    borderRadius: radius['2xl'],
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 12,
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

  bonusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: radius['2xl'],
    padding: 14,
    marginBottom: 14,
  },
  bonusText: { ...font('bold', 12.5, { color: palette.amber900 }), flex: 1, lineHeight: 17 },
});
