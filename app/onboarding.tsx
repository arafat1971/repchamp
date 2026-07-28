import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreathingImage, CountUp, Floating, StaggerIn } from '@/components/motion';
import { BarChart } from '@/components/charts/BarChart';
import { GrowthChart } from '@/components/charts/GrowthChart';
import { ProgressRing } from '@/components/session/ProgressRing';
import { Card, PressableScale, PrimaryButton, ProgressBar } from '@/components/ui';
import { captureError } from '@/lib/crash';
import { OPPONENTS } from '@/domain/opponent';
import { track } from '@/lib/analytics';
import { fetchOffering, isPurchasesConfigured, purchase } from '@/services/purchases';
import { useProStore } from '@/state/proStore';
import {
  blockerAnswer,
  firstWeekPlan,
  firstWeekTarget,
  goalPlan,
  projectProgress,
  weeksToNextLeague,
  type Blocker,
  type FitnessLevel,
  type PlannedDay,
} from '@/domain/onboardingPlan';
import { isGoogleAuthConfigured, isGoogleCancel, signInWithGoogle } from '@/services/auth';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/**
 * Twelve-step onboarding, mirroring the design prototype.
 *
 * Steps are data rather than routes: the flow is linear, has a shared progress
 * bar, and must not be re-enterable from history, so a single screen with an
 * index is simpler and avoids a stack of dead routes behind the tabs.
 */
const TOTAL_PROGRESS_STEPS = 20;

// Onboarding media — the in-app demo clip and the illustrated value-screen art.
const DEMO_VIDEO = require('../assets/remove_text_bro_thought_202607272319.mp4');
const HERO_COUPLE = require('../assets/couple-hero.png');
const TROPHY_GOLD = require('../assets/trophy-gold.png');
const BADGE_VS = require('../assets/badge-vs.png');
const IC_PUSHUP = require('../assets/ic-pushup.png');
const FIRE_FLAME = require('../assets/fire-flame.png');
const IC_SCORE = require('../assets/ic-score32.png');

const GOALS = [
  { id: 'strength', emoji: '🏋️', label: 'Get Stronger', tint: palette.green50 },
  { id: 'reps', emoji: '#️⃣', label: 'Track My Reps', tint: palette.blue150 },
  { id: 'form', emoji: '✅', label: 'Improve Form', tint: palette.purple100 },
  { id: 'compete', emoji: '🏆', label: 'Compete With Others', tint: palette.amber50 },
] as const;

const LEVELS = [
  { id: 'new' as const, emoji: '🌱', label: 'Just starting', sub: 'New to this, or coming back after a long break' },
  { id: 'returning' as const, emoji: '💪', label: 'Getting back into it', sub: 'I train sometimes, but not consistently' },
  { id: 'regular' as const, emoji: '🔥', label: 'I train regularly', sub: 'Several times a week already' },
] as const;

const BLOCKERS = [
  { id: 'consistency' as const, emoji: '📆', label: 'I lose consistency', sub: 'I start strong, then drop off' },
  { id: 'motivation' as const, emoji: '😮‍💨', label: 'I lose motivation', sub: 'Training alone gets boring' },
  { id: 'time' as const, emoji: '⏰', label: 'I never have time', sub: 'The gym is a whole production' },
  { id: 'form' as const, emoji: '🤔', label: "I'm unsure about form", sub: "I don't know if I'm doing it right" },
] as const;

const BUILD_STEPS = [
  { icon: '👤', label: 'Setting up your profile', tint: palette.green50, at: 25 },
  { icon: '🎯', label: 'Calibrating your targets', tint: palette.blue150, at: 55 },
  { icon: '🤖', label: 'Preparing AI rep tracking', tint: palette.purple100, at: 82 },
  { icon: '🏆', label: 'Finding your league', tint: palette.amber50, at: 100 },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [level, setLevel] = useState<FitnessLevel | null>(null);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [weeklyGoal, setWeeklyGoal] = useState(4);
  const [buildPercent, setBuildPercent] = useState(0);
  const [plan, setPlan] = useState<'year' | 'month'>('year');

  const next = useCallback(() => setStep((s) => s + 1), []);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const finish = useCallback(() => {
    completeOnboarding({ username: username || 'champion', weeklyGoal, avatarUri });
    // Drop straight into a first practice set — the last tap of onboarding *is*
    // the start of the workout. Getting to a counted rep fast is the single
    // biggest lever on activation; landing on Home and hunting for a button is
    // exactly the friction we're removing. The Home tabs sit under it, so the
    // back-swipe from the session lands the athlete on their home as normal.
    router.replace('/(tabs)');
    router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
  }, [completeOnboarding, username, weeklyGoal, avatarUri, router]);

  /* Build-profile progress animation (step 10). */
  useEffect(() => {
    if (step !== 18) return;
    setBuildPercent(0);
    const id = setInterval(() => {
      setBuildPercent((p) => {
        if (p >= 100) {
          clearInterval(id);
          setTimeout(() => setStep((s) => (s === 18 ? 19 : s)), 650);
          return 100;
        }
        return p + 2;
      });
    }, 60);
    return () => clearInterval(id);
  }, [step]);

  const pickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
  }, []);

  // Hidden once the profile build takes over (13) — from there the flow is
  // automated and the paywall owns the screen.
  const showProgressBar = step > 0 && step < 18;
  const progressPercent = Math.round((Math.min(step, TOTAL_PROGRESS_STEPS) / TOTAL_PROGRESS_STEPS) * 100);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {showProgressBar ? (
        <View style={styles.progressRow}>
          <PressableScale
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <ProgressBar percent={progressPercent} height={6} />
          </View>
        </View>
      ) : null}

      <Animated.View key={step} entering={FadeInDown.duration(420)} style={styles.stepWrap}>
        {step === 0 ? <Welcome onNext={next} onTryNow={finish} /> : null}
        {step === 1 ? <Showcase onNext={next} /> : null}
        {step === 2 ? (
          <ValueScreen
            eyebrow="AI REP COUNTING"
            eyebrowTint={palette.green50}
            title="Every rep, counted for you"
            body="On-device pose tracking follows your body and counts each clean rep the moment you do it."
            points={[
              { icon: '🎯', title: 'Real-time count', sub: 'Reps tick up as you move' },
              { icon: '📐', title: 'Form feedback', sub: 'Depth and tempo, checked live' },
              { icon: '🔒', title: 'Private by design', sub: 'Video never leaves your phone' },
            ]}
            visual={
              <Floating distance={7}>
                <View style={styles.valueBubbleGreen}>
                  <Image source={IC_PUSHUP} style={styles.valueBubbleImg} contentFit="contain" />
                </View>
              </Floating>
            }
            onNext={next}
          />
        ) : null}
        {step === 3 ? (
          <ValueScreen
            eyebrow="TRAIN AS TWO"
            eyebrowTint="#ffe4e6"
            title="Nobody quits alone"
            body="Pair up and your streak becomes theirs too. Skipping stops being a private decision."
            points={[
              { icon: '💞', title: 'Couple mode', sub: 'One shared streak, two phones' },
              { icon: '⚔️', title: 'Live duels', sub: 'Race a rival rep-for-rep' },
              { icon: '🔥', title: 'One shared streak', sub: 'Break it and you both lose it' },
            ]}
            visual={
              <View style={styles.valueCoupleWrap}>
                <Image source={HERO_COUPLE} style={styles.valueCoupleImg} contentFit="cover" />
                <Floating distance={6} delay={300} style={styles.valueBadgeVs}>
                  <Image source={BADGE_VS} style={{ width: 46, height: 46 }} contentFit="contain" />
                </Floating>
              </View>
            }
            onNext={next}
          />
        ) : null}
        {step === 4 ? (
          <ValueScreen
            eyebrow="CLIMB THE RANKS"
            eyebrowTint={palette.amber50}
            title="Every rep counts for something"
            body="Sets earn XP, XP moves you up a league, and the board resets every Monday. There is always something to chase."
            points={[
              { icon: '🏆', title: 'Weekly leagues', sub: 'Bronze to the top tier' },
              { icon: '⚡', title: 'Earn XP', sub: 'Every rep moves you up' },
              { icon: '📈', title: 'Track progress', sub: 'Personal bests, week over week' },
            ]}
            visual={<ProgressChartVisual />}
            onNext={next}
          />
        ) : null}
        {step === 5 ? (
          <Username
            value={username}
            error={usernameError}
            onChange={(v) => {
              setUsername(v.replace(/[^a-zA-Z0-9]/g, ''));
              setUsernameError(false);
            }}
            onNext={() => {
              if (!username) {
                setUsernameError(true);
                return;
              }
              next();
            }}
          />
        ) : null}
        {step === 6 ? (
          <Photo username={username} avatarUri={avatarUri} onPick={pickPhoto} onNext={next} />
        ) : null}
        {step === 7 ? (
          <Goal
            selected={goal}
            onSelect={(id) => {
              setGoal(id);
              next();
            }}
          />
        ) : null}
        {step === 8 ? (
          <Frequency value={weeklyGoal} onChange={setWeeklyGoal} onNext={next} />
        ) : null}
        {/* Two qualifying questions — both genuinely change what follows: the
            level scales the first-week target, the blocker picks which feature
            the app leads with. */}
        {step === 9 ? (
          <QuestionStep
            eyebrow="YOUR STARTING POINT"
            eyebrowTint={palette.green50}
            title="Where are you starting?"
            body="So your first week is a challenge, not a wall."
            options={LEVELS}
            selected={level}
            onSelect={(id) => {
              setLevel(id);
              next();
            }}
          />
        ) : null}
        {step === 10 ? (
          <QuestionStep
            eyebrow="THE HONEST ONE"
            eyebrowTint={palette.amber50}
            title="What usually stops you?"
            body="Everyone has something. Yours decides what we put front and centre."
            options={BLOCKERS}
            selected={blocker}
            onSelect={(id) => {
              setBlocker(id);
              next();
            }}
          />
        ) : null}
        {/* The answer to what they just told us blocks them. */}
        {step === 11 ? <YourAntidote blocker={blocker} onNext={next} /> : null}
        {step === 12 ? <AiCoach onNext={next} /> : null}
        {step === 13 ? <CoupleMode onNext={next} /> : null}
        {/* Personalised trio — each reflects the answers just given, turning
            them into a concrete plan instead of discarding them. */}
        {step === 14 ? <YourPlan goal={goal} weeklyGoal={weeklyGoal} onNext={next} /> : null}
        {step === 15 ? (
          <YourProjection username={username} weeklyGoal={weeklyGoal} onNext={next} />
        ) : null}
        {step === 16 ? (
          <YourFirstWeek
            username={username}
            goal={goal}
            weeklyGoal={weeklyGoal}
            level={level}
            onNext={next}
          />
        ) : null}
        {step === 17 ? <Challenge username={username} onNext={() => setStep(18)} /> : null}
        {step === 18 ? <Building percent={buildPercent} /> : null}
        {step === 19 ? <Paywall plan={plan} onSelect={setPlan} onNext={next} /> : null}
        {step === 20 ? <Offer onDone={finish} /> : null}
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

