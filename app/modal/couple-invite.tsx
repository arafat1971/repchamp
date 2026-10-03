import { LockIcon } from '@/components/home/Icons';
import {
  ActionList,
  ActionRow,
  ButtonPair,
  LineIcon,
  SectionTitle,
  Surface,
  TogetherHero,
} from '@/components/together/kit';
import { ME, THEM } from '@/components/together/RitualCard';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
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
import {
  cancelCoupleInvite,
  createCouple,
  joinCoupleByCode,
  leaveCouple,
  nudgePartner,
} from '@/services/coupleService';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { selectPairingBonusActive, useProfileStore } from '@/state/profileStore';
import { reservedControlHeight } from '@/theme/fontScale';
import { font, scaleForRole, text } from '@/theme/typography';
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
  const { fontScale } = useWindowDimensions();
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

  /* Auto-create fires at most once per mount. Without this, any re-render
     while `code` is still null — an auth tick, a profile write — would queue a
     second `createCouple` and leave an orphaned pending invite behind. */
  const autoCreated = useRef(false);

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

  /**
   * Create the pair code.
   *
   * `silent` is for the arrival effect: nobody asked for that attempt, so a
   * failure must not throw a red dialog in front of someone who has only just
   * opened the screen. The manual button keeps every message — there the
   * athlete pressed something and is owed an answer.
   */
  const createInvite = async ({ silent }: { silent: boolean }) => {
    // Never let a primary button be a silent no-op — say why instead.
    if (!uid) return silent ? undefined : requireAccount();
    setCreating(true);
    try {
      const created = await createCouple({ uid, displayName, avatarUrl: avatarUri });
      if (created) {
        track('couple_invite_created');
      } else if (silent) {
        // Unconfigured build — the screen already says so in its own card.
      } else {
        showDialog({
          title: 'Not available yet',
          message: 'Connect Firebase to pair with a partner.',
          tone: 'info',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
      }
    } catch (error) {
      if (silent) {
        /* Arrival attempt. Report it, but do not interrupt: the athlete can
           still tap "Invite My Partner" and get the full message then. This is
           also what keeps a Firestore outage (or App Check rejecting an
           un-attested build) from greeting every visit with a red dialog. */
        captureError(error);
      } else {
        // Surface the real reason rather than a dead end — a pairing failure the
        // athlete can't act on is worse than none.
        showDialog({
          title: 'Could not create a code',
          message: error instanceof Error ? error.message : 'Please try again.',
          tone: 'danger',
          actions: [{ label: 'Try again', variant: 'primary' }],
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const startInvite = () => createInvite({ silent: false });

  /* Have a code ready on arrival, so the QR is on screen without a tap.
   *
   * Guarded hard, because this writes to Firestore: only for a signed-in
   * athlete on a configured build, only once the couple subscription has
   * settled (`loading`), and only when there is genuinely no couple yet —
   * `code` covers an invite already open, `paired` covers a live bond. Firing
   * on a half-loaded state would create a second couple for someone who
   * already has one, which `createCouple` refuses anyway, but the refusal
   * would surface as an error nobody asked for. */
  useEffect(() => {
    if (autoCreated.current) return;
    if (!cloudConfigured || !uid || loading || paired || code) return;
    autoCreated.current = true;
    /* `createInvite` flips `creating` synchronously, which the lint rule reads
       as a cascading render. It is bounded here: `autoCreated` makes this a
       once-per-mount write, and the render it triggers is the spinner the
       athlete should see while the code is minted. Same shape as the offering
       fetch in `modal/paywall.tsx`, suppressed the same way. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void createInvite({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudConfigured, uid, loading, paired, code]);

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

  const bothToday = myDays.has(today) && partnerDays.has(today);
  const sharedThisWeek = week.filter((d) => myDays.has(d) && partnerDays.has(d)).length;
  const earnedCount = badges.filter((b) => b.earned).length;
  const firstName = partner?.displayName?.trim().split(' ')[0] || 'partner';

  const nudge = async () => {
    if (!couple || !uid || !partner || nudging) return;
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
          error instanceof Error
            ? error.message
            : "We couldn't send that nudge. Check your connection and try again.",
        tone: 'danger',
        actions: [{ label: 'Try again', variant: 'primary' }],
      });
    } finally {
      setNudging(false);
    }
  };

  const myInitial = displayName ? displayName.trim().charAt(0).toUpperCase() : 'A';

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
              <View style={styles.bonusTile}>
                <LineIcon name="gift" size={18} color={palette.amber800} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bonusTitle}>You both unlocked a free week of Pro</Text>
                <Text style={styles.bonusText}>The full library and programmes are on.</Text>
              </View>
            </Animated.View>
          ) : null}

          {/* ── The bond: the same hero as Today together and the history ── */}
          <Animated.View entering={FadeInDown.duration(450)}>
            <TogetherHero
              lit={bothToday}
              me={{ name: displayName?.trim() || 'You', uri: avatarUri, color: ME }}
              them={{ name: partner.displayName, uri: partner.avatarUrl, color: THEM }}
              streak={streak}
              caption={bond.headline}
              stats={[
                { value: combined.toLocaleString(), label: 'reps together' },
                { value: `${sharedThisWeek}/7`, label: 'days this week' },
                { value: `${earnedCount}/${badges.length}`, label: 'milestones' },
              ]}
              level={{
                label: `Level ${level.level} · ${level.name}`,
                detail: level.nextAt ? `${level.points} / ${level.nextAt} XP` : 'Top level',
                progress: level.progress,
              }}
            />
          </Animated.View>

          {/* The two things you do to a bond, straight under it and equal. */}
          <ButtonPair
            secondary={{
              label: nudging ? 'Sending…' : `Nudge ${firstName}`,
              icon: 'bell',
              onPress: () => void nudge(),
              a11y: `Nudge ${partner.displayName} to train`,
              disabled: nudging,
            }}
            primary={{
              label: 'Share card',
              icon: 'share',
              onPress: () => router.push('/modal/couple-card'),
              a11y: 'Open our shareable couple card',
            }}
          />

          {/* ── This week ── */}
          <Animated.View entering={FadeInUp.duration(400).delay(150)}>
            <SectionTitle title="This week" aside={`${sharedThisWeek} of 7 together`} />
            <Surface style={styles.weekCard}>
              <View style={styles.weekRow}>
                {week.map((day) => {
                  const mine = myDays.has(day);
                  const theirs = partnerDays.has(day);
                  const both = mine && theirs;
                  const isToday = day === today;
                  return (
                    <View
                      key={day}
                      style={styles.weekCol}
                      accessibilityLabel={`${day}: ${both ? 'you both trained' : mine ? 'only you trained' : theirs ? `only ${firstName} trained` : 'no one trained'}`}
                    >
                      <Text style={[styles.weekLetter, isToday && styles.weekLetterToday]}>{weekdayLetter(day)}</Text>
                      <View
                        style={[
                          styles.weekDot,
                          both && styles.weekDotBoth,
                          mine && !theirs && { backgroundColor: `${ME}22` },
                          theirs && !mine && { backgroundColor: `${THEM}2E` },
                          isToday && !both && styles.weekDotToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekNum,
                            both && { color: palette.white },
                            mine && !theirs && { color: ME },
                            theirs && !mine && { color: palette.amber800 },
                          ]}
                        >
                          {Number(day.slice(8, 10))}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.weekLegend}>
                <Legend color={palette.green500} label="Both" />
                <Legend color={ME} label="You" />
                <Legend color={THEM} label={firstName} />
              </View>
              <Text style={styles.weekNote}>Your streak only grows on days you both train.</Text>
            </Surface>
          </Animated.View>

          <ActionList style={styles.navList}>
            <ActionRow
              flat
              icon="today"
              title="Today, together"
              sub="The live stage, your ritual and today’s moments"
              onPress={() => router.push('/couple/partner')}
            />
            <ActionRow
              flat
              rule
              icon="calendar"
              tint={ME}
              title="Your history together"
              sub="Four weeks of who trained, and who put in what"
              onPress={() => router.push('/couple')}
            />
          </ActionList>

          {/* ── Milestones ── */}
          <Animated.View entering={FadeInUp.duration(400).delay(250)}>
            <SectionTitle title="Milestones" aside={`${earnedCount} of ${badges.length}`} />
            <View style={styles.badgeShelf}>
              {badges.map((b) => (
                <View
                  key={b.id}
                  style={[styles.badge, b.earned && styles.badgeEarned]}
                  accessibilityLabel={`${b.title}. ${b.detail}. ${b.earned ? 'Earned' : 'Locked'}`}
                >
                  <View style={[styles.badgeMedal, b.earned && styles.badgeMedalEarned]}>
                    <Text style={[styles.badgeEmoji, !b.earned && styles.badgeEmojiLocked]}>{b.emoji}</Text>
                    {b.earned ? null : (
                      <View style={styles.badgeLock}>
                        <LockIcon size={10} color={palette.grey700} strokeWidth={2.4} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.badgeTitle, !b.earned && styles.badgeTitleLocked]} numberOfLines={1}>
                    {b.title}
                  </Text>
                  <Text style={styles.badgeDetail} numberOfLines={2}>
                    {b.detail}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── Manage: quiet until you need it; the dialog carries the warning ── */}
          <ActionList style={styles.manage}>
            <ActionRow
              flat
              danger
              icon="unpair"
              tint={palette.red500}
              title={`Unpair from ${partner.displayName}`}
              sub="Ends your shared streak and combined total"
              onPress={unpair}
            />
          </ActionList>
        </>
      ) : null}

      {/* ═══════════════════ INVITE OPEN, WAITING ═══════════════════ */}
      {!loading && !paired && code ? (
        <>
          <Animated.View entering={FadeInDown.duration(500)} style={styles.waitingHero}>
            <LinearGradient
              colors={gradients.heroEmerald}
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
            <PressableScale
              onPress={copyCode}
              accessibilityRole="button"
              accessibilityLabel={copied ? 'Code copied' : 'Copy code'}
              style={[styles.actionOutline, { minHeight: reservedControlHeight(52, fontScale) }]}
            >
              <Text style={styles.actionOutlineLabel} {...scaleForRole('control')}>
                {copied ? 'Copied' : 'Copy code'}
              </Text>
            </PressableScale>
            <PressableScale
              onPress={shareCode}
              accessibilityRole="button"
              accessibilityLabel="Share invite"
            
              style={{ flex: 1 }}
            >
              <LinearGradient
                colors={gradients.brandStrong}
                style={[
                  styles.actionPrimaryGrad,
                  { minHeight: reservedControlHeight(52, fontScale) },
                ]}
              >
                <Text style={font('extrabold', 14, { color: palette.white })} {...scaleForRole('control')}>
                  Share invite
                </Text>
              </LinearGradient>
            </PressableScale>
          </Animated.View>
          <PressableScale
            onPress={() => {
              if (!couple) return;
              showDialog({
                title: 'Cancel invite?',
                message:
                  'This closes the open pair code. You can create a new invite anytime.',
                tone: 'danger',
                actions: [
                  { label: 'Keep invite', variant: 'cancel' },
                  {
                    label: 'Cancel invite',
                    variant: 'destructive',
                    onPress: async () => {
                      try {
                        const outcome = await cancelCoupleInvite(couple.id);
                        if (outcome === 'paired') {
                          showDialog({
                            title: 'Already paired',
                            message:
                              "Your partner joined just in time — you're bonded. Unpair from below if you need to separate.",
                            tone: 'info',
                            actions: [{ label: 'Got it', variant: 'primary' }],
                          });
                        }
                      } catch (error) {
                        captureError(error);
                        showDialog({
                          title: 'Could not cancel',
                          message:
                            'Check your connection and try again.',
                          tone: 'danger',
                          actions: [{ label: 'Got it', variant: 'primary' }],
                        });
                      }
                    },
                  },
                ],
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel couple invite"
            style={{ marginTop: 12, alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={font('semibold', 14, { color: palette.slate500 })}>
              Cancel invite
            </Text>
          </PressableScale>
        </>
      ) : null}

      {/* ═══════════════════ NOT PAIRED AT ALL ═══════════════════ */}
      {!loading && !paired && !code ? (
        <>
          <Animated.View entering={FadeInDown.duration(600)}>
            {/* `gradients.brandDeep` — the same hero gradient the couple
                tracker uses. This was a hardcoded mint wash
                (#059669→#10b981→#6ee7b7), visibly lighter and cooler than every
                other hero in the app, so the two halves of the pairing flow
                read as different products one tap apart. */}
            <LinearGradient
              colors={gradients.heroEmerald}
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
                  <Text style={styles.pitchCouple}>🫶</Text>
                </View>
                {/* The empty seat. A bare "?" read as an error state rather
                    than an invitation — this is the one slot on the screen that
                    is meant to feel like someone is missing from it. The
                    athlete's own initial stays on the left, because that circle
                    is them and identity beats decoration. */}
                <View style={styles.pitchAvatarPartner}>
                  <Image
                    source={require('../../assets/logo.png')}
                    style={styles.pitchPartnerLogo}
                    contentFit="cover"
                    accessibilityLabel="Your partner's empty seat"
                  />
                </View>
              </View>

              <Text style={styles.pitchTitle}>Train Together</Text>
              <Text style={styles.pitchBody}>
                You each film yourselves on your own phone. Reps combine into one total, and your
                streak only survives if you both show up.
              </Text>

              {/* Feature pills. The emoji replace a decorative dot that said
                  nothing — each one now names its pill at a glance, which is
                  how `settings.tsx` uses emoji too (one per row, labelling a
                  structured element rather than loose in prose).
                  Labels are one word each on purpose: "Shared streak" etc. plus
                  an emoji needs ~320dp on a 360dp phone against ~264dp of
                  usable row, which wrapped the third pill onto its own line.
                  One word apiece comes to ~202dp and the emoji carries the
                  meaning the extra word was doing. */}
              <View style={styles.featurePills}>
                <View style={styles.featurePill}>
                  <Text style={styles.featurePillEmoji}>🔥</Text>
                  <Text style={styles.featurePillText}>Streak</Text>
                </View>
                <View style={styles.featurePill}>
                  <Text style={styles.featurePillEmoji}>💪</Text>
                  <Text style={styles.featurePillText}>Reps</Text>
                </View>
                <View style={styles.featurePill}>
                  <Text style={styles.featurePillEmoji}>🏆</Text>
                  <Text style={styles.featurePillText}>Badges</Text>
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
                colors={gradients.brandStrong}
                style={[
                  styles.ctaButton,
                  shadow.brand,
                  { minHeight: reservedControlHeight(58, fontScale) },
                ]}
              >
                <Text
                  style={font('extrabold', 16, { color: palette.white })}
                  {...scaleForRole('control')}
                >
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
              style={[styles.scanButton, { minHeight: reservedControlHeight(54, fontScale) }]}
            >
              <Text style={font('extrabold', 15, { color: palette.white })} {...scaleForRole('control')}>
                Scan QR code
              </Text>
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
                style={[styles.input, { minHeight: reservedControlHeight(52, fontScale) }]}
                {...scaleForRole('control')}
              />
              <PressableScale
                onPress={redeem}
                accessibilityRole="button"
                accessibilityLabel="Pair using this code"
                style={[styles.joinButton, { minHeight: reservedControlHeight(52, fontScale) }]}
                disabled={joining || !entered.trim()}
              >
                <Text
                  style={font('extrabold', 14, { color: palette.white })}
                  {...scaleForRole('control')}
                >
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { padding: 12, marginBottom: 16 },
  loading: { paddingVertical: 40, alignItems: 'center' },

  /* ── PAIRED STATE ── */
  weekCard: { padding: 16 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekLetter: font('semibold', 11, { color: palette.grey600 }),
  weekLetterToday: { color: palette.ink },
  weekDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.divider,
  },
  weekDotBoth: { backgroundColor: palette.green500 },
  weekDotToday: { borderWidth: 1.5, borderColor: palette.ink },
  weekNum: { ...font('bold', 13, { color: palette.grey700 }), fontVariant: ['tabular-nums'] },
  weekLegend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...font('semibold', 12, { color: palette.grey700 }), flexShrink: 1 },
  weekNote: { ...font('medium', 12.5, { color: palette.grey700 }), marginTop: 10, lineHeight: 17 },

  navList: { marginTop: 16 },

  /* ── Milestones ── */
  badgeShelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    borderRadius: radius['2xl'],
  },
  badgeEarned: { borderColor: palette.green200 },
  badgeMedal: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.divider,
  },
  badgeMedalEarned: { backgroundColor: palette.green50 },
  badgeEmoji: { fontSize: 22 },
  badgeEmojiLocked: { opacity: 0.35 },
  badgeLock: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTitle: { ...font('bold', 12.5, { color: palette.ink }), marginTop: 10, textAlign: 'center' },
  badgeTitleLocked: { color: palette.grey700 },
  badgeDetail: {
    ...font('medium', 10.5, { color: palette.grey600 }),
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 14,
    minHeight: 28,
  },

  manage: { marginTop: 28 },

  /* ── Shared styles ── */
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionOutline: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    flex: 1,
    borderRadius: radius['2xl'],
    borderWidth: 1.5,
    borderColor: palette.border,
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
    // `minHeight` at render time — see `@/theme/fontScale`.
    flex: 1,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: palette.green500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  /* ── WAITING STATE ── */
  waitingHero: { marginBottom: 4 },
  waitingGradient: {
    borderRadius: radius['4xl'],
    padding: 28,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: palette.green700,
  },
  /* #059669 and #047857 below are deliberately NOT swapped for green600/green700.
     Measured against this card's own ground (tintGreenTop #f0fdf4 →
     tintGreenBottom #dcfce7) the tokens are worse on contrast, not better:
       waitingCode  #059669 3.60:1 / 3.43:1  vs  green600 3.15:1 / 3.00:1
       waitingLabel #047857 5.24:1 / 4.99:1  vs  green700 4.79:1 / 4.57:1
     The label would still pass AA on the token, but tokenising here trades
     legibility for tidiness on the one surface that shows a 6-character code
     someone has to read off a screen and type into another phone. */
  waitingCode: {
    ...font('extrabold', 40, { color: '#059669' }),
    letterSpacing: 8,
  },
  waitingPulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.green500,
  },
  waitingLabel: font('semibold', 13, { color: '#047857' }),

  /* ── NOT PAIRED ── */
  pitchCard: {
    borderRadius: radius['4xl'],
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  pitchAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
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
    // Clips the logo tile to the ring. `pitchAvatarMe` has always had this —
    // it is why a real avatar photo crops round — but this seat never needed
    // it while it held only a text glyph.
    overflow: 'hidden',
    marginLeft: -12,
    zIndex: 1,
  },
  pitchAvatarImg: { width: '100%', height: '100%' },
  pitchAvatarInitial: font('extrabold', 24, { color: palette.white }),
  /* One figure, not a pair: this circle is the single empty seat, and
     🧑‍🤝‍🧑 rendered as two people so the cluster read as three. Held slightly
     transparent so the filled seat opposite stays the dominant one. */
  /* The app's own 3D couple mark fills the empty seat.
     `cover` at 100%, not `contain` at 72%: logo.png is RGB with no alpha, so at
     72% it rendered as a green SQUARE sitting inside the round ring. Filling the
     container lets `overflow: hidden` above clip it to a circle like any avatar
     photo. Slightly under full opacity so the filled seat opposite stays the
     dominant one. */
  pitchPartnerLogo: { width: '100%', height: '100%', opacity: 0.9 },
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
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  featurePillEmoji: { fontSize: 11 },
  pitchCouple: { fontSize: 19 },
  featurePillText: font('bold', 10, { color: palette.white }),
  ctaButton: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButton: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    borderRadius: radius['2xl'],
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  joinRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: {
    // `minHeight` at render time — see `@/theme/fontScale`. A code field that
    // cannot grow crops the code the athlete is typing into it.
    flex: 1,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    ...font('extrabold', 16, { color: palette.ink }),
    letterSpacing: 2,
  },
  joinButton: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    paddingHorizontal: 20,
    borderRadius: radius['2xl'],
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bonusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.amber100,
    borderRadius: radius['2xl'],
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  bonusTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: palette.amber50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bonusTitle: font('bold', 14, { color: palette.ink }),
  bonusText: { ...font('medium', 12.5, { color: palette.grey700 }), marginTop: 1, lineHeight: 17 },
});