function Welcome({ onNext, onTryNow }: { onNext: () => void; onTryNow: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Resolved once: whether a real Google sign-in can complete on this build.
  const googleReady = useMemo(() => isGoogleAuthConfigured(), []);

  const onGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
      onNext();
    } catch (error) {
      // A cancel is a deliberate user action, not an error worth surfacing.
      if (!isGoogleCancel(error)) {
        captureError(error);
        setAuthError("Couldn't sign in with Google. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, onNext]);

  return (
    <View style={styles.step}>
      <View style={styles.brandRow}>
        <LinearGradient colors={gradients.brandStrong} style={styles.brandMark}>
          <Text style={{ fontSize: 17 }}>👑</Text>
        </LinearGradient>
        <Text style={font('extrabold', 18, { color: palette.ink })}>RepChamp</Text>
      </View>
      <Text style={styles.tagline}>Compete. Improve. Win.</Text>

      <View style={styles.hero}>
        {/* Fills the panel rather than floating on it — the artwork carries its
            own backdrop, so letterboxing it would show two competing surfaces. */}
        <BreathingImage style={StyleSheet.absoluteFill}>
          <Image
            source={require('../assets/hero-couple.png')}
            style={styles.heroImage}
            contentFit="cover"
            transition={400}
            accessibilityLabel="Two athletes ready to train"
          />
        </BreathingImage>

        <Floating delay={120} style={styles.heroBadgeLeft}>
          <View style={styles.heroBadge}>
            <Text style={{ fontSize: 16 }}>🔥</Text>
            <View>
              <Text style={font('extrabold', 14, { color: palette.ink })}>12</Text>
              <Text style={styles.heroBadgeLabel}>DAY STREAK</Text>
            </View>
          </View>
        </Floating>

        <Floating delay={800} style={styles.heroBadgeRight}>
          <View style={styles.heroBadge}>
            <Text style={{ fontSize: 16 }}>🏆</Text>
            <View>
              <Text style={font('extrabold', 14, { color: palette.ink })}>Gold</Text>
              <Text style={styles.heroBadgeLabel}>LEAGUE</Text>
            </View>
          </View>
        </Floating>
      </View>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <Text style={[text.h1, { fontSize: 25 }]}>Ready to compete?</Text>
        <Text style={[text.body, styles.centeredCopy]}>
          Create your account to challenge friends and climb the leaderboard.
        </Text>
      </View>

      {/* Google is offered only when it can actually complete — an unconfigured
          project would throw on tap. Everyone gets the anonymous path below,
          which is the app's real entry point. */}
      <View style={{ gap: 11, marginTop: 16 }}>
        {googleReady ? (
          <SocialButton
            label={busy ? 'Signing in…' : 'Sign up with Google'}
            glyph="G"
            glyphColor="#4285F4"
            onPress={onGoogle}
          />
        ) : null}
        <PrimaryButton label="Create my account" onPress={onNext} />
      </View>

      {authError ? (
        <Text style={styles.authError} accessibilityLiveRegion="polite">
          {authError}
        </Text>
      ) : null}

      {/* Fast path for the impatient — a counted rep in seconds, no setup. The
          single highest-leverage escape hatch for activation. */}
      <Pressable onPress={onTryNow} accessibilityRole="button" style={styles.tryNow}>
        <Text style={font('extrabold', 14, { color: palette.green600 })}>
          Try a set now — no signup →
        </Text>
      </Pressable>
      <Text style={styles.legal}>
        By continuing, you agree to RepChamp&apos;s{' '}
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/modal/legal?tab=terms')}
          accessibilityRole="link"
        >
          Terms
        </Text>{' '}
        and{' '}
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/modal/legal')}
          accessibilityRole="link"
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

function SocialButton({
  label,
  glyph,
  glyphColor,
  onPress,
}: {
  label: string;
  glyph: string;
  glyphColor: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.socialButton}
    >
      <Text style={font('extrabold', 17, { color: glyphColor })}>{glyph}</Text>
      <Text style={font('extrabold', 15, { color: palette.ink })}>{label}</Text>
    </PressableScale>
  );
}

/**
 * See-it-in-action screen — the demo clip playing inside a realistic phone
 * frame. The single most persuasive onboarding beat: the athlete watches reps
 * count themselves before being asked to do anything.
 */
function Showcase({ onNext }: { onNext: () => void }) {
  const player = useVideoPlayer(DEMO_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)}>
        <View style={styles.showcaseEyebrowRow}>
          <View style={styles.liveDot} />
          <Text style={styles.showcaseEyebrow}>SEE IT IN ACTION</Text>
        </View>
        <Text style={[text.h1, { fontSize: 28, textAlign: 'center' }]}>Just point and go</Text>
        <Text style={[text.body, styles.centeredCopy]}>
          Your camera counts every rep in real time — no taps, no wearables.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(600).delay(180)} style={styles.phoneWrap}>
        <Floating distance={5} duration={3600}>
          <View style={styles.phoneFrame}>
            <View style={styles.phoneNotch} />
            <View style={styles.phoneScreen}>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
              />
            </View>
          </View>
        </Floating>
      </Animated.View>

      <PrimaryButton label="Continue" onPress={onNext} />
    </View>
  );
}

/**
 * A reusable "value screen" — one big illustrated hook, a headline, a short
 * supporting line, and a bulleted proof stack. Three of these carry the app's
 * three pillars (AI counting, couple/versus, leaderboard).
 */
function ValueScreen({
  eyebrow,
  eyebrowTint,
  title,
  body,
  points,
  visual,
  onNext,
  cta = 'Continue',
}: {
  eyebrow: string;
  eyebrowTint: string;
  title: string;
  body: string;
  points: { icon: string; title: string; sub: string }[];
  visual: React.ReactNode;
  onNext: () => void;
  cta?: string;
}) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: eyebrowTint }]}>
          <Text style={styles.valueEyebrowText}>{eyebrow}</Text>
        </View>
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>{title}</Text>
        <Text style={[text.body, styles.centeredCopy]}>{body}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(600).delay(150)} style={styles.valueVisual}>
        {visual}
      </Animated.View>

      <View style={{ gap: 12, marginBottom: 22 }}>
        {points.map((p, i) => (
          <StaggerIn key={p.title} index={i} step={90}>
            <View style={styles.valuePoint}>
              <View style={styles.valuePointIcon}>
                <Text style={{ fontSize: 17 }}>{p.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 14, { color: palette.ink })}>{p.title}</Text>
                <Text style={text.captionMd}>{p.sub}</Text>
              </View>
            </View>
          </StaggerIn>
        ))}
      </View>

      <PrimaryButton label={cta} onPress={onNext} />
    </View>
  );
}

/**
 * The "Compete and climb" visual — an iOS-style XP-growth card. A smooth curve
 * draws itself in over a soft gradient area (Health/Fitness style), framed as
 * weekly XP climbing, with a live "+this week" stat and a small trophy accent.
 * Turns the abstract "track progress" promise into something the eye reads
 * instantly.
 */
function ProgressChartVisual() {
  const XP_TREND = [120, 180, 160, 260, 320, 300, 440];

  return (
    <View style={styles.chartCardWrap}>
      <Card style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartEyebrow}>WEEKLY XP</Text>
            <Text style={font('extrabold', 24, { color: palette.ink })}>
              +1,240<Text style={font('extrabold', 13, { color: palette.grey600 })}> this week</Text>
            </Text>
          </View>
          <View style={styles.chartTrendPill}>
            <Text style={font('extrabold', 12, { color: palette.green700 })}>▲ 38%</Text>
          </View>
        </View>

        <GrowthChart data={XP_TREND} width={264} height={128} />

        <View style={styles.chartAxis}>
          {['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'Now'].map((l, i) => (
            <Text key={i} style={styles.chartAxisLabel}>
              {l}
            </Text>
          ))}
        </View>
      </Card>

      {/* Small trophy accent floating off the card corner keeps the league hook. */}
      <Floating distance={6} delay={300} style={styles.chartTrophy}>
        <Image source={TROPHY_GOLD} style={{ width: 54, height: 54 }} contentFit="contain" />
      </Floating>
    </View>
  );
}

function Username({
  value,
  error,
  onChange,
  onNext,
}: {
  value: string;
  error: boolean;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const valid = value.length >= 3;
  const borderColor = error ? palette.red500 : valid ? palette.green500 : palette.border;

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Text style={text.h1}>Pick your username</Text>
      <Text style={[text.body, { marginTop: 8 }]}>This is how other players will see you.</Text>

      <View style={[styles.usernameField, { borderColor }]}>
        <Text style={font('extrabold', 18, { color: palette.grey450 })}>@</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="username"
          placeholderTextColor={palette.grey450}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          accessibilityLabel="Username"
          style={styles.usernameInput}
        />
        {valid ? <Text style={{ color: palette.green600, fontSize: 18 }}>✓</Text> : null}
      </View>

      <Text style={[text.captionMd, { marginTop: 12 }]}>
        Letters and numbers only. No spaces or special characters.
      </Text>
      {error ? (
        <Text style={font('extrabold', 13, { color: palette.red500, marginTop: 10 })}>
          Username cannot be empty.
        </Text>
      ) : null}

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Continue" onPress={onNext} disabled={value.length === 0} />
    </View>
  );
}

function Photo({
  username,
  avatarUri,
  onPick,
  onNext,
}: {
  username: string;
  avatarUri: string | null;
  onPick: () => void;
  onNext: () => void;
}) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Text style={text.h1}>Add a profile photo</Text>
      <Text style={[text.body, { marginTop: 8 }]}>Add a photo to personalize your profile.</Text>

      <Card style={styles.photoPreview}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.photoAvatar} />
        ) : (
          <View style={[styles.photoAvatar, styles.photoPlaceholder]}>
            <Text style={font('extrabold', 26, { color: palette.green600 })}>
              {username ? username.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
        )}
        <View>
          <Text style={font('extrabold', 17, { color: palette.ink })}>
            @{username || 'champion'}
          </Text>
          <Text style={text.captionMd}>Profile preview</Text>
        </View>
      </Card>

      <PressableScale
        onPress={onPick}
        accessibilityRole="button"
        accessibilityLabel="Choose a photo from your library"
        style={styles.photoPicker}
      >
        <Text style={{ fontSize: 20 }}>🖼️</Text>
        <Text style={font('extrabold', 15, { color: palette.green600 })}>
          {avatarUri ? 'Photo added ✓' : 'Choose from library'}
        </Text>
      </PressableScale>

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Continue" onPress={onNext} />
      <Pressable onPress={onNext} accessibilityRole="button" style={styles.skip}>
        <Text style={font('extrabold', 14, { color: palette.grey600 })}>Skip for now</Text>
      </Pressable>
    </View>
  );
}

function Goal({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Text style={text.h1}>What&apos;s your main goal?</Text>
      <View style={{ gap: 12, marginTop: 24 }}>
        {GOALS.map((g) => (
          <PressableScale
            key={g.id}
            onPress={() => onSelect(g.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === g.id }}
            accessibilityLabel={g.label}
          >
            <Card style={styles.goalRow}>
              <View style={[styles.goalIcon, { backgroundColor: g.tint }]}>
                <Text style={{ fontSize: 19 }}>{g.emoji}</Text>
              </View>
              <Text style={[font('extrabold', 16, { color: palette.ink }), { flex: 1 }]}>
                {g.label}
              </Text>
              <View
                style={[
                  styles.radio,
                  selected === g.id && { borderColor: palette.green600, backgroundColor: palette.green600 },
                ]}
              />
            </Card>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function Frequency({
  value,
  onChange,
  onNext,
}: {
  value: number;
  onChange: (v: number) => void;
  onNext: () => void;
}) {
  const title =
    value <= 2 ? 'Easy does it' : value <= 4 ? 'Great habit' : value <= 6 ? 'On fire' : 'Elite mode';
  const note =
    value <= 2
      ? 'Perfect for building a routine'
      : value <= 4
        ? 'A sustainable, strong pace'
        : value <= 6
          ? 'Serious gains incoming'
          : 'Every single day — respect';

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Text style={text.h1}>How often do you want to train?</Text>
      <Text style={[text.body, { marginTop: 10 }]}>
        Pick a weekly goal that feels realistic — you can always adjust later.
      </Text>

      <Card style={styles.frequencyCard}>
        <View style={styles.frequencyIcon}>
          <Text style={{ fontSize: 22 }}>📅</Text>
        </View>
        <View style={styles.frequencyValue}>
          <Text style={font('extrabold', 56, { color: palette.green600 })}>{value}</Text>
          <Text style={font('extrabold', 17, { color: palette.ink })}>days per week</Text>
        </View>

        {/* Discrete steppers rather than a slider: 7 options don't need a
            continuous control, and tap targets are easier to hit than a thumb. */}
        <View style={styles.dayPicker}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <Pressable
              key={d}
              onPress={() => onChange(d)}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === d }}
              accessibilityLabel={`${d} days per week`}
              style={[styles.dayChip, value === d && styles.dayChipActive]}
            >
              <Text
                style={font('extrabold', 14, {
                  color: value === d ? palette.white : palette.grey600,
                })}
              >
                {d}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.frequencyNote}>
          <View style={styles.frequencyNoteIcon}>
            <Text style={{ fontSize: 18 }}>⚡</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font('extrabold', 15, { color: palette.ink })}>{title}</Text>
            <Text style={text.captionMd}>{note}</Text>
          </View>
        </View>
      </Card>

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Continue" onPress={onNext} />
    </View>
  );
}

/**
 * A single-select question step.
 *
 * Selecting advances immediately — an extra "Continue" tap on a question the
 * athlete has already answered is pure friction, and every extra tap in
 * onboarding costs completions.
 */
function QuestionStep<T extends string>({
  eyebrow,
  eyebrowTint,
  title,
  body,
  options,
  selected,
  onSelect,
}: {
  eyebrow: string;
  eyebrowTint: string;
  title: string;
  body: string;
  options: readonly { id: T; emoji: string; label: string; sub: string }[];
  selected: T | null;
  onSelect: (id: T) => void;
}) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: eyebrowTint }]}>
          <Text style={styles.valueEyebrowText}>{eyebrow}</Text>
        </View>
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>{title}</Text>
        <Text style={[text.body, styles.centeredCopy]}>{body}</Text>
      </Animated.View>

      <View style={{ gap: 12, marginTop: 26 }}>
        {options.map((option, i) => (
          <StaggerIn key={option.id} index={i} step={80}>
            <PressableScale
              onPress={() => onSelect(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === option.id }}
              accessibilityLabel={option.label}
            >
              <Card
                style={[
                  styles.questionRow,
                  selected === option.id && styles.questionRowActive,
                ]}
              >
                <View style={styles.questionIcon}>
                  <Text style={{ fontSize: 21 }}>{option.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={font('extrabold', 15.5, { color: palette.ink })}>
                    {option.label}
                  </Text>
                  <Text style={text.captionMd}>{option.sub}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selected === option.id && {
                      borderColor: palette.green600,
                      backgroundColor: palette.green600,
                    },
                  ]}
                />
              </Card>
            </PressableScale>
          </StaggerIn>
        ))}
      </View>
    </View>
  );
}

/**
 * Personalised #1 — reflects the goal just chosen back at the athlete, with the
 * specific app feature that serves it. Confirms "we heard you" at the exact
 * moment they've handed over their intent.
 */
function YourPlan({
  goal,
  weeklyGoal,
  onNext,
}: {
  goal: string | null;
  weeklyGoal: number;
  onNext: () => void;
}) {
  const plan = useMemo(() => goalPlan(goal), [goal]);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: palette.green50 }]}>
          <Text style={styles.valueEyebrowText}>YOUR PLAN</Text>
        </View>
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>{plan.title}</Text>
        <Text style={[text.body, styles.centeredCopy]}>{plan.blurb}</Text>
      </Animated.View>

      <View style={styles.planVisual}>
        <Floating distance={7}>
          <View style={styles.valueBubbleGreen}>
            <Text style={{ fontSize: 68 }}>{plan.emoji}</Text>
          </View>
        </Floating>
      </View>

      <View style={{ gap: 12, marginBottom: 22 }}>
        <StaggerIn index={0} step={90}>
          <View style={styles.valuePoint}>
            <View style={styles.valuePointIcon}>
              <Text style={{ fontSize: 17 }}>🎯</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font('extrabold', 14, { color: palette.ink })}>Your focus</Text>
              <Text style={text.captionMd}>{plan.focus}</Text>
            </View>
          </View>
        </StaggerIn>
        <StaggerIn index={1} step={90}>
          <View style={styles.valuePoint}>
            <View style={styles.valuePointIcon}>
              <Text style={{ fontSize: 17 }}>📅</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font('extrabold', 14, { color: palette.ink })}>Your schedule</Text>
              <Text style={text.captionMd}>
                {weeklyGoal} {weeklyGoal === 1 ? 'day' : 'days'} a week
              </Text>
            </View>
          </View>
        </StaggerIn>
      </View>

      <PrimaryButton label="Looks right" onPress={onNext} />
    </View>
  );
}

/**
 * Personalised #2 — projects the athlete's own six-week XP curve from the
 * frequency they picked, using the app's real XP and league thresholds. The
 * chart draws itself in, so the promise arrives as motion rather than a claim.
 */
function YourProjection({
  username,
  weeklyGoal,
  onNext,
}: {
  username: string;
  weeklyGoal: number;
  onNext: () => void;
}) {
  const weeks = useMemo(() => projectProgress(weeklyGoal, 6), [weeklyGoal]);
  const nextLeague = useMemo(() => weeksToNextLeague(weeklyGoal), [weeklyGoal]);
  const finalXp = weeks[weeks.length - 1]?.xp ?? 0;
  const league = weeks[0]?.league ?? 'Bronze';

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: palette.amber50 }]}>
          <Text style={styles.valueEyebrowText}>YOUR PROJECTION</Text>
        </View>
        <Text style={[text.h1, { fontSize: 26, textAlign: 'center' }]}>
          {username ? `${username}, here's` : "Here's"} your next 6 weeks
        </Text>
        <Text style={[text.body, styles.centeredCopy]}>
          Training {weeklyGoal} {weeklyGoal === 1 ? 'day' : 'days'} a week, this is the XP you
          stand to bank.
        </Text>
      </Animated.View>

      <View style={styles.projectionWrap}>
        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartEyebrow}>PROJECTED XP</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                {/* The number climbs rather than appearing — the XP total *is*
                    the promise, and watching it accumulate sells it far better
                    than a static figure ever could. */}
                <CountUp
                  value={finalXp}
                  delay={320}
                  duration={1200}
                  style={font('extrabold', 26, { color: palette.ink })}
                />
                <Text style={font('extrabold', 13, { color: palette.grey600 })}> by week 6</Text>
              </View>
            </View>
            <Floating distance={3} duration={2400}>
              <View style={styles.chartTrendPill}>
                <Text style={font('extrabold', 12, { color: palette.green700 })}>{league}</Text>
              </View>
            </Floating>
          </View>

          <GrowthChart data={weeks.map((w) => w.xp)} width={264} height={122} />

          <View style={styles.chartAxis}>
            {weeks.map((w) => (
              <Text key={w.week} style={styles.chartAxisLabel}>
                W{w.week}
              </Text>
            ))}
          </View>
        </Card>
      </View>

      {nextLeague ? (
        <StaggerIn index={0} step={140}>
          <View style={styles.projectionNote}>
            <Text style={{ fontSize: 18 }}>⬆️</Text>
            <Text style={[text.captionMd, { flex: 1 }]}>
              Add a session or two a week to climb into{' '}
              <Text style={font('extrabold', 12.5, { color: palette.green700 })}>
                {nextLeague.league}
              </Text>
              .
            </Text>
          </View>
        </StaggerIn>
      ) : null}

      {/* Conversion beat: the chart shows what they gain by starting; this line
          names what it costs to not. Loss aversion converts harder than a
          restatement of the upside, and the claim is true — the streak and
          weekly league both reset if they don't train. */}
      <StaggerIn index={1} step={140}>
        <View style={styles.commitRow}>
          <Text style={{ fontSize: 16 }}>🔥</Text>
          <Text style={[text.captionMd, { flex: 1 }]}>
            Your first session starts the streak. Miss a week and the league resets to Bronze.
          </Text>
        </View>
      </StaggerIn>

      <View style={{ flex: 1 }} />
      <PrimaryButton label={`Start my ${weeklyGoal}-day plan`} onPress={onNext} />
      <Text style={styles.commitFootnote}>Free to start · no card needed</Text>
    </View>
  );
}

/**
 * Personalised #3 — turns the plan into one concrete, committable first week.
 * A specific number ("120 push-ups across 4 sessions") converts far better than
 * an open-ended "start training", and it is a promise the app can actually keep.
 */
function YourFirstWeek({
  username,
  goal,
  weeklyGoal,
  level,
  onNext,
}: {
  username: string;
  goal: string | null;
  weeklyGoal: number;
  level: FitnessLevel | null;
  onNext: () => void;
}) {
  // Scaled by the level they reported, so the answer visibly shaped the plan.
  const target = useMemo(() => firstWeekTarget(weeklyGoal, level), [weeklyGoal, level]);
  const plan = useMemo(() => goalPlan(goal), [goal]);
  const week = useMemo(() => firstWeekPlan(weeklyGoal, level), [weeklyGoal, level]);
  const peak = useMemo(() => Math.max(...week.map((d) => d.target), 1), [week]);
  const opener = week.find((d) => d.first);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: palette.blue150 }]}>
          <Text style={styles.valueEyebrowText}>WEEK ONE</Text>
        </View>
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>
          {username ? `${username}, this is` : 'This is'} your week
        </Text>
        <Text style={[text.body, styles.centeredCopy]}>
          It starts easy at {opener?.target ?? 0} and builds to {peak}. Every day is one you can
          finish.
        </Text>
      </Animated.View>

      {/* The week as a real ladder — a visible ramp beats a flat "25 × 4",
          because the athlete can see the opening day is small and each step up
          is modest. Bars are the plan, not decoration. */}
      <View style={styles.weekWrap}>
        <View style={styles.weekRow}>
          {week.map((day, i) => (
            <WeekDayBar key={day.label} day={day} peak={peak} index={i} />
          ))}
        </View>

        <View style={styles.weekTotalRow}>
          <View style={styles.weekTotalLeft}>
            <Text style={styles.weekTotalLabel}>WEEK ONE TOTAL</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <CountUp
                value={target}
                delay={620}
                duration={900}
                style={font('extrabold', 30, { color: palette.ink })}
              />
              <Text style={font('extrabold', 14, { color: palette.grey600 })}> reps</Text>
            </View>
          </View>
          <View style={styles.weekBadge}>
            <Text style={{ fontSize: 15 }}>{plan.emoji}</Text>
            <Text style={font('extrabold', 10.5, { color: palette.green700 })}>{plan.focus}</Text>
          </View>
        </View>
      </View>

      <StaggerIn index={0} step={110}>
        <View style={styles.commitRow}>
          <Text style={{ fontSize: 16 }}>🔥</Text>
          <Text style={[text.captionMd, { flex: 1 }]}>
            Finish {opener?.label ?? 'day one'} and your streak is alive. Most people quit before
            the first rep — you&apos;re {opener?.target ?? 0} away.
          </Text>
        </View>
      </StaggerIn>

      <View style={{ flex: 1 }} />
      <PrimaryButton label={`Start day one — ${opener?.target ?? 0} reps`} onPress={onNext} />
      <Text style={styles.commitFootnote}>Takes about 2 minutes · no equipment</Text>
    </View>
  );
}

/**
 * One day in the first-week ladder: a bar whose height is that day's target,
 * growing up on mount so the week assembles itself. Rest days stay as a flat
 * dash — visible in the rhythm, but clearly not work.
 */
function WeekDayBar({ day, peak, index }: { day: PlannedDay; peak: number; index: number }) {
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = withDelay(
      160 + index * 70,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
  }, [grow, index]);

  const fraction = day.rest ? 0 : day.target / peak;
  const barStyle = useAnimatedStyle(() => ({
    height: Math.max(4, 84 * fraction * grow.value),
    opacity: 0.35 + 0.65 * grow.value,
  }));

  return (
    <View style={styles.weekDay}>
      <Text style={[styles.weekDayValue, day.rest && { color: palette.grey450 }]}>
        {day.rest ? '–' : day.target}
      </Text>
      <View style={styles.weekBarTrack}>
        {day.rest ? (
          <View style={styles.weekRestDash} />
        ) : (
          <Animated.View
            style={[
              styles.weekBar,
              day.first && styles.weekBarFirst,
              barStyle,
            ]}
          />
        )}
      </View>
      <Text style={[styles.weekDayLabel, day.first && styles.weekDayLabelFirst]}>
        {day.first ? 'TODAY' : day.label}
      </Text>
    </View>
  );
}

/**
 * The first rival — a real opponent from the roster, with their real pace.
 *
 * Deliberately framed as an invitation ("ready to race you") rather than a
 * received challenge: nobody has actually messaged this athlete, and a
 * fabricated notification would be discovered within minutes of reaching the
 * Friends tab. The AI badge matches how partners are labelled everywhere else
 * in the app. The hook is the concrete number — a pace you can measure yourself
 * against — which is stronger than an invented name anyway.
 */
/**
 * The app's answer to the blocker the athlete just named.
 *
 * Naming someone's obstacle back at them and pairing it with a real feature is
 * the moment onboarding stops feeling like a form and starts feeling built for
 * them — and every antidote here maps to something the app actually does.
 */
function YourAntidote({ blocker, onNext }: { blocker: Blocker | null; onNext: () => void }) {
  const answer = useMemo(() => blockerAnswer(blocker), [blocker]);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: palette.green50 }]}>
          <Text style={styles.valueEyebrowText}>WE BUILT FOR THIS</Text>
        </View>
        <Text style={[text.h1, { fontSize: 28, textAlign: 'center' }]}>{answer.title}</Text>
        <Text style={[text.body, styles.centeredCopy]}>{answer.blurb}</Text>
      </Animated.View>

      <View style={styles.antidoteVisual}>
        <Floating distance={8}>
          <View style={styles.antidoteBubble}>
            <Text style={{ fontSize: 74 }}>{answer.emoji}</Text>
          </View>
        </Floating>
      </View>

      <StaggerIn index={0} step={110}>
        <View style={styles.commitRow}>
          <Text style={{ fontSize: 16 }}>💡</Text>
          <Text style={[text.captionMd, { flex: 1 }]}>
            This is the one thing most fitness apps get wrong — and the reason people quit in week
            two.
          </Text>
        </View>
      </StaggerIn>

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Show me" onPress={onNext} />
    </View>
  );
}

/**
 * Couple mode — the app's most defensible hook and its viral loop.
 *
 * Pitched on the mechanic that actually makes it work: a streak neither of you
 * wants to be the one to break. Everything stated here is real — two phones,
 * one shared streak, live partner reps.
 */
function CoupleMode({ onNext }: { onNext: () => void }) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: '#ffe4e6' }]}>
          <Text style={styles.valueEyebrowText}>COUPLE MODE</Text>
        </View>
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>
          The streak you{'\n'}won&apos;t want to break
        </Text>
        <Text style={[text.body, styles.centeredCopy]}>
          Pair with your partner and you share one streak. Miss a day and you both lose it — which
          is exactly why it works.
        </Text>
      </Animated.View>

      <View style={styles.coupleVisual}>
        <LinearGradient colors={gradients.brandStrong} style={[styles.coupleCard, shadow.brand]}>
          <View style={styles.coupleFaces}>
            <Floating distance={5}>
              <View style={styles.coupleFace}>
                <Text style={{ fontSize: 30 }}>🏋️‍♂️</Text>
              </View>
            </Floating>
            {/* The flame is the link — it *is* the shared streak, which is the
                mechanic this screen is selling. */}
            <Floating distance={4} delay={200}>
              <Image source={FIRE_FLAME} style={styles.coupleLinkImg} contentFit="contain" />
            </Floating>
            <Floating distance={5} delay={400}>
              <View style={styles.coupleFace}>
                <Text style={{ fontSize: 30 }}>🤸‍♀️</Text>
              </View>
            </Floating>
          </View>
          <View style={styles.coupleStreakRow}>
            <Text style={{ fontSize: 22 }}>🔥</Text>
            <CountUp
              value={12}
              delay={420}
              duration={900}
              style={font('extrabold', 34, { color: palette.white })}
            />
            <Text style={styles.coupleStreakLabel}>day shared streak</Text>
          </View>
        </LinearGradient>
      </View>

      <View style={{ gap: 12, marginBottom: 18 }}>
        {[
          { icon: '📱', title: 'Two phones, one set', sub: "See each other's reps live" },
          { icon: '👋', title: 'Nudge them', sub: 'A tap sends a push to get them moving' },
          { icon: '🎁', title: 'Both get a free week', sub: 'Pair up and Pro unlocks for you both' },
        ].map((p, i) => (
          <StaggerIn key={p.title} index={i} step={90}>
            <View style={styles.valuePoint}>
              <View style={styles.valuePointIcon}>
                <Text style={{ fontSize: 17 }}>{p.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 14, { color: palette.ink })}>{p.title}</Text>
                <Text style={text.captionMd}>{p.sub}</Text>
              </View>
            </View>
          </StaggerIn>
        ))}
      </View>

      <PrimaryButton label="I want this" onPress={onNext} />
    </View>
  );
}

/**
 * The AI coach — the app's core technical claim, stated precisely.
 *
 * Every line here is verifiable in the codebase: a real pose model, live form
 * scoring on depth/tempo/alignment, and on-device processing where the camera
 * feed never leaves the phone. That last one is a genuine differentiator worth
 * leading on, and it is the strongest trust signal the app has.
 */
function AiCoach({ onNext }: { onNext: () => void }) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={[styles.valueEyebrow, { backgroundColor: palette.purple100 }]}>
          <Text style={styles.valueEyebrowText}>AI FORM COACH</Text>
        </View>
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>
          It watches every rep
        </Text>
        <Text style={[text.body, styles.centeredCopy]}>
          17 body points, tracked live. You get depth and tempo feedback mid-set — not a guess
          afterwards.
        </Text>
      </Animated.View>

      <View style={styles.coachVisual}>
        {/* Fixed-size stage so the cue chips and score badge anchor to the
            bubble. Positioned against the full-width container they drifted to
            the screen edges and the score clipped off-screen. */}
        <View style={styles.coachStage}>
          <Floating distance={7}>
            <View style={styles.coachBubble}>
              <Image source={IC_PUSHUP} style={styles.coachBubbleImg} contentFit="contain" />
            </View>
          </Floating>
          {/* Live-cue chips, the same coaching lines the session actually speaks. */}
          <Floating distance={5} delay={260} style={styles.coachCueTop}>
            <View style={styles.coachCue}>
              <Text style={font('extrabold', 11, { color: palette.green700 })}>Great depth!</Text>
            </View>
          </Floating>
          <Floating distance={5} delay={620} style={styles.coachCueBottom}>
            <View style={styles.coachCue}>
              <Text style={font('extrabold', 11, { color: palette.green700 })}>Keep the tempo</Text>
            </View>
          </Floating>
          {/* The real form-score badge, so the "scored 0–100" claim below is
              shown rather than merely asserted. */}
          <Floating distance={6} delay={880} style={styles.coachScore}>
            <Image source={IC_SCORE} style={{ width: 50, height: 50 }} contentFit="contain" />
          </Floating>
        </View>
      </View>

      <View style={{ gap: 12, marginBottom: 18 }}>
        {[
          { icon: '🎯', title: 'Form scored 0–100', sub: 'Range of motion, alignment, tempo' },
          { icon: '🔒', title: 'Video never leaves your phone', sub: 'Nothing is uploaded or recorded' },
          { icon: '⚡', title: 'No wearables, no setup', sub: 'Just prop up your phone and go' },
        ].map((p, i) => (
          <StaggerIn key={p.title} index={i} step={90}>
            <View style={styles.valuePoint}>
              <View style={styles.valuePointIcon}>
                <Text style={{ fontSize: 17 }}>{p.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 14, { color: palette.ink })}>{p.title}</Text>
                <Text style={text.captionMd}>{p.sub}</Text>
              </View>
            </View>
          </StaggerIn>
        ))}
      </View>

      <PrimaryButton label="Count my first rep" onPress={onNext} />
    </View>
  );
}

function Challenge({ username, onNext }: { username: string; onNext: () => void }) {
  const rival = OPPONENTS[0]!;
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const boltStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.16 }],
    opacity: 0.75 + pulse.value * 0.25,
  }));

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <View style={styles.challengeChip}>
        <Text style={font('extrabold', 11, { color: palette.green600 })}>FIRST RIVAL</Text>
      </View>
      <Text style={[text.h1, { fontSize: 29, marginTop: 14, textAlign: 'center' }]}>
        {rival.name} is ready{'\n'}to race you
      </Text>
      <Text style={[text.body, styles.centeredCopy]}>
        He holds {rival.repsPerMinute} reps a minute. Beat his pace and the XP is yours.
      </Text>

      <View style={styles.versusRow}>
        <View style={styles.rivalCol}>
          <View style={[styles.versusAvatar, { backgroundColor: palette.purple100 }]}>
            <Text style={font('extrabold', 28, { color: rival.color })}>{rival.initial}</Text>
          </View>
          <View style={styles.aiTag}>
            <Text style={font('extrabold', 8, { color: palette.green700 })}>AI</Text>
          </View>
          <Text style={styles.rivalName}>{rival.name}</Text>
          <Text style={styles.rivalPace}>{rival.repsPerMinute}/min</Text>
        </View>

        <Animated.Text style={[{ fontSize: 30 }, boltStyle]}>⚡</Animated.Text>

        <View style={styles.rivalCol}>
          <View style={[styles.versusAvatar, { backgroundColor: palette.green50 }]}>
            <Text style={font('extrabold', 26, { color: palette.green700 })}>
              {(username || 'You').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.rivalName}>{username || 'You'}</Text>
          <Text style={styles.rivalPace}>your pace</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />
      <PrimaryButton label={`Race ${rival.name}`} onPress={onNext} />
      <Pressable onPress={onNext} accessibilityRole="button" style={styles.declineButton}>
        <Text style={font('extrabold', 15, { color: palette.ink })}>Not right now</Text>
      </Pressable>
    </View>
  );
}

function Building({ percent }: { percent: number }) {
  return (
    <View style={[styles.step, styles.stepPadded, { alignItems: 'center' }]}>
      <ProgressRing
        percent={percent}
        size={128}
        strokeWidth={9}
        color={palette.green500}
        trackColor={palette.border}
      >
        <LinearGradient colors={[palette.green400, palette.green600]} style={styles.buildBadge}>
          <Text style={{ fontSize: 34 }}>💪</Text>
        </LinearGradient>
      </ProgressRing>

      <Text style={font('extrabold', 18, { color: palette.green600, marginTop: 12 })}>
        {percent}%
      </Text>
      <Text style={[text.h1, { fontSize: 28, marginTop: 12 }]}>Building Your Profile</Text>
      <Text style={[text.body, { marginTop: 8 }]}>Personalizing RepChamp just for you.</Text>

      <Card style={styles.buildList}>
        {BUILD_STEPS.map((item, index) => {
          const previous = index === 0 ? 0 : BUILD_STEPS[index - 1]!.at;
          const done = percent > item.at || (item.at === 100 && percent >= 100);
          const active = percent > previous && !done;

          return (
            <View key={item.label} style={styles.buildRow}>
              <View style={[styles.buildIcon, { backgroundColor: item.tint }]}>
                <Text style={{ fontSize: 18 }}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 15, { color: palette.ink })}>{item.label}</Text>
                <Text
                  style={font('bold', 11, {
                    color: done ? palette.green600 : palette.grey600,
                  })}
                >
                  {done ? 'Done' : active ? 'Working…' : 'Queued'}
                </Text>
              </View>
              {done ? (
                <View style={styles.buildCheck}>
                  <Text style={{ color: palette.white, fontSize: 14 }}>✓</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {/* Projected trend — the bars grow in as the profile builds, turning the
          wait into a preview of the progress the athlete is signing up for. */}
      {percent > 40 ? (
        <Animated.View entering={FadeInUp.duration(500)} style={styles.projectionCard}>
          <View style={styles.projectionHeader}>
            <Text style={font('extrabold', 13, { color: palette.ink })}>
              Your projected 6-week climb
            </Text>
            <View style={styles.chartTrendPill}>
              <Text style={font('extrabold', 11, { color: palette.green700 })}>▲ ON TRACK</Text>
            </View>
          </View>
          <BarChart
            data={[40, 90, 150, 210, 300, 420]}
            labels={['W1', 'W2', 'W3', 'W4', 'W5', 'W6']}
            height={104}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Paywall({
  plan,
  onSelect,
  onNext,
}: {
  plan: 'year' | 'month';
  onSelect: (p: 'year' | 'month') => void;
  onNext: () => void;
}) {
  const timeline = [
    {
      icon: '🔓',
      color: palette.green600,
      title: 'Today',
      body: 'Unlock all RepChamp features like unlimited duels, advanced stats, and more.',
    },
    {
      icon: '🔔',
      color: palette.green500,
      title: 'In 2 Days — Reminder',
      body: "We'll remind you before your trial ends if you've allowed notifications.",
    },
    {
      icon: '👑',
      color: palette.amber500,
      title: 'In 3 Days — Billing Starts',
      body: 'You can cancel any time before then.',
    },
  ];

  return (
    <ScrollView
      style={styles.step}
      contentContainerStyle={[styles.stepPadded, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Trophy anchors the offer in the reward rather than the price — the
          first thing the eye lands on is what they're buying, not the cost. */}
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <Floating distance={7}>
          <Image source={TROPHY_GOLD} style={styles.paywallTrophy} contentFit="contain" />
        </Floating>
        <View style={[styles.valueEyebrow, { backgroundColor: palette.amber50, marginTop: 6 }]}>
          <Text style={styles.valueEyebrowText}>3 DAYS FREE</Text>
        </View>
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>
          Everything unlocked,{'\n'}nothing to pay today
        </Text>
        <Text style={[text.body, styles.centeredCopy]}>
          Cancel any time in the first three days and you won&apos;t be charged.
        </Text>
      </Animated.View>

      <View style={{ marginTop: 24, gap: 2 }}>
        {timeline.map((t, i) => (
          <StaggerIn key={t.title} index={i} step={110} style={styles.timelineRow}>
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.timelineDot, { backgroundColor: t.color }]}>
                <Text style={{ fontSize: 18 }}>{t.icon}</Text>
              </View>
              {i < timeline.length - 1 ? (
                <View
                  style={[
                    styles.timelineLine,
                    { backgroundColor: i === 0 ? palette.green600 : palette.border },
                  ]}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 14 }}>
              <Text style={font('extrabold', 16, { color: palette.ink })}>{t.title}</Text>
              <Text style={text.captionMd}>{t.body}</Text>
            </View>
          </StaggerIn>
        ))}
      </View>

      <PlanOption
        selected={plan === 'year'}
        onPress={() => onSelect('year')}
        title="Yearly"
        subtitle="billed annually"
        price="34,99 €/yr"
        ribbon="3 DAYS FREE"
      />
      <PlanOption
        selected={plan === 'month'}
        onPress={() => onSelect('month')}
        title="Monthly"
        subtitle="billed monthly"
        price="8,99 €/mo"
      />

      <Text style={styles.noPayment}>✓ No Payment Due Now</Text>
      <PrimaryButton label="Start Free Trial" onPress={onNext} />
      <Text style={[text.captionMd, { textAlign: 'center', marginTop: 12 }]}>
        {plan === 'year'
          ? '3 days free, then 34,99 €/year. Cancel anytime.'
          : '8,99 €/month. Cancel anytime.'}
      </Text>
    </ScrollView>
  );
}

function PlanOption({
  selected,
  onPress,
  title,
  subtitle,
  price,
  ribbon,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  price: string;
  ribbon?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${price}`}
      style={[
        styles.planOption,
        { borderColor: selected ? palette.green500 : palette.border },
        ribbon ? { marginTop: 20 } : { marginTop: 12 },
      ]}
    >
      {ribbon ? (
        <View style={styles.ribbon}>
          <Text style={font('extrabold', 10, { color: palette.white })}>{ribbon}</Text>
        </View>
      ) : null}
      <View style={[styles.radio, selected && { borderColor: palette.green600, backgroundColor: palette.green600 }]}>
        {selected ? <Text style={{ color: palette.white, fontSize: 13 }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={font('extrabold', 16, { color: palette.ink })}>{title}</Text>
        <Text style={text.caption}>{subtitle}</Text>
      </View>
      <Text style={font('extrabold', 16, { color: palette.ink })}>{price}</Text>
    </PressableScale>
  );
}

/**
 * Closing offer — the annual plan at its real store price.
 *
 * Everything shown here comes from the live RevenueCat offering and the button
 * runs a real purchase: a "Start Free Trial" control that starts no trial, or a
 * hardcoded price that disagrees with what the store charges, is both an App
 * Review rejection and a promise the app cannot keep. When billing isn't
 * configured yet the screen degrades to a plain finish step rather than showing
 * an offer that cannot be taken.
 */
function Offer({ onDone }: { onDone: () => void }) {
  const setPro = useProStore((s) => s.setPro);
  const [annual, setAnnual] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const billingReady = isPurchasesConfigured();

  useEffect(() => {
    if (!billingReady) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchOffering()
      .then((offering) => {
        if (cancelled) return;
        const pkgs = offering?.availablePackages ?? [];
        setAnnual(pkgs.find((p) => p.packageType === 'ANNUAL') ?? pkgs[0] ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) captureError(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [billingReady]);

  const onStart = useCallback(async () => {
    if (!annual || busy) return;
    setBusy(true);
    const result = await purchase(annual);
    setBusy(false);
    if (result.cancelled) return;
    if (result.ok && result.isPro) {
      setPro(true);
      track('subscribed', { plan: annual.packageType });
      onDone();
      return;
    }
    Alert.alert('Purchase failed', result.message ?? 'Please try again.');
  }, [annual, busy, setPro, onDone]);

  // No live offer to show — finish onboarding rather than fake a discount.
  const showOffer = billingReady && annual !== null;

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Pressable
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Close offer"
        style={styles.closeButton}
      >
        <Text style={{ fontSize: 16, color: palette.ink }}>✕</Text>
      </Pressable>

      <Text style={[text.h1, { fontSize: 27, textAlign: 'center', marginTop: 6 }]}>
        {showOffer ? 'Unlock everything' : "You're all set"}
      </Text>

      <View style={styles.offerMiddle}>
        {loading ? (
          <ActivityIndicator color={palette.green500} />
        ) : showOffer ? (
          <>
            <LinearGradient
              colors={[palette.green400, palette.green600]}
              style={styles.offerBadge}
            >
              <Text style={{ fontSize: 44 }}>👑</Text>
              <Text style={font('extrabold', 18, { color: palette.white, marginTop: 2 })}>
                PRO
              </Text>
            </LinearGradient>
            {/* The store's own localised price string — never a hardcoded figure. */}
            <Text style={font('extrabold', 22, { color: palette.ink, marginTop: 26 })}>
              {annual.product.priceString}
            </Text>
            <Text style={[text.captionMd, { marginTop: 6, textAlign: 'center' }]}>
              {annual.product.description || 'Full access to every exercise and programme.'}
            </Text>
          </>
        ) : (
          <>
            {/* Trophy over an emoji: the screen otherwise reads as a blank page
                with a stray glyph, which is a weak note to end onboarding on. */}
            <Floating distance={8}>
              <View style={styles.offerReadyBubble}>
                <Image source={TROPHY_GOLD} style={{ width: 108, height: 108 }} contentFit="contain" />
              </View>
            </Floating>
            <Text style={font('extrabold', 19, { color: palette.ink, marginTop: 22 })}>
              Your plan is ready
            </Text>
            <Text style={[text.body, styles.centeredCopy]}>
              First session takes about two minutes. No equipment needed.
            </Text>
          </>
        )}
      </View>

      {showOffer ? (
        <>
          <PrimaryButton
            label={busy ? 'Starting…' : 'Start free trial'}
            onPress={() => void onStart()}
            disabled={busy}
          />
          <Pressable onPress={onDone} accessibilityRole="button" style={styles.skip}>
            <Text style={font('extrabold', 14, { color: palette.grey600 })}>Maybe later</Text>
          </Pressable>
        </>
      ) : (
        <PrimaryButton label="Start training" onPress={onDone} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 8,
    zIndex: 5,
  },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backGlyph: { fontSize: 15, color: palette.ink, lineHeight: 18 },
  stepWrap: { flex: 1 },
  step: { flex: 1, paddingHorizontal: 22, paddingBottom: 26 },
  stepPadded: { paddingTop: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: { ...text.caption, fontSize: 13, textAlign: 'center', marginTop: 6 },
  hero: {
    flex: 1,
    minHeight: 0,
    borderRadius: 30,
    marginTop: 14,
    backgroundColor: palette.inkSoft,
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: '100%' },
  heroBadgeLeft: { position: 'absolute', top: 16, left: 16, zIndex: 2 },
  heroBadgeRight: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.white,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 16,
    ...shadow.card,
  },
  heroBadgeLabel: {
    ...font('bold', 8, { color: palette.grey600 }),
    letterSpacing: 0.5,
  },
  centeredCopy: { textAlign: 'center', marginTop: 8, maxWidth: 300, alignSelf: 'center' },

  // Showcase (demo video in a phone frame)
  showcaseEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 8,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green500 },
  showcaseEyebrow: {
    ...font('extrabold', 11, { color: palette.green600 }),
    letterSpacing: 2.5,
  },
  phoneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phoneFrame: {
    width: 208,
    height: 420,
    borderRadius: 40,
    backgroundColor: '#0c110d',
    padding: 8,
    borderWidth: 2,
    borderColor: '#20302a',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 14,
  },
  phoneNotch: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 78,
    height: 20,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#0c110d',
    zIndex: 2,
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  // Value screens
  valueEyebrow: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  valueEyebrowText: {
    ...font('extrabold', 10.5, { color: palette.green700 }),
    letterSpacing: 2,
  },
  valueVisual: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 150 },
  valuePoint: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  valuePointIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBubbleGreen: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },
  valueBubbleImg: { width: 138, height: 138 },
  valueCoupleWrap: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  valueCoupleImg: {
    width: 268,
    height: 190,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
    shadowColor: '#0b2313',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 6,
  },
  valueBadgeVs: { position: 'absolute', top: 4, right: 44 },
  // Progress-chart value visual (step 4)
  chartCardWrap: { width: '100%', alignItems: 'center' },
  chartCard: {
    width: '100%',
    maxWidth: 320,
    padding: 18,
    borderRadius: radius['4xl'],
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  chartEyebrow: {
    ...font('extrabold', 10, { color: palette.grey600 }),
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  chartTrendPill: {
    backgroundColor: palette.green50,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  chartAxisLabel: { ...font('bold', 9.5, { color: palette.grey450 }) },
  chartTrophy: { position: 'absolute', top: -22, right: 2, zIndex: 3 },

  // Personalised plan / projection / first-week screens
  planVisual: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 150 },
  projectionWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  projectionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.green50,
    borderRadius: radius.xl,
    padding: 14,
    marginTop: 4,
  },
  commitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.amber50,
    borderRadius: radius.xl,
    padding: 13,
    marginTop: 10,
  },
  paywallTrophy: { width: 92, height: 92 },
  commitFootnote: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginTop: 10,
  },
  // Question steps
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  questionRowActive: { borderColor: palette.green500, borderWidth: 1.5 },
  questionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Antidote screen
  antidoteVisual: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 170 },
  antidoteBubble: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },

  // Couple mode screen
  coupleVisual: { alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 4 },
  coupleCard: {
    width: '100%',
    borderRadius: radius['5xl'],
    paddingVertical: 22,
    alignItems: 'center',
  },
  coupleFaces: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coupleFace: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coupleLinkImg: { width: 40, height: 40 },
  coachScore: { position: 'absolute', bottom: 14, right: -4 },
  coupleStreakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  coupleStreakLabel: { ...font('extrabold', 13, { color: 'rgba(240,255,244,0.92)' }) },

  // AI coach screen
  coachVisual: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  /** Bubble-sized frame the cue chips and score badge position against. */
  coachStage: { width: 216, height: 200, alignItems: 'center', justifyContent: 'center' },
  coachBubbleImg: { width: 150, height: 150 },
  coachBubble: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: palette.purple100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 8,
  },
  coachCue: {
    backgroundColor: palette.white,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...shadow.card,
  },
  coachCueTop: { position: 'absolute', top: 4, right: -10 },
  coachCueBottom: { position: 'absolute', bottom: 26, left: -12 },

  // First-week ladder
  weekWrap: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    marginTop: 18,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  weekDay: { flex: 1, alignItems: 'center' },
  weekDayValue: { ...font('extrabold', 12, { color: palette.ink }), marginBottom: 6 },
  weekBarTrack: { height: 88, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  weekBar: {
    width: '68%',
    borderRadius: 7,
    backgroundColor: palette.green400,
    minHeight: 4,
  },
  // The opening day is the one they act on today, so it carries the brand colour.
  weekBarFirst: { backgroundColor: palette.green600 },
  weekRestDash: { width: '52%', height: 3, borderRadius: 2, backgroundColor: palette.divider },
  weekDayLabel: { ...font('bold', 9.5, { color: palette.grey600 }), marginTop: 7 },
  weekDayLabelFirst: { ...font('extrabold', 9.5, { color: palette.green700 }), letterSpacing: 0.4 },
  weekTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: palette.divider,
  },
  weekTotalLeft: { gap: 1 },
  weekTotalLabel: {
    ...font('extrabold', 9.5, { color: palette.grey600 }),
    letterSpacing: 1.6,
  },
  weekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.green50,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    maxWidth: 150,
  },


  // Projected-climb bar chart (Building step)
  projectionCard: {
    width: '100%',
    backgroundColor: palette.white,
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    marginTop: 18,
  },
  projectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  socialButton: {
    height: 54,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  authError: {
    ...font('bold', 12.5, { color: palette.red500 }),
    textAlign: 'center',
    marginTop: 10,
  },
  legal: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
  legalLink: {
    color: palette.grey600,
    textDecorationLine: 'underline',
  },
  exerciseTile: {
    flex: 1,
    borderRadius: radius['5xl'],
    padding: 18,
    height: 210,
    justifyContent: 'space-between',
  },
  usernameField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderRadius: radius['2xl'],
    paddingHorizontal: 18,
    height: 60,
    ...shadow.card,
  },
  usernameInput: {
    flex: 1,
    ...font('bold', 17, { color: palette.ink }),
  },
  photoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    marginTop: 22,
  },
  photoAvatar: { width: 64, height: 64, borderRadius: 32 },
  photoPlaceholder: {
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    backgroundColor: palette.green50,
    borderRadius: radius.xl,
    padding: 18,
  },
  skip: { alignItems: 'center', marginTop: 12, padding: 8 },
  tryNow: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  goalIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiVisual: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aiPoint: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiPointIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frequencyCard: { padding: 26, marginTop: 24, borderRadius: radius['6xl'] },
  frequencyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  frequencyValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
  },
  dayPicker: { flexDirection: 'row', gap: 6, marginTop: 22 },
  dayChip: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: palette.green500 },
  frequencyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f1f7f2',
    borderRadius: radius.xl,
    padding: 14,
    marginTop: 20,
  },
  frequencyNoteIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyRow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  challengeChip: {
    alignSelf: 'center',
    backgroundColor: palette.green50,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  versusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginVertical: 26,
  },
  versusAvatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rivalCol: { alignItems: 'center', gap: 2 },
  // Matches the AI pill used on the Arena leaderboard, so a labelled partner
  // reads the same everywhere in the app.
  aiTag: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 6,
  },
  rivalName: { ...font('extrabold', 14, { color: palette.ink }), marginTop: 4 },
  rivalPace: { ...font('bold', 11, { color: palette.grey600 }) },
  declineButton: {
    marginTop: 10,
    height: 54,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radius['3xl'],
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildBadge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildList: { width: '100%', paddingHorizontal: 16, paddingVertical: 8, marginTop: 26 },
  buildRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  buildIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.green600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineRow: { flexDirection: 'row', gap: 14 },
  timelineDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: { width: 3, flex: 1, minHeight: 26 },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2,
    borderRadius: radius['2xl'],
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: palette.white,
  },
  ribbon: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    left: 0,
    right: 0,
    marginHorizontal: 'auto',
    backgroundColor: palette.green500,
    paddingVertical: 3,
    paddingHorizontal: 12,
    borderRadius: 12,
    width: 96,
    alignItems: 'center',
  },
  noPayment: {
    ...font('extrabold', 13, { color: palette.ink }),
    textAlign: 'center',
    marginVertical: 14,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  offerMiddle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  offerReadyBubble: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: palette.amber50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 8,
  },
  offerBadge: {
    width: 220,
    height: 120,
    borderRadius: radius['6xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitment: {
    ...font('extrabold', 12, { color: palette.green600 }),
    textAlign: 'center',
    marginTop: 12,
  },
});
