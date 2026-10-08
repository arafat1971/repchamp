import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type ViewStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  ZoomIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WELCOME_HERO, WELCOME_HERO_ASPECT } from '@/components/onboarding/welcomeHeroData';
import { BreathingImage, CountUp, Floating, PopOnChange, StaggerIn } from '@/components/motion';
import { GoogleMark } from '@/components/GoogleMark';
import { BarChart } from '@/components/charts/BarChart';
import { GrowthChart } from '@/components/charts/GrowthChart';
import { ProgressRing } from '@/components/session/ProgressRing';
import { Avatar, Card as BaseCard, PressableScale, Spinner } from '@/components/ui';
import { captureError } from '@/lib/crash';
import { pluralise } from '@/domain/plural';
import { OPPONENTS } from '@/domain/opponent';
import { FREE_REP_LIMIT } from '@/domain/hardPaywall';
import { reminderTapIsWalled } from '@/domain/reminderRoute';
import { preferredHourFor } from '@/domain/reminderSchedule';
import { track } from '@/lib/analytics';
import { onboardingProgressPercent, onboardingStepName } from '@/domain/onboardingFunnel';
import {
  ONBOARDING_DRAFT_KEY,
  parseDraft,
  serializeDraft,
} from '@/domain/onboardingDraft';
import {
  AFTER_PAYWALL_STEP,
  BUILD_STEP,
  PAYWALL_STEP,
  PHOTO_STEP,
  PRICE_WHY_STEP,
  REMINDERS_STEP,
  SIGN_IN_STEP,
  USERNAME_STEP,
  afterSignInStep,
  barPercent,
  nextStep,
  previousStep,
  resumeStep,
  stepIdAt,
  type Circle,
  type FlowAnswers,
} from '@/domain/onboardingNav';
import { PENDING_INVITE_KEY, parseInvite } from '@/domain/pendingInvite';
import { storage } from '@/lib/storage';
import {
  AnswerChips,
  FeelStep,
  FriendsPitch,
  PriceWhyStep,
  StylesStep,
  TrainWithStep,
  WhenStep,
  YogaPitch,
} from '@/components/onboarding/Steps';
import {
  Aurora,
  ChoiceRow,
  Eyebrow,
  ChoiceTile,
  InsetGroup,
  InsetRow,
  BackChevron,
  PrimaryButton,
  ProgressDial,
  ScreenHead,
  StepProgress,
  StepScroll,
  springIn,
  useCommitChoice,
} from '@/components/onboarding/ios';
import {
  Burst,
  CoupleVisual,
  HalfRepDemo,
  RepCounterVisual,
  SpaceDiagram,
  VaultVisual,
} from '@/components/onboarding/Visuals';
import { selectionHaptic, successHaptic } from '@/lib/feedback';
import { HomeWidgetStep } from '@/components/onboarding/HomeWidgetStep';
import { RepsWidgetStep } from '@/components/onboarding/RepsWidgetStep';
import { TogetherStep } from '@/components/onboarding/TogetherStep';
import { checkHandleAtSignIn, mayPassUncheckedHandle } from '@/domain/signInHandle';
import { fetchOffering, isPurchasesConfigured, purchase, sortPackagesForPaywall } from '@/services/purchases';
import { checkUsername, fetchProfile } from '@/services/userService';
import {
  hasFreeTrial,
  planTitle,
  renewDisclosure,
  subscribeCtaLabel,
  trialLengthDays,
  trialPeriodLabel,
  trialRibbon,
} from '@/domain/subscriptionCopy';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { showDialog } from '@/state/useDialog';
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
import { confirmationFor, planAccountRestore } from '@/domain/returningAccount';
import {
  ensureNotificationPermission,
  registerForPushNudges,
  scheduleDailyTrainingReminder,
} from '@/lib/notifications';
import { isValidUsername, usernameError as usernameValidationError } from '@/domain/input';
import { selectPairingBonusActive, selectTotalReps, useProfileStore } from '@/state/profileStore';
import { matchedPace } from '@/domain/adaptivePace';
import { reservedControlHeight } from '@/theme/fontScale';
import { font, scaleForRole, text } from '@/theme/typography';
import { gradients, palette, radius, shadow, surfaceShadow } from '@/theme/tokens';

/**
 * Twelve-step onboarding, mirroring the design prototype.
 *
 * Steps are data rather than routes: the flow is linear, has a shared progress
 * bar, and must not be re-enterable from history, so a single screen with an
 * index is simpler and avoids a stack of dead routes behind the tabs.
 */
// Onboarding media — the in-app demo clip and the illustrated value-screen art.
const DEMO_VIDEO = require('../assets/remove_text_bro_thought_202607272319.mp4');
const TROPHY_GOLD = require('../assets/trophy-gold.png');
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

/** Illustrative leaderboard rows for the antidote screen. */
const BOARD_MOCK = [
  { medal: '🥇', emoji: '🏃‍♀️', name: 'Nova', xp: '1,240', tint: '#ede9fe', you: false },
  { medal: '🥈', emoji: '💪', name: 'You', xp: '1,180', tint: palette.green50, you: true },
  { medal: '🥉', emoji: '🤾‍♀️', name: 'Tia', xp: '1,020', tint: '#dbeafe', you: false },
] as const;

/** The three commitments made during onboarding, restated at the finish. */
const READY_STATS = [
  { emoji: '⏱️', value: '2 min', label: 'per session' },
  { emoji: '📱', value: 'No gear', label: 'phone only' },
  { emoji: '🔥', value: 'Day 1', label: 'starts today' },
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

  /* A first-time run saves its progress and resumes after a kill; a replay
     from Settings (already onboarded) must do neither. Read once, at mount. */
  const [firstRun] = useState(() => !useProfileStore.getState().onboarded);
  const [draft] = useState(() =>
    firstRun ? parseDraft(storage.getString(ONBOARDING_DRAFT_KEY), Date.now()) : null,
  );
  const [step, setStep] = useState(() =>
    draft ? resumeStep(draft.step, { circle: draft.circle, styles: draft.styles }) : 0,
  );
  /* True when sign-in was reached by the "Already have an account?" link rather
     than by walking the flow. Someone who jumped forward has not answered the
     goal, frequency or reminder questions yet, so completing sign-in has to
     return them to where they left off instead of dropping them at the paywall. */
  const [cameToSignInEarly, setCameToSignInEarly] = useState(false);
  /* Set the moment Google sign-in succeeds. The auth store can still say
     "anonymous" afterwards (linking onto the existing uid fires no auth-state
     change), so it cannot be the only thing the skip check trusts. */
  const signedInRef = useRef(false);
  /** The handle sign-in could not confirm, if any. Scopes the username step's
      leniency so the same unverifiable name cannot be waved through twice. */
  const [refusedAtSignIn, setRefusedAtSignIn] = useState<string | null>(null);
  const [username, setUsername] = useState(draft?.username ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(draft?.avatarUri ?? null);
  const [goal, setGoal] = useState<string | null>(draft?.goal ?? null);
  const [level, setLevel] = useState<FitnessLevel | null>((draft?.level as FitnessLevel | null) ?? null);
  const [blocker, setBlocker] = useState<Blocker | null>((draft?.blocker as Blocker | null) ?? null);
  const [weeklyGoal, setWeeklyGoal] = useState(draft?.weeklyGoal ?? 4);
  const [buildPercent, setBuildPercent] = useState(0);
  const [plan, setPlan] = useState<'year' | 'month'>(draft?.plan ?? 'year');
  /* The new questions. Each answer is kept, shown back to the athlete later,
     and — for the last two — decides which screens they see at all. */
  const [feel, setFeel] = useState<string | null>(draft?.feel ?? null);
  const [circle, setCircle] = useState<Circle | null>(draft?.circle ?? null);
  const [styleIds, setStyleIds] = useState<string[]>(draft?.styles ?? []);
  const [when, setWhen] = useState<string | null>(draft?.when ?? null);
  const answers = useMemo<FlowAnswers>(() => ({ circle, styles: styleIds }), [circle, styleIds]);

  /* `next` is bound to the step it was rendered for. An option tap calls it
     right after setting its answer, and a second quick tap — or a slow
     username check finishing twice — used to advance two screens, skipping one
     the athlete never saw. Only the first call for a given step moves. */
  const advance = useCallback(
    (override?: Partial<FlowAnswers>) =>
      setStep((s) => {
        if (s !== step) return s;
        /* The answer just given is not in `answers` yet — state has not
           re-rendered — so a choice passes itself in. Without it, picking
           "my partner" would skip the screen about partners. */
        const target = nextStep(s, { ...answers, ...override });
        /* Already signed in with Google — e.g. via "Already have an account?"
           earlier — so asking again would loop them through sign-in twice. */
        const user = useAuthStore.getState().user;
        if (target === SIGN_IN_STEP && (signedInRef.current || (user && !user.isAnonymous))) {
          return afterSignInStep(useProStore.getState().isPro);
        }
        return target;
      }),
    [step, answers],
  );
  /* A plain "continue": it ignores whatever it is called with, so it is safe
     to hand to an onPress that passes the press event. */
  const next = useCallback(() => advance(), [advance]);
  /* The AI-coach and couple-mode screens are branches now: they appear only
     for an athlete who said they want a coach or a partner, and navigation
     steps over them in both directions otherwise (see `onboardingNav`). */
  const back = useCallback(() => setStep((s) => previousStep(s, answers)), [answers]);
  const afterSignIn = useCallback(
    () =>
      setStep((s) => (s === SIGN_IN_STEP ? afterSignInStep(useProStore.getState().isPro) : s)),
    [],
  );

  /* Save progress on every step so a kill mid-flow (a Google sign-in that
     leaves the app, a permission dialog, a phone call) does not send the
     athlete back to the welcome screen with their answers gone. */
  useEffect(() => {
    if (!firstRun || step < 1) return;
    storage.set(
      ONBOARDING_DRAFT_KEY,
      serializeDraft(
        {
          step,
          username,
          avatarUri,
          goal,
          level,
          blocker,
          weeklyGoal,
          plan,
          feel,
          circle,
          styles: styleIds,
          when,
        },
        Date.now(),
      ),
    );
  }, [firstRun, step, username, avatarUri, goal, level, blocker, weeklyGoal, plan, feel, circle, styleIds, when]);

  /* A subscriber signing in on a new phone should not be offered the paywall:
     Pro can land a moment after sign-in, so skip it if it arrives while the
     paywall is showing. */
  const isPro = useProStore((st) => st.isPro);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ((step === PAYWALL_STEP || step === PRICE_WHY_STEP) && isPro) setStep(AFTER_PAYWALL_STEP);
  }, [step, isPro]);

  /* Android's back button used to leave the app mid-flow. Where the on-screen
     back arrow shows, it steps back; once the plan is built there is nothing
     to go back to, so it is swallowed rather than dropping the athlete out.
     A replay from Settings is free to leave. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!firstRun || step === 0) return false;
      if (step < BUILD_STEP) {
        back();
        return true;
      }
      return true;
    });
    return () => sub.remove();
  }, [firstRun, step, back]);

  /* One event per step. Onboarding reported only that it had finished, so a
     drop at the username screen and a drop at the paywall were indistinguishable
     — and both looked exactly like an athlete who simply never came back.
     Named rather than numbered so the funnel reads as screens, not indices. */
  useEffect(() => {
    track('onboarding_step', {
      step,
      name: onboardingStepName(step),
      percent: onboardingProgressPercent(step),
    });
  }, [step]);

  const finish = useCallback(() => {
    // level and blocker ride along now: they shaped the plan the athlete was
    // just shown, and dropping them here meant the app forgot everything it
    // had asked the moment onboarding ended.
    completeOnboarding({
      username: username || 'champion',
      weeklyGoal,
      avatarUri,
      fitnessLevel: level,
      blocker,
    });
    /* What they said about when they train stands in for the learned hour
       until their own sessions show a habit — see `reminderHourFor`. */
    useProfileStore.getState().setPreferredHour(preferredHourFor(when));
    track('onboarding_completed', { weeklyGoal });
    storage.remove(ONBOARDING_DRAFT_KEY);
    // Upload local photo first — pushProfile strips non-HTTPS URLs, so a bare
    // file:// avatar never reached friends/duel seats.
    //
    // Caught and reported: this runs detached, so a failed upload or sync used
    // to surface as an unhandled rejection with nothing recording it. The local
    // profile is already complete; the next sync retries the cloud copy.
    void (async () => {
      try {
        const auth = useAuthStore.getState();
        if (avatarUri) {
          const remote = await auth.syncAvatar(avatarUri);
          useProfileStore.getState().setAvatar(remote);
        }
        await auth.pushProfile();
      } catch (error) {
        captureError(error);
      }
    })();
    router.replace('/(tabs)');
    /* An invite link opened before onboarding was finished (see
       `useDeferInvite`) is the athlete's real reason for being here: replay it
       now that their profile exists, instead of the first practice set. */
    const pending = parseInvite(storage.getString(PENDING_INVITE_KEY), Date.now());
    storage.remove(PENDING_INVITE_KEY);
    if (pending) {
      router.push({ pathname: pending.pathname, params: pending.params } as Href);
      return;
    }
    // Drop straight into a first practice set — the last tap of onboarding *is*
    // the start of the workout. Getting to a counted rep fast is the single
    // biggest lever on activation; landing on Home and hunting for a button is
    // exactly the friction we're removing. The Home tabs sit under it, so the
    // back-swipe from the session lands the athlete on their home as normal.
    /* A free athlete is walled from the first rep (FREE_REP_LIMIT is 0), and the
       paywall step just before this already pitched them. Pushing the session
       would only bounce them to a second paywall, so they stay on Home; Pro
       and the pairing bonus still drop straight in. Asked the same way a
       reminder tap asks it, and "entitlement unresolved" counts as not walled
       so a just-restored subscriber is never sent to Home by mistake. */
    const pro = useProStore.getState();
    const profile = useProfileStore.getState();
    const walled = reminderTapIsWalled({
      proReady: pro.ready,
      isPro: pro.isPro,
      bonusActive: selectPairingBonusActive(profile),
      repsSoFar: selectTotalReps(profile),
      billingReady: isPurchasesConfigured(),
    });
    if (walled) return;
    router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
  }, [completeOnboarding, username, weeklyGoal, avatarUri, level, blocker, when, router]);

  /* Build-profile progress animation (step 10). */
  useEffect(() => {
    if (step !== BUILD_STEP) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuildPercent(0);
    const id = setInterval(() => {
      setBuildPercent((p) => {
        if (p >= 100) {
          clearInterval(id);
          setTimeout(() => setStep((s) => (s === BUILD_STEP ? REMINDERS_STEP : s)), 650);
          return 100;
        }
        return p + 2;
      });
    }, 60);
    return () => clearInterval(id);
  }, [step]);

  const pickPhoto = useCallback(async () => {
    /* No permission request — the Android Photo Picker needs none, and with
       READ_MEDIA_IMAGES gone from the manifest this could only ever be denied,
       silently returning before a picker that works fine on its own. */
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
  const showProgressBar = step > 0 && step < BUILD_STEP;
  /* Steps slide in from the side they came from, the way a navigation stack
     does: forward arrives from the right, back from the left. */
  const [prevStep, setPrevStep] = useState(step);
  const [goingBack, setGoingBack] = useState(false);
  if (step !== prevStep) {
    setPrevStep(step);
    setGoingBack(step < prevStep);
  }
  const progressPercent = barPercent(step, answers);
  const id = stepIdAt(step);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(34,197,94,0.07)', 'rgba(34,197,94,0.02)', 'rgba(246,247,245,0)']}
        locations={[0, 0.3, 0.6]}
        style={StyleSheet.absoluteFill}
      />
      {showProgressBar ? (
        <View style={styles.progressRow}>
          <BackChevron onPress={back} />
          <StepProgress percent={progressPercent} />
          {/* Mirrors the chevron's width so the bar sits optically centred. */}
          <View style={{ width: 44 }} />
        </View>
      ) : null}

      <Animated.View
        key={step}
        entering={(goingBack ? FadeInLeft : FadeInRight).duration(340)}
        style={styles.stepWrap}
      >
        {id === 'welcome' ? <Welcome onNext={next} /> : null}
        {id === 'showcase' ? <Showcase onNext={next} /> : null}
        {id === 'feel' ? (
          <FeelStep
            selected={feel}
            onSelect={(v) => {
              setFeel(v);
              next();
            }}
          />
        ) : null}
        {id === 'value-counts-reps' ? (
          <ValueScreen
            eyebrow="AI REP COUNTING"
            eyebrowTint={palette.green50}
            title={'Every rep,\ncounted for you'}
            body="Your camera counts each clean rep the moment you do it."
            points={[
              { icon: '🎯', title: 'Real-time count', sub: 'Reps tick up as you move' },
              { icon: '📐', title: 'Form feedback', sub: 'Depth and tempo, checked live' },
              { icon: '🔒', title: 'Private by design', sub: 'Video never leaves your phone' },
            ]}
            aurora={palette.green400}
            visual={<RepCounterVisual />}
            onNext={next}
          />
        ) : null}
        {id === 'value-couple' ? (
          <ValueScreen
            eyebrow="TRAIN AS TWO"
            eyebrowTint="#ffe4e6"
            title="Nobody quits alone"
            body="Pair up and your streak becomes theirs. Skipping stops being private."
            points={[
              { icon: '🐼', title: 'Couple mode', sub: 'One shared streak, two phones' },
              { icon: '⚔️', title: 'Live duels', sub: 'Race a rival rep-for-rep' },
              { icon: '🔥', title: 'One shared streak', sub: 'Break it and you both lose it' },
            ]}
            aurora={palette.purple400}
            visual={<CoupleVisual />}
            onNext={next}
          />
        ) : null}
        {id === 'value-ranks' ? (
          <ValueScreen
            eyebrow="CLIMB THE RANKS"
            eyebrowTint={palette.amber50}
            title={'Every rep counts\nfor something'}
            body="Sets earn XP. XP moves you up a league. The board resets every Monday."
            points={[
              { icon: '🏆', title: 'Weekly leagues', sub: 'Bronze to the top tier' },
              { icon: '⚡', title: 'Earn XP', sub: 'Every rep moves you up' },
              { icon: '📈', title: 'Track progress', sub: 'Personal bests, week over week' },
            ]}
            aurora={palette.amber300}
            visual={<ProgressChartVisual />}
            onNext={next}
          />
        ) : null}
        {id === 'username' ? (
          <Username
            value={username}
            error={usernameError}
            onChange={(v) => {
              setUsername(v.replace(/[^a-zA-Z0-9_]/g, ''));
              setUsernameError(null);
            }}
            onSignIn={() => {
              setUsernameError(null);
              setCameToSignInEarly(true);
              setStep(SIGN_IN_STEP);
            }}
            onNext={() => {
              const err = usernameValidationError(username);
              if (err || !isValidUsername(username)) {
                setUsernameError(err ?? 'Pick a username.');
                return;
              }
              const uid = useAuthStore.getState().user?.uid;
              void (async () => {
                const state = await checkUsername(username, uid);
                if (state === 'taken') {
                  setUsernameError('That username is taken. Try another.');
                  return;
                }
                /* An unverifiable lookup normally passes, so a bad connection
                   cannot strand anyone here. The exception is a handle sign-in
                   already bounced back for exactly that reason: waving it
                   through again on another failed lookup leads straight to the
                   silent rename the bounce existed to prevent. */
                if (state === 'unknown' && !mayPassUncheckedHandle(username, refusedAtSignIn)) {
                  setUsernameError(
                    `Still can't confirm @${username}. Check your connection, or pick another name.`,
                  );
                  return;
                }
                setRefusedAtSignIn(null);
                next();
              })();
            }}
          />
        ) : null}
        {id === 'photo' ? (
          <Photo username={username} avatarUri={avatarUri} onPick={pickPhoto} onNext={next} />
        ) : null}
        {id === 'goal' ? (
          <Goal
            selected={goal}
            onSelect={(id) => {
              setGoal(id);
              next();
            }}
          />
        ) : null}
        {id === 'train-with' ? (
          <TrainWithStep
            selected={circle}
            onSelect={(v) => {
              setCircle(v);
              advance({ circle: v });
            }}
          />
        ) : null}
        {id === 'friends-pitch' ? <FriendsPitch username={username} onNext={next} /> : null}
        {id === 'styles' ? (
          <StylesStep
            selected={styleIds}
            onChange={setStyleIds}
            onNext={(ids) => advance({ styles: ids })}
          />
        ) : null}
        {id === 'yoga-pitch' ? <YogaPitch onNext={next} /> : null}
        {id === 'when' ? (
          <WhenStep
            selected={when}
            onSelect={(v) => {
              setWhen(v);
              next();
            }}
          />
        ) : null}
        {id === 'frequency' ? (
          <Frequency value={weeklyGoal} onChange={setWeeklyGoal} onNext={next} />
        ) : null}
        {/* Two qualifying questions — both genuinely change what follows: the
            level scales the first-week target, the blocker picks which feature
            the app leads with. */}
        {id === 'experience' ? (
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
        {id === 'blocker' ? (
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
        {id === 'antidote' ? <YourAntidote blocker={blocker} onNext={next} /> : null}
        {id === 'coach-pitch' ? <AiCoach onNext={next} /> : null}
        {id === 'couple-pitch' ? <CoupleMode onNext={next} /> : null}
        {/* Personalised trio — each reflects the answers just given, turning
            them into a concrete plan instead of discarding them. */}
        {id === 'your-plan' ? (
          <YourPlan
            goal={goal}
            weeklyGoal={weeklyGoal}
            recap={<AnswerChips feel={feel} circle={circle} styleIds={styleIds} when={when} />}
            onNext={next}
          />
        ) : null}
        {id === 'your-projection' ? (
          <YourProjection username={username} weeklyGoal={weeklyGoal} onNext={next} />
        ) : null}
        {id === 'your-first-week' ? (
          <YourFirstWeek
            username={username}
            goal={goal}
            weeklyGoal={weeklyGoal}
            level={level}
            onNext={next}
          />
        ) : null}
        {id === 'challenge' ? <Challenge username={username} avatarUri={avatarUri} onNext={() => setStep(BUILD_STEP)} /> : null}
        {id === 'building' ? <Building percent={buildPercent} /> : null}
        {/* Reminders before sign-in: it asks for a permission, and a plan the
            athlete just chose is the strongest reason they will ever have to
            grant it. */}
        {id === 'reminders' ? (
          <Reminders
            username={username}
            weeklyGoal={weeklyGoal}
            hour={preferredHourFor(when)}
            onNext={next}
          />
        ) : null}
        {/* Sign-in immediately before the paywall: the plan is built, and a
            subscription needs an account to attach to. */}
        {id === 'sign-in' ? (
          <SignIn
            onSignedIn={() => {
              signedInRef.current = true;
            }}
            onRestored={(restoredName, restoredAvatar) => {
              setUsername(restoredName);
              /* finish() writes this component's avatarUri over the store, so a
                 restored photo has to land here too or it is wiped to null. */
              if (restoredAvatar) setAvatarUri(restoredAvatar);
            }}
            onNext={() => {
              /* The handle was checked at step 5 and is not claimed until the
               * profile write at the very end, so fifteen steps of onboarding
               * sit between "that one is free" and actually taking it. If
               * someone else took it meanwhile, `upsertProfile` refuses to
               * steal it and quietly renames you to `handle_a1b2` — you would
               * finish onboarding as a name you never chose and were never
               * told about.
               *
               * Signing in is the first moment there is a uid to hold a
               * handle, so re-check here and send them back to choose rather
               * than rename them behind their back. */
              /* Jumped here from the username step. A returning athlete now has
                 their real handle back, so send them on through the flow they
                 skipped; a new athlete still has to pick one, so put them back
                 on the username step rather than 15 screens ahead of it. */
              if (cameToSignInEarly) {
                setCameToSignInEarly(false);
                setStep(useProfileStore.getState().username ? PHOTO_STEP : USERNAME_STEP);
                return;
              }
              void (async () => {
                const uid = useAuthStore.getState().user?.uid;
                /* `checkHandleAtSignIn` proceeds on either of these too; this
                   guard is here to skip the Firestore round-trip, not to
                   decide anything. */
                if (!username || !uid) return afterSignIn();
                /* Stricter than the username step, which passes an
                   unverifiable lookup; `checkHandleAtSignIn` documents and
                   tests why. */
                const check = checkHandleAtSignIn(
                  username,
                  uid,
                  await checkUsername(username, uid),
                );
                if (check.kind === 'proceed') {
                  setRefusedAtSignIn(null);
                  return afterSignIn();
                }
                setRefusedAtSignIn(username);
                setUsernameError(check.reason);
                setStep(USERNAME_STEP);
              })();
            }}
          />
        ) : null}
        {id === 'price-why' ? (
          <PriceWhyStep
            username={username}
            weeklyGoal={weeklyGoal}
            circle={circle}
            onNext={next}
          />
        ) : null}
        {id === 'paywall' ? <Paywall plan={plan} goal={goal} onSelect={setPlan} onNext={next} /> : null}
        {/* The last two land right before the first set, which is where the
            advice actually gets used — a framing tip read fifteen screens
            earlier would be forgotten by the time the camera opens. */}
        {id === 'how-reps-count' ? (
          <HowRepsCount
            username={username}
            weeklyGoal={weeklyGoal}
            level={level}
            onNext={next}
          />
        ) : null}
        {id === 'set-up-your-space' ? <SetUpYourSpace username={username} onNext={next} /> : null}
        {/* The widget, just before the offer: the plan is set and the partner
            is the reason to come back, so this is when a home-screen spot
            for them makes the most sense. Skips itself where unsupported. */}
        {id === 'home-widget' ? <HomeWidgetStep onNext={next} username={username} /> : null}
        {/* The partner features are the reason to stay, so the offer follows a
            moment of feeling them rather than a description of them. */}
        {id === 'together-preview' ? <TogetherStep onNext={next} /> : null}
        {/* The Reps widget closes the home-screen setup, just before the offer.
            Skips itself where unsupported. */}
        {id === 'reps-widget' ? <RepsWidgetStep onNext={next} /> : null}
        {id === 'ready-to-race' ? (
          <ReadyToRace username={username} avatarUri={avatarUri} onDone={finish} />
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Onboarding's card: Home's surface — large radius, hairline border, long faint shadow. */
function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <BaseCard style={[styles.homeCard, style]}>{children}</BaseCard>;
}

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

function Welcome({ onNext }: { onNext: () => void }) {
  const router = useRouter();

  return (
    <View style={styles.step}>
      <Animated.View entering={FadeInDown.duration(420)} style={styles.welcomeBrand}>
        <View style={styles.brandMark}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.brandMarkImg}
            contentFit="contain"
          />
        </View>
        <Text style={styles.welcomeWordmark}>RepChamp</Text>
      </Animated.View>

      <View style={styles.hero}>
        {/* A soft green glow behind the couple, so they read as lit rather than
            pasted on. The picture's own background is near-white and matches
            the card, so no box shows around it. */}
        <View style={styles.heroGlow} pointerEvents="none" />
        <BreathingImage style={StyleSheet.absoluteFill}>
          <View style={styles.heroStage}>
            <Image
              source={{ uri: WELCOME_HERO }}
              style={styles.heroCouple}
              contentFit="contain"
              transition={250}
              accessibilityLabel="Two athletes ready to train"
            />
          </View>
        </BreathingImage>

        <Floating delay={120} style={styles.heroBadgeLeft}>
          <View style={styles.heroBadge}>
            <Image source={require('../assets/fire-flame.png')} style={{ width: 20, height: 20 }} contentFit="contain" />
            <View>
              <Text style={font('extrabold', 14, { color: palette.ink })}>12</Text>
              <Text style={styles.heroBadgeLabel}>DAY STREAK</Text>
            </View>
          </View>
        </Floating>

        <Floating delay={800} style={styles.heroBadgeRight}>
          <View style={styles.heroBadge}>
            <Image source={require('../assets/trophy-gold.png')} style={{ width: 22, height: 22 }} contentFit="contain" />
            <View>
              <Text style={font('extrabold', 14, { color: palette.ink })}>Gold</Text>
              <Text style={styles.heroBadgeLabel}>LEAGUE</Text>
            </View>
          </View>
        </Floating>
      </View>

      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeTitle}>Your phone counts.{'\n'}You just move.</Text>
        <Text style={styles.welcomeBody}>
          Point the camera at yourself. Every clean rep is counted and your form is scored live.
        </Text>
      </View>

      {/* One way in, and it is not an account.
          Sign-in used to sit here, asking for a Google account before the
          athlete had seen a single rep counted. It now comes near the end,
          once there is something worth saving — see the `SignIn` step.

          There was also a "Try a set now — no signup" link that jumped
          straight past onboarding. It advertised an absence, and the screens
          it skipped are the ones that personalise the app. */}
      <View style={{ gap: 12, marginTop: 20 }}>
        <PrimaryButton label="Get started" onPress={onNext} />
      </View>

      <Text style={styles.legal}>
        By continuing, you confirm you are 16 or older and agree to RepChamp&apos;s{' '}
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/modal/legal?tab=terms')}
          accessibilityRole="link"
          accessibilityLabel="Terms"
        >
          Terms
        </Text>{' '}
        and{' '}
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/modal/legal')}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

/**
 * Sign in, near the end rather than at the door.
 *
 * This used to be the second button on the welcome screen, which asked for a
 * Google account before the athlete had seen a rep counted. By here they have
 * picked a username and photo, answered what stops them, and been shown a
 * projection and a first week — so there is something concrete to lose, and
 * "save it" is a reason rather than a demand.
 *
 * It sits immediately before the paywall on purpose: a subscription has to
 * attach to an account, so this is the last point where signing in is still
 * optional rather than a blocker.
 *
 * Skipping stays first-class. An anonymous account already backs everything up
 * to Firebase; what Google adds is recovering it on a new phone, which is what
 * the copy promises and all it promises.
 */
function SignIn({
  onNext,
  onRestored,
  onSignedIn,
}: {
  onNext: () => void;
  /** Called once Google sign-in has succeeded, before the confirmation beat. */
  onSignedIn: () => void;
  /** Called with the handle a returning account already owns, so the parent's
      username state matches what was just restored from the cloud. */
  onRestored: (username: string, avatarUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  /** Shown on success. Sign-in used to advance with no acknowledgement at all. */
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  /** How long the confirmation is held, so its progress bar can match it. */
  const [holdMs, setHoldMs] = useState(1100);
  // Resolved once: whether a real Google sign-in can complete on this build.
  const googleReady = useMemo(() => isGoogleAuthConfigured(), []);

  const onGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setAuthError(null);
    try {
      const account = await signInWithGoogle();
      onSignedIn();
      /* Linking onto the anonymous uid fires no auth-state change, so the store
         would keep saying "anonymous". Same uid only — a different one reaches
         the store through its listener, which runs the account-switch reset. */
      const stored = useAuthStore.getState().user;
      if (stored && stored.uid === account.uid) useAuthStore.setState({ user: account });

      /* Signing in can mean two things, and this used to treat them the same:
       * a new athlete creating an account, or someone coming back on a new
       * phone. The second already owns a username, a photo and their XP, and
       * silently advancing meant the handle they typed two screens ago
       * overwrote the one they have had all along.
       *
       * It also gave no acknowledgement at all — on a slow connection that is
       * indistinguishable from a tap that did nothing. */
      const cloud = await fetchProfile(account.uid);
      const store = useProfileStore.getState();
      const plan = planAccountRestore(cloud, {
        username: store.username,
        avatarUri: store.avatarUri,
        totalXp: store.totalXp,
      });

      if (plan.kind === 'returning') {
        store.setUsername(plan.username);
        if (plan.avatarUrl) store.setAvatar(plan.avatarUrl);
        onRestored(plan.username, plan.avatarUrl);
      }

      /* Show the confirmation, then advance — not both at once. Setting state
       * and calling `onNext()` in the same tick unmounted this screen before
       * React could paint the tick, so the acknowledgement added for exactly
       * this purpose was never once visible. A returning athlete gets longer:
       * "Welcome back, @handle" is the proof their account was found, and it
       * is the difference between trusting the restore and retyping a handle
       * they already own. */
      const hold = plan.kind === 'returning' ? 1600 : 1100;
      setHoldMs(hold);
      setSignedInAs(confirmationFor(plan, account.email));
      setTimeout(onNext, hold);
    } catch (error) {
      // A cancel is a deliberate user action, not an error worth surfacing.
      if (!isGoogleCancel(error)) {
        captureError(error);
        setAuthError(
          error instanceof Error && error.message
            ? error.message
            : "Couldn't sign in with Google. Please try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }, [busy, onNext, onRestored, onSignedIn]);

  /* The confirmation replaces the screen rather than appearing under it.
   *
   * It used to render as a small green row below the buttons, then sit there
   * for over a second while `setTimeout` ran. That put the most important
   * moment on the screen — proof the account was found — in the least visible
   * place on it, under two buttons that were now pointless, and the wait read
   * as a hang rather than as a beat. */
  if (signedInAs) return <SignedIn message={signedInAs} holdMs={holdMs} />;

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={palette.green400} second={palette.amber300} />
      <StepScroll>
      <ScreenHead
        eyebrow="KEEP YOUR PROGRESS"
        tint={palette.green50}
        title="Save your plan"
        body="Sign in so your streak, league and personal bests follow you to a new phone."
      />

      {/* What is being protected, shown as things orbiting a "saved" badge —
          a streak, a league and a record are what the athlete has just spent
          fifteen screens being shown. */}
      <View style={styles.vaultStage}>
        <VaultVisual />
      </View>
      </StepScroll>

      <View style={{ gap: 6 }}>
        {googleReady ? (
          <Animated.View entering={springIn(3)}>
            <GoogleButton busy={busy} onPress={onGoogle} />
          </Animated.View>
        ) : null}
        <Animated.View entering={springIn(4)}>
          {googleReady ? (
            <PressableScale
              onPress={onNext}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              style={styles.skip}
            >
              <Text style={font('extrabold', 15, { color: palette.grey600 })}>Not now</Text>
            </PressableScale>
          ) : (
            <PrimaryButton label="Continue" onPress={onNext} disabled={busy} />
          )}
        </Animated.View>
      </View>

      {/* Sits under the buttons because it is a reassurance, not an action. */}
      <Animated.View entering={FadeIn.duration(500).delay(500)}>
        <Text style={styles.signInFinePrint}>
          We never post anything. Your email is only used to find your account.
        </Text>
      </Animated.View>

      {authError ? (
        <Animated.Text
          entering={FadeInDown.duration(260)}
          style={styles.authError}
          accessibilityLiveRegion="polite"
        >
          {authError}
        </Animated.Text>
      ) : null}
    </View>
  );
}

/**
 * The success beat, given the whole screen.
 *
 * There is a deliberate pause here — 1.1s, or 1.6s for a returning athlete —
 * while the parent's `setTimeout` runs. That pause is the acknowledgement, so
 * it has to look intentional: the tick springs in, the message follows, and a
 * progress line runs the length of the wait so the athlete can see the app is
 * moving rather than stuck.
 */
function SignedIn({ message, holdMs }: { message: string; holdMs: number }) {
  const tick = useSharedValue(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    successHaptic();
    tick.value = withTiming(1, { duration: 320 });
    /* Linear on purpose: this is a clock, not a flourish. Easing it would make
       the remaining wait misrepresent itself. */
    fill.value = withTiming(1, { duration: holdMs, easing: Easing.linear });
  }, [tick, fill, holdMs]);

  const tickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tick.value }],
    opacity: tick.value,
  }));
  /* Animating width, matching the shared `ProgressBar`. A scaleX transform
     would need `transformOrigin: 'left'`, which nothing else in the app relies
     on; width percentages are known to behave here. */
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={[styles.step, styles.stepPadded, styles.signedInScreen]}>
      <Aurora tint={palette.green400} second={palette.amber300} />
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Burst emojis={['✨', '🎉', '⭐']} count={12} />
        <Animated.View style={[styles.signedInBadge, tickStyle]}>
          <Text style={styles.signedInBadgeTick}>✓</Text>
        </Animated.View>
      </View>

      <Animated.Text
        entering={FadeInUp.duration(360).delay(160)}
        style={[text.h1, { fontSize: 24, textAlign: 'center', marginTop: 20 }]}
        accessibilityLiveRegion="polite"
      >
        {message}
      </Animated.Text>

      <Animated.View entering={FadeIn.duration(400).delay(320)} style={styles.signedInBar}>
        <Animated.View style={[styles.signedInBarFill, fillStyle]} />
      </Animated.View>
    </View>
  );
}

/**
 * Google's own button, near enough to be recognised at a glance.
 *
 * Was a bordered pill with a blue letter `G` set in the app's typeface. The
 * real mark and a settled label make it read as the control people already
 * trust, and the spinner replaces the mark in place so the row does not
 * reflow the moment it is tapped.
 */
function GoogleButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { fontScale } = useWindowDimensions();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      accessibilityLabel="Continue with Google"
      style={[
        styles.socialButton,
        busy && styles.socialButtonBusy,
        { minHeight: reservedControlHeight(54, fontScale) },
      ]}
    >
      <View style={styles.socialGlyph}>
        {busy ? <Spinner size="small" color={palette.grey600} /> : <GoogleMark size={20} />}
      </View>
      <Text style={font('extrabold', 15, { color: palette.ink })} {...scaleForRole('control')}>
        {busy ? 'Signing in…' : 'Continue with Google'}
      </Text>
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
        <Text style={[text.h1, { fontSize: 28, textAlign: 'center' }]}>Watch it count</Text>
        <Text style={[text.body, styles.centeredCopy]}>
          No taps. No wearables. No counting in your head and losing track at twelve.
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
  aurora,
}: {
  eyebrow: string;
  eyebrowTint: string;
  title: string;
  body: string;
  points: { icon: string; title: string; sub: string }[];
  visual: React.ReactNode;
  onNext: () => void;
  cta?: string;
  aurora?: string;
}) {
  const { height } = useWindowDimensions();
  // Short phones: shrink the hero rather than push the button off screen.
  const { fontScale } = useWindowDimensions();
  const compact = height < 760 || fontScale > 1.3;
  const tiles = [palette.green100, palette.blue50, palette.amber50];

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={aurora} />
      <StepScroll>
      <ScreenHead eyebrow={eyebrow} tint={eyebrowTint} title={title} body={body} />

      <View style={[styles.valueVisual, { minHeight: compact ? 200 : 250 }]}>
        <Animated.View
          entering={ZoomIn.duration(320).delay(140)}
          style={compact ? { transform: [{ scale: 0.78 }] } : undefined}
        >
          {visual}
        </Animated.View>
      </View>

      <InsetGroup style={{ marginBottom: 18 }}>
        {points.map((p, i) => (
          <InsetRow
            key={p.title}
            glyph={p.icon}
            tile={tiles[i % tiles.length] ?? palette.green100}
            title={p.title}
            sub={p.sub}
            index={i}
            last={i === points.length - 1}
          />
        ))}
      </InsetGroup>
      </StepScroll>

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
        <Image source={TROPHY_GOLD} style={{ width: 66, height: 44 }} contentFit="contain" />
      </Floating>
    </View>
  );
}

function Username({
  value,
  error,
  onChange,
  onNext,
  onSignIn,
}: {
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onNext: () => void;
  /** Jumps straight to sign-in for someone who already has an account. */
  onSignIn: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const valid = isValidUsername(value);
  const borderColor = error ? palette.red500 : valid ? palette.green500 : palette.border;

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Text style={text.h1}>Claim your name</Text>
      <Text style={[text.body, { marginTop: 8 }]}>
        This is the name your rivals will see on the leaderboard.
      </Text>

      <View
        style={[
          styles.usernameField,
          { borderColor, minHeight: reservedControlHeight(60, fontScale) },
        ]}
      >
        <Text style={font('extrabold', 18, { color: palette.grey450 })} {...scaleForRole('control')}>
          @
        </Text>
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
        3–20 characters. Letters, numbers, and underscores only.
      </Text>
      {error ? (
        <Text style={font('extrabold', 13, { color: palette.red500, marginTop: 8 })}>
          {error}
        </Text>
      ) : null}

      {/* Under the field, not pinned to the bottom of the screen. This window
          does not resize for the keyboard (edge-to-edge), so a bottom-pinned
          button sat behind it and the only way on was the keyboard's own enter
          key. Here it is always above the keyboard, as in a standard sign-up
          form. */}
      <View style={{ marginTop: 28 }}>
        <PrimaryButton label="Continue" onPress={onNext} disabled={!isValidUsername(value)} />
      </View>

      {/* Sign-in lives fifteen steps later, which is the wrong order for anyone
          who already has an account: they invent a second handle, and the app
          only discovers the real one long after. Offering it here lets a
          returning athlete restore first and skip the invention entirely. */}
      <PressableScale
        onPress={onSignIn}
        accessibilityRole="button"
        accessibilityLabel="Already have an account? Sign in"
      >
        <Text style={styles.haveAccountLink}>
          Already have an account? <Text style={styles.haveAccountStrong}>Sign in</Text>
        </Text>
      </PressableScale>
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
  const spin = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false);
  }, [spin]);

  // A chosen photo lands with a pop and a success tick, so it feels received.
  useEffect(() => {
    if (!avatarUri) return;
    successHaptic();
    pop.value = withSequence(withTiming(1.03, { duration: 140 }), withTiming(1, { duration: 200 }));
  }, [avatarUri, pop]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const handle = username || 'champion';

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={palette.blue400} second={palette.purple400} />
      <StepScroll>
      <ScreenHead
        title="Put a face to it"
        body="Rivals and partners see this on every leaderboard and duel."
      />

      <View style={styles.photoStage}>
        <PressableScale
          onPress={onPick}
          accessibilityRole="button"
          accessibilityLabel={avatarUri ? 'Change your photo' : 'Choose a photo from your library'}
        >
          <Animated.View entering={ZoomIn.duration(320).delay(120)} style={popStyle}>
            <View style={styles.photoRingBox}>
              <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
                <LinearGradient
                  colors={[palette.green400, palette.blue400, palette.purple400, palette.green400]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.photoRing}
                />
              </Animated.View>
              <View style={styles.photoRingGap}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.photoBig} />
                ) : (
                  <View style={[styles.photoBig, styles.photoPlaceholder]}>
                    <Text style={font('extrabold', 58, { color: palette.green600 })}>
                      {handle.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.photoBadge}>
                <Text style={{ fontSize: 18 }}>{avatarUri ? '✓' : '📷'}</Text>
              </View>
            </View>
          </Animated.View>
        </PressableScale>

        <Animated.Text entering={springIn(3)} style={styles.photoHandle} {...scaleForRole('heading')}>
          @{handle}
        </Animated.Text>
      </View>

      {/* How it will look where it matters — a leaderboard row. */}
      <Animated.View entering={springIn(4)}>
        <InsetGroup>
          <View style={styles.photoRow}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.photoMini} />
            ) : (
              <View style={[styles.photoMini, styles.photoPlaceholder]}>
                <Text style={font('extrabold', 15, { color: palette.green600 })}>
                  {handle.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={font('extrabold', 15, { color: palette.ink })}>@{handle}</Text>
              <Text style={text.captionMd}>Bronze I · this week</Text>
            </View>
            <Text style={font('extrabold', 15, { color: palette.grey600 })}>0 XP</Text>
          </View>
        </InsetGroup>
      </Animated.View>
      </StepScroll>

      <PrimaryButton label={avatarUri ? 'Looks good' : 'Choose a photo'} onPress={avatarUri ? onNext : onPick} />
      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="Skip for now"
        style={styles.skip}
      >
        <Text style={font('extrabold', 14, { color: palette.grey600 })}>
          {avatarUri ? 'Not now' : 'Skip for now'}
        </Text>
      </Pressable>
    </View>
  );
}

const GOAL_HINTS: Readonly<Record<string, string>> = {
  strength: 'A progressive push and squat plan',
  reps: 'Hands-free counting on every set',
  form: 'Depth and tempo, scored live',
  compete: 'Duels, leagues and rivals',
};

function Goal({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { picked, choose } = useCommitChoice<string>(onSelect, selected);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={palette.purple400} second={palette.green400} />
      <StepScroll>
      <ScreenHead
        align="left"
        title="What are you here for?"
        body="Pick the one that matters most. It decides what the app puts in front of you."
      />
      <View style={styles.goalGrid}>
        {GOALS.map((g, i) => (
          <ChoiceTile
            key={g.id}
            emoji={g.emoji}
            label={g.label}
            hint={GOAL_HINTS[g.id] ?? ''}
            tint={g.tint}
            selected={picked === g.id}
            dimmed={picked !== null && picked !== g.id}
            index={i}
            onPress={() => choose(g.id)}
          />
        ))}
      </View>
      </StepScroll>
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
  const { fontScale } = useWindowDimensions();
  const level = value <= 2 ? 0 : value <= 4 ? 1 : value <= 6 ? 2 : 3;
  const emoji = ['🌱', '⚡', '🔥', '🚀'][level];
  const tone = [palette.green500, palette.green500, palette.amber500, palette.red500][level];
  const title = ['Easy does it', 'Great habit', 'On fire', 'Elite mode'][level];
  const note = [
    'Perfect for building a routine',
    'A sustainable, strong pace',
    'Serious gains incoming',
    'Every single day. Respect.',
  ][level];

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={tone} second={palette.blue400} />
      <StepScroll>
      <ScreenHead
        title={'How many days\ncan you commit?'}
        body="Be honest. A goal you hit beats a goal you admire."
      />

      <Animated.View entering={ZoomIn.duration(320).delay(140)} style={styles.freqDial}>
        <ProgressDial size={196} stroke={16} progress={value / 7} color={tone}>
          <Animated.View key={emoji} entering={ZoomIn.duration(320)}>
            <Text style={{ fontSize: 26 }}>{emoji}</Text>
          </Animated.View>
          <PopOnChange trigger={value} scale={1.16}>
            <Text style={styles.freqNumber} {...scaleForRole('display')}>{value}</Text>
          </PopOnChange>
          <Text style={styles.freqUnit} {...scaleForRole('control')}>{value === 1 ? 'DAY A WEEK' : 'DAYS A WEEK'}</Text>
        </ProgressDial>
      </Animated.View>

      {/* A track with a sliding thumb: one continuous control, with each day
          keeping its own large tap target. */}
      <Animated.View entering={springIn(3)} style={styles.dayPicker}>
        <DayThumb value={value} />
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <Pressable
            key={d}
            onPress={() => {
              if (d !== value) selectionHaptic();
              onChange(d);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === d }}
            accessibilityLabel={`${d} days per week`}
            style={[styles.dayChip, { minHeight: reservedControlHeight(40, fontScale) }]}
          >
            <Text
              style={font('extrabold', 14, {
                color: value === d ? palette.white : palette.grey600,
              })}
              {...scaleForRole('control')}
            >
              {d}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      <Animated.View key={title} entering={FadeIn.duration(260)} style={styles.freqNote}>
        <Text style={font('extrabold', 16, { color: palette.ink })}>{title}</Text>
        <Text style={text.captionMd}>{note}</Text>
      </Animated.View>
      </StepScroll>

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
  const { picked, choose } = useCommitChoice<T>(onSelect, selected);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={eyebrowTint === palette.amber50 ? palette.amber300 : palette.green400} />
      <StepScroll>
      <ScreenHead eyebrow={eyebrow} tint={eyebrowTint} title={title} body={body} />

      <View style={{ gap: 12, marginTop: 24 }}>
        {options.map((option, i) => (
          <ChoiceRow
            key={option.id}
            emoji={option.emoji}
            label={option.label}
            sub={option.sub}
            selected={picked === option.id}
            dimmed={picked !== null && picked !== option.id}
            index={i}
            onPress={() => choose(option.id)}
          />
        ))}
      </View>
      </StepScroll>
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
  recap,
  onNext,
}: {
  goal: string | null;
  weeklyGoal: number;
  /** Their own answers, shown as what the plan was built from. */
  recap?: ReactNode;
  onNext: () => void;
}) {
  const plan = useMemo(() => goalPlan(goal), [goal]);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <Eyebrow label="YOUR PLAN" tint={palette.green500} />
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>{plan.title}</Text>
        <Text style={[text.body, styles.centeredCopy]}>{plan.blurb}</Text>
      </Animated.View>
      {recap}

      {/* The athlete's actual week, drawn as training days — a schedule they
          can read beats an emoji standing in for the idea of one. */}
      <View style={styles.planVisual}>
        <LinearGradient
          colors={gradients.brandStrong}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.planCard, shadow.brand]}
        >
          <View style={styles.planCardHead}>
            <Text style={styles.planCardEyebrow}>YOUR WEEK</Text>
            <Text style={{ fontSize: 20 }}>{plan.emoji}</Text>
          </View>

          <View style={styles.planWeekRow}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => {
              // Spread the chosen days evenly across the week.
              const active = Math.round((i * weeklyGoal) / 7) !== Math.round(((i + 1) * weeklyGoal) / 7);
              return (
                <View key={i} style={[styles.planDay, active && styles.planDayOn]}>
                  <Text
                    style={font('extrabold', 12, {
                      color: active ? palette.green700 : 'rgba(255,255,255,0.55)',
                    })}
                  >
                    {d}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.planCardFoot}>
            {weeklyGoal}× a week · about 2 minutes a session
          </Text>
        </LinearGradient>
      </View>

      <View style={{ gap: 12, marginTop: 16 }}>
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

      <View style={{ flex: 1 }} />
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
      <Aurora tint={palette.green400} second={palette.amber300} />
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <Eyebrow label="YOUR PROJECTION" tint={palette.amber500} />
        <Text style={[text.h1, { fontSize: 26, textAlign: 'center' }]}>
          {username ? `${username}, here's\nyour next 6 weeks` : "Here's\nyour next 6 weeks"}
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

          <GrowthChart data={weeks.map((w) => w.xp)} width={264} height={140} />

          <View style={styles.chartAxis}>
            {weeks.map((w) => (
              <Text key={w.week} style={styles.chartAxisLabel}>
                W{w.week}
              </Text>
            ))}
          </View>
        </Card>
      </View>

      {/* One grouped list rather than two differently coloured pills: the
          upside (climb a league) and the cost of not starting (the reset) read
          as a pair. */}
      <Animated.View entering={springIn(4)}>
        <InsetGroup>
          {nextLeague ? (
            <InsetRow
              glyph="⬆️"
              tile={palette.green100}
              title={`Climb into ${nextLeague.league}`}
              sub="Add a session or two a week"
              index={0}
              last={false}
            />
          ) : null}
          <InsetRow
            glyph="🔥"
            tile={palette.amber50}
            title="Your first session starts the streak"
            sub="Miss a week and the league resets to Bronze"
            index={1}
            last
          />
        </InsetGroup>
      </Animated.View>

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
        <Eyebrow label="WEEK ONE" tint={palette.blue500} />
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
            Day one is the smallest day of the week —{' '}
            {pluralise(opener?.target ?? 0, 'rep')}. It only gets
            heavier once you&apos;ve proved you&apos;ll show up.
          </Text>
        </View>
      </StaggerIn>

      <View style={{ flex: 1 }} />
      <HoldToCommit
        label={`Hold to commit — ${pluralise(opener?.target ?? 0, 'rep')} on day one`}
        onCommit={() => {
          track('onboarding_pledge_made', { weeklyGoal });
          onNext();
        }}
      />
      <Text style={styles.commitFootnote}>Takes about 2 minutes · no equipment</Text>
    </View>
  );
}

const HOLD_MS = 1100;

/**
 * A pledge, not a button: press and hold fills the bar, and letting go early
 * drains it. Saying "I'm in" out loud with a finger is a micro-commitment, and
 * people follow through on what they have committed to. Screen readers cannot
 * hold, so the accessibility action commits at once.
 */
function HoldToCommit({ label, onCommit }: { label: string; onCommit: () => void }) {
  const fill = useSharedValue(0);
  const [done, setDone] = useState(false);

  const finish = useCallback(() => {
    setDone((d) => {
      if (d) return d;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(onCommit, 350);
      return true;
    });
  }, [onCommit]);

  const start = () => {
    if (done) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    fill.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(finish)();
    });
  };
  const cancel = () => {
    if (done) return;
    fill.value = withTiming(0, { duration: 220 });
  };

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold, or double tap, to commit"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={finish}
      style={styles.holdWrap}
    >
      <Animated.View style={[styles.holdFill, fillStyle]} />
      <Text style={styles.holdLabel}>{done ? "You're in 🔥" : label}</Text>
    </Pressable>
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
/**
 * Turn on reminders — the only screen here that asks the OS for something.
 *
 * Onboarding already told the athlete "we'll remind you before your trial
 * ends if you've allowed notifications", but nothing ever asked, so that
 * promise depended on a permission the app never requested. `syncLocalReminders`
 * and `scheduleDailyTrainingReminder` were both sitting unused behind it.
 *
 * Asked here rather than at launch because a permission prompt means more
 * when it follows a plan the athlete just chose. Declining is a plain
 * "Not now": a denied OS prompt is much harder to recover from than a skipped
 * screen, so there is no reason to push.
 */
function Reminders({
  username,
  weeklyGoal,
  hour,
  onNext,
}: {
  username: string;
  weeklyGoal: number;
  /** The hour they said they train at, or null for the default. */
  hour: number | null;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState(false);

  const onAllow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await ensureNotificationPermission();
      if (ok) {
        await scheduleDailyTrainingReminder(0, hour ?? undefined);
        // Pick the push token up now rather than next launch. The root layout
        // only registers when permission already exists — deliberately, so it
        // never prompts cold — which leaves this the moment it was granted.
        const uid = useAuthStore.getState().user?.uid;
        if (uid) registerForPushNudges(uid);
        // Confirm before moving on. A permission prompt that vanishes into the
        // next screen leaves the athlete unsure whether anything happened; the
        // beat here is short enough not to be a wait.
        setGranted(true);
        setBusy(false);
        setTimeout(onNext, 900);
        return;
      }
    } catch (error) {
      // A failed reminder is not worth blocking onboarding over — the athlete
      // can turn them on in Settings, and the session ahead matters more.
      captureError(error);
    }
    setBusy(false);
    onNext();
  }, [busy, onNext, hour]);

  const timeLabel = hour === null ? 'your usual time' : hour < 12 ? `${hour} am` : `${hour === 12 ? 12 : hour - 12} pm`;

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <ScreenHead
        eyebrow="STAY ON TRACK"
        tint={palette.green500}
        title="One nudge a day"
        body={`Around ${timeLabel}, on your ${weeklyGoal} training days. Never more.`}
      />

      {/* What the one nudge looks like, so "turn on reminders" is a yes to
          something specific rather than to an abstraction. */}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {granted ? (
          <Animated.View entering={FadeInUp.duration(320)} style={styles.rulePayoff}>
            <Text style={{ fontSize: 30 }}>🔔</Text>
            <Text style={font('extrabold', 17, { color: palette.ink, marginTop: 6 })}>
              You’re set{username ? `, ${username}` : ''}
            </Text>
            <Text style={font('regular', 12.5, { color: palette.grey600, textAlign: 'center' })}>
              {weeklyGoal} nudges a week. Nothing else.
            </Text>
          </Animated.View>
        ) : (
          <Animated.View entering={springIn(3)} style={styles.nudgeCard}>
            <View style={styles.nudgeIcon}>
              <Text style={{ fontSize: 18 }}>💪</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nudgeApp}>REPCHAMP · NOW</Text>
              <Text style={styles.nudgeTitle}>
                {username ? `${username}, your set is waiting` : 'Your set is waiting'}
              </Text>
              <Text style={styles.nudgeBody}>Two minutes keeps the streak alive.</Text>
            </View>
          </Animated.View>
        )}
      </View>

      {granted ? null : (
        <View style={{ gap: 12 }}>
          <PrimaryButton
            label={busy ? 'Setting up…' : 'Turn on reminders'}
            onPress={() => void onAllow()}
            disabled={busy}
          />
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            style={styles.tryNow}
          >
            <Text style={font('extrabold', 14, { color: palette.green600 })}>Not now</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * What a rep has to look like to count.
 *
 * The value screen earlier says form is "checked live" in a single bullet;
 * this is the one that says what that means in practice. It matters because
 * the app will refuse to count reps an athlete believes they did, and finding
 * that out mid-set feels like a bug rather than a standard.
 */
function HowRepsCount({
  username,
  weeklyGoal,
  level,
  onNext,
}: {
  username: string;
  weeklyGoal: number;
  level: FitnessLevel | null;
  onNext: () => void;
}) {
  // The athlete's own first-week number, not a generic one — the same figure
  // the plan screens showed, so the standard is attached to their target.
  const target = useMemo(() => firstWeekTarget(weeklyGoal, level), [weeklyGoal, level]);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={palette.blue400} second={palette.green400} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32, gap: 14 }}
        showsVerticalScrollIndicator={false}
        overScrollMode="always"
        nestedScrollEnabled
      >
        <ScreenHead
          eyebrow="WHAT COUNTS"
          tint={palette.blue50}
          title={'Half reps\ndon’t count'}
          body="Depth, tempo and alignment all have to land. A rep that misses is scored, not silently dropped, so you know why."
        />
        <Animated.View entering={ZoomIn.duration(320).delay(160)}>
          <HalfRepDemo />
        </Animated.View>

        <InsetGroup>
          {[
            { glyph: '📐', tile: palette.blue50, title: 'Depth', sub: 'Full range, or it doesn’t register' },
            { glyph: '⏱️', tile: palette.amber50, title: 'Tempo', sub: 'Too fast reads as a bounce' },
            { glyph: '📏', tile: palette.green100, title: 'Alignment', sub: 'Hips and back stay in line' },
          ].map((rule, i, all) => (
            <InsetRow key={rule.title} {...rule} index={i} last={i === all.length - 1} />
          ))}
        </InsetGroup>

        {/* The payoff: the standard just described, attached to their own number. */}
        <Animated.View entering={springIn(7)} style={styles.rulePayoff}>
          <Text style={font('bold', 12.5, { color: palette.green700 })}>
            {username ? `${username}, this week` : 'Your first week'}
          </Text>
          <View style={styles.rulePayoffRow}>
            <CountUp value={target} style={font('extrabold', 34, { color: palette.ink })} />
            <Text style={font('bold', 15, { color: palette.grey600, marginBottom: 5 })}>
              {' '}clean reps
            </Text>
          </View>
          <Text style={font('regular', 12, { color: palette.grey600 })}>
            Every one of them counted the same way.
          </Text>
        </Animated.View>
      </ScrollView>

      <PrimaryButton label="That’s the standard" onPress={onNext} />
    </View>
  );
}

/**
 * Where to put the phone.
 *
 * Every rep depends on the camera seeing a whole body, and the commonest way a
 * first session fails is a phone propped too close or too low. Cheaper to say
 * here than to let someone conclude the counter is broken.
 */
function SetUpYourSpace({ username, onNext }: { username: string; onNext: () => void }) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={palette.amber300} second={palette.green400} />
      <ScreenHead
        eyebrow="BEFORE YOUR FIRST SET"
        tint={palette.amber50}
        title="Prop your phone up"
        body="The camera needs your whole body in frame. Two metres back and roughly waist high is the sweet spot."
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: 12, paddingBottom: 12, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={ZoomIn.duration(320).delay(160)}>
          <SpaceDiagram />
        </Animated.View>

        <InsetGroup>
          {[
            { glyph: '📱', tile: palette.blue50, title: 'Lean it against something', sub: 'A wall, a bottle, a book' },
            { glyph: '↔️', tile: palette.green100, title: 'Step back', sub: 'About two metres from the phone' },
            { glyph: '💡', tile: palette.amber50, title: 'Face the light', sub: 'A window behind you hides you' },
          ].map((rule, i, all) => (
            <InsetRow key={rule.title} {...rule} index={i} last={i === all.length - 1} />
          ))}
        </InsetGroup>
      </ScrollView>

      {/* Ends on the set itself, not on "Ready". This is the last screen
          before the camera opens, so the button should say what happens. */}
      <PrimaryButton
        label={username ? `Start your first set, ${username}` : 'Start your first set'}
        onPress={onNext}
      />
    </View>
  );
}

function YourAntidote({ blocker, onNext }: { blocker: Blocker | null; onNext: () => void }) {
  const answer = useMemo(() => blockerAnswer(blocker), [blocker]);

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <Eyebrow label="WE BUILT FOR THIS" tint={palette.green500} />
        <Text style={[text.h1, { fontSize: 28, textAlign: 'center' }]}>{answer.title}</Text>
        <Text style={[text.body, styles.centeredCopy]}>{answer.blurb}</Text>
      </Animated.View>

      {/* A live board rather than a symbol in a circle: showing the thing being
          promised — your row climbing past a rival's — sells it far harder than
          an icon standing in for the idea. */}
      <View style={styles.antidoteVisual}>
        <Card style={styles.boardMock}>
          <View style={styles.boardMockHead}>
            <Text style={styles.chartEyebrow}>THIS WEEK</Text>
            <View style={styles.chartTrendPill}>
              <Text style={font('extrabold', 11, { color: palette.green700 })}>LIVE</Text>
            </View>
          </View>

          {BOARD_MOCK.map((r, i) => (
            <StaggerIn key={r.name} index={i} step={130}>
              <View style={[styles.boardMockRow, r.you && styles.boardMockRowYou]}>
                <Text style={styles.boardMockRank}>{r.medal}</Text>
                <View style={[styles.boardMockDot, { backgroundColor: r.tint }]}>
                  <Text style={{ fontSize: 15 }}>{r.emoji}</Text>
                </View>
                <Text
                  style={font('extrabold', 13.5, {
                    color: r.you ? palette.green700 : palette.ink,
                    flex: 1,
                  })}
                  numberOfLines={1}
                >
                  {r.name}
                </Text>
                <Text style={font('extrabold', 13, { color: palette.grey600 })}>{r.xp}</Text>
              </View>
            </StaggerIn>
          ))}
        </Card>

        <Floating distance={7} delay={420} style={styles.boardMockBadge}>
          <Image source={TROPHY_GOLD} style={{ width: 72, height: 48 }} contentFit="contain" />
        </Floating>
      </View>

      <StaggerIn index={3} step={130}>
        <View style={styles.commitRow}>
          <Text style={{ fontSize: 16 }}>{answer.emoji}</Text>
          <Text style={[text.captionMd, { flex: 1 }]}>
            The board wipes every Monday. Whoever showed up most, wins the week.
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
        <Eyebrow label="COUPLE MODE" tint={palette.red500} />
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>
          Skip a day and{'\n'}you let them down
        </Text>
        <Text style={[text.body, styles.centeredCopy]}>
          One streak between two people. Your rest day breaks their streak too — which is exactly
          why nobody takes one.
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

      <View style={{ gap: 12, marginBottom: 16 }}>
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
        <Eyebrow label="AI FORM COACH" tint={palette.purple500} />
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>
          A coach that never{'\n'}sees your video
        </Text>
        <Text style={[text.body, styles.centeredCopy]}>
          17 body points tracked live, scored while you move — and every frame stays on your
          phone. Nothing uploaded, nothing recorded.
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

      <View style={{ gap: 12, marginBottom: 16 }}>
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

/**
 * The sliding selection thumb behind the day picker.
 *
 * Springs between the seven slots so adjusting the weekly goal feels like one
 * control being dragged rather than seven buttons being toggled. Width is a
 * percentage so it tracks the row regardless of screen size.
 */
function DayThumb({ value }: { value: number }) {
  const slot = Math.min(6, Math.max(0, value - 1));
  const offset = useSharedValue(slot);

  useEffect(() => {
    offset.value = withTiming(slot, { duration: 180 });
  }, [slot, offset]);

  const style = useAnimatedStyle(() => ({
    left: `${(offset.value / 7) * 100}%`,
  }));

  return <Animated.View style={[styles.dayThumb, style]} pointerEvents="none" />;
}

/** Matches `styles.versusAvatar`, so the drawn rival and the athlete's own avatar line up. */
const VERSUS_AVATAR_SIZE = 92;

function Challenge({
  username,
  avatarUri,
  onNext,
}: {
  username: string;
  avatarUri: string | null;
  onNext: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const rival = OPPONENTS[0]!;
  /* The pace they will actually face: bots race from the athlete's own
     history (`domain/adaptivePace`), so the listed pace would be a number
     this athlete never meets. */
  const sessions = useProfileStore((s) => s.sessions);
  const pace = Math.round(matchedPace(rival.repsPerMinute, sessions, 'push'));
  const handle = username || 'You';

  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={palette.purple400} second={palette.green400} />
      <ScreenHead
        eyebrow="FIRST RIVAL"
        tint={palette.green50}
        title={`${rival.name} is ready\nto race you`}
        body={`${rival.name} races at your pace, a touch faster. Out-rep them and the XP is yours.`}
      />

      <View style={styles.versusStage}>
        <Animated.View entering={springIn(3)} style={styles.versusCard}>
          <View style={styles.rivalCol}>
            {/* The same drawn avatar Ada has everywhere else, so the first rival
                looks like the one met on the Friends tab — and is plainly app
                art with an AI tag, not someone's photograph. */}
            <Avatar initial={rival.initial} ai={rival.id} size={VERSUS_AVATAR_SIZE} />
            <Text style={styles.rivalName}>{rival.name}</Text>
            <View style={styles.aiTag}>
              <Text style={font('extrabold', 9.5, { color: palette.green700 })}>AI RIVAL</Text>
            </View>
            <Text style={styles.rivalPace}>{pace} reps/min</Text>
          </View>

          <View style={styles.vsPill}>
            <Text style={font('extrabold', 12, { color: palette.grey600 })}>VS</Text>
          </View>

          <View style={styles.rivalCol}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={[styles.versusAvatar, styles.versusAvatarYou]} />
            ) : (
              <View style={[styles.versusAvatar, styles.versusAvatarYou, { backgroundColor: palette.green50 }]}>
                <Text style={font('extrabold', 38, { color: palette.green700 })}>
                  {handle.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.rivalName} numberOfLines={1}>{handle}</Text>
            <View style={[styles.aiTag, { backgroundColor: palette.amber50, borderColor: '#fde68a' }]}>
              <Text style={font('extrabold', 9.5, { color: palette.amber600 })}>YOU</Text>
            </View>
            <Text style={styles.rivalPace}>your pace</Text>
          </View>
        </Animated.View>

        <Animated.View entering={springIn(5)}>
          <InsetGroup>
            <InsetRow glyph="🎯" tile={palette.blue50} title="Matched to you" sub="Their pace is set from your own history" index={0} />
            <InsetRow glyph="⚡" tile={palette.amber50} title="Win to earn XP" sub="Out-rep them to move up your league" index={1} last />
          </InsetGroup>
        </Animated.View>
      </View>

      <PrimaryButton label={`Race ${rival.name}`} onPress={onNext} />
      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="Not right now"
        style={[styles.declineButton, { minHeight: reservedControlHeight(54, fontScale) }]}
      >
        <Text style={font('extrabold', 15, { color: palette.ink })} {...scaleForRole('control')}>
          Not right now
        </Text>
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
  goal,
  onSelect,
  onNext,
}: {
  plan: 'year' | 'month';
  goal: string | null;
  onSelect: (p: 'year' | 'month') => void;
  onNext: () => void;
}) {
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const billingReady = isPurchasesConfigured();

  useEffect(() => {
    if (!billingReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPackages([]);
      return;
    }
    let cancelled = false;
    fetchOffering()
      .then((offering) => {
        if (cancelled) return;
        setPackages(sortPackagesForPaywall(offering?.availablePackages ?? []));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          captureError(error);
          setPackages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [billingReady]);

  const annual = packages?.find((p) => p.packageType === 'ANNUAL') ?? null;
  const monthly = packages?.find((p) => p.packageType === 'MONTHLY') ?? null;
  const selected = plan === 'year' ? annual : monthly;

  /* This button used to be `onPress={onNext}`.
   *
   * It said "Start free trial", showed a trial timeline and "No Payment Due
   * Now", and then simply advanced the screen — no purchase was ever attempted,
   * because the only `react-native-purchases` reference in this file was a type
   * import. Everyone who tapped it continued for free believing they had
   * started a trial, which is both why nothing ever converted here and a
   * promise the app was not keeping.
   *
   * Now it buys. Declining or failing still continues into the app: the free
   * staples are the product's floor, and trapping someone on a paywall they
   * cannot complete would be worse than the bug it replaces. */
  const [busy, setBusy] = useState(false);
  const onBuy = useCallback(async () => {
    if (busy) return;
    if (!selected) return onNext();

    setBusy(true);
    const uid = useAuthStore.getState().user?.uid ?? null;
    const result = await purchase(selected, uid);
    setBusy(false);

    // A cancel is a decision, not a failure — leave them on the screen so they
    // can pick the other plan rather than shunting them onward.
    if (result.cancelled) {
      track('paywall_dismissed', { source: 'onboarding' });
      return;
    }

    if (result.ok && result.isPro) {
      useProStore.getState().setPro(true);
      if (hasFreeTrial(selected)) track('trial_started', { plan: selected.packageType, source: 'onboarding' });
      track('subscribed', { plan: selected.packageType, source: 'onboarding' });
      onNext();
      return;
    }

    console.warn('[RepChamp] onboarding purchase failed:', result.message);
    showDialog({
      title: 'Could not start',
      message: result.message ?? 'Please try again in a moment.',
      tone: 'info',
      actions: [{ label: 'Continue', variant: 'primary', onPress: onNext }],
    });
  }, [busy, selected, onNext]);

  const onSkip = useCallback(() => {
    if (busy) return;
    track('paywall_dismissed', { source: 'onboarding' });
    onNext();
  }, [busy, onNext]);

  const trialDays = selected ? trialLengthDays(selected) : null;
  const trialLabel = selected ? trialPeriodLabel(selected) : null;
  const reminderDay =
    trialDays != null && trialDays > 1 ? Math.max(1, trialDays - 1) : null;

  const timeline = [
    {
      icon: '🔓',
      color: palette.green600,
      title: 'Today',
      body: 'Unlock the full exercise library, programmes, and form reports.',
    },
    ...(reminderDay != null
      ? [
          {
            icon: '🔔',
            color: palette.green500,
            title: `In ${reminderDay} day${reminderDay === 1 ? '' : 's'} — Reminder`,
            body: "We'll remind you before your trial ends if you've allowed notifications.",
          },
        ]
      : []),
    {
      icon: '👑',
      color: palette.amber500,
      title:
        trialDays != null
          ? `In ${trialDays} day${trialDays === 1 ? '' : 's'} — Billing starts`
          : 'Billing',
      body:
        trialDays != null
          ? 'You can cancel any time before then.'
          : 'Cancel anytime in Google Play or App Store settings.',
    },
  ];

  const eyebrow = selected ? trialRibbon(selected) : null;
  const headline =
    trialLabel != null
      ? `${trialLabel.charAt(0).toUpperCase()}${trialLabel.slice(1)} free,\nbecause week one is the hard part`
      : 'Go Pro when you’re ready';

  return (
    <View style={styles.step}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.stepPadded, { paddingBottom: 8 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <Floating distance={7}>
          <Image source={TROPHY_GOLD} style={styles.paywallTrophy} contentFit="contain" />
        </Floating>
        {eyebrow ? (
          <Eyebrow label={eyebrow} tint={palette.amber500} />
        ) : null}
        <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>{headline}</Text>
        <Text style={[text.body, styles.centeredCopy]}>
          {goal ? `Your plan — ${goalPlan(goal).title.toLowerCase()} — with every Pro exercise and programme unlocked. Cancel anytime.` : 'Every Pro exercise and programme, unlocked. Cancel anytime.'}
        </Text>
      </Animated.View>

      <View style={{ marginTop: 24, gap: 4 }}>
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
            <View style={{ flex: 1, paddingBottom: 12 }}>
              <Text style={font('extrabold', 16, { color: palette.ink })}>{t.title}</Text>
              <Text style={text.captionMd}>{t.body}</Text>
            </View>
          </StaggerIn>
        ))}
      </View>

      {packages === null ? (
        <Spinner color={palette.green500} style={{ marginVertical: 20 }} />
      ) : !billingReady || (!annual && !monthly) ? (
        <Text style={[text.captionMd, { textAlign: 'center', marginTop: 16 }]}>
          You can keep training free — Pro unlocks later from Profile when billing is connected.
        </Text>
      ) : (
        <>
          {annual ? (
            <PlanOption
              selected={plan === 'year'}
              onPress={() => onSelect('year')}
              title={planTitle(annual)}
              subtitle="billed annually"
              price={annual.product.priceString}
              ribbon={trialRibbon(annual) ?? undefined}
            />
          ) : null}
          {monthly ? (
            <PlanOption
              selected={plan === 'month'}
              onPress={() => onSelect('month')}
              title={planTitle(monthly)}
              subtitle="billed monthly"
              price={monthly.product.priceString}
              ribbon={trialRibbon(monthly) ?? undefined}
            />
          ) : null}
        </>
      )}

      {selected && hasFreeTrial(selected) ? (
        <Text style={styles.noPayment}>✓ No Payment Due Now</Text>
      ) : null}
      <PrimaryButton
        label={busy ? 'Starting…' : selected ? subscribeCtaLabel(selected) : 'Continue'}
        onPress={onBuy}
        disabled={busy}
      />
      <Text style={[text.captionMd, { textAlign: 'center', marginTop: 12 }]}>
        {selected
          ? renewDisclosure(selected)
          : FREE_REP_LIMIT > 0
            ? `Start free with ${FREE_REP_LIMIT} reps. Couple mode is always free.`
            : 'Couple mode is always free.'}
      </Text>
    </ScrollView>

    {/* The way out, pinned outside the ScrollView on purpose.
     *
     * Without it this step is a dead end whenever a plan resolves: `onBuy` only
     * falls through to `onNext()` when there is nothing to sell, so cancelling
     * the billing sheet returned here with no exit — which is what Google Play
     * review flagged as a paywalled app.
     *
     * It has to stay out of the scroll region. Below the trophy, timeline and
     * plan cards there is no room left on a short screen, and a reviewer who
     * does not think to scroll sees the same wall the rejection was about. */}
    <View style={styles.paywallSkipBar}>
      <Pressable
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel="Maybe later"
        style={styles.paywallSkip}
      >
        <Text style={font('extrabold', 14, { color: palette.grey600 })}>Maybe later</Text>
      </Pressable>
    </View>
    </View>
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
 * The last screen: the athlete's own face and handle, ready to race.
 *
 * It is the only thing between the plan and the first set. The paywall already
 * had its one chance at step 21; a second sales page here was the same offer
 * twice, so this screen sells nothing and just closes the loop on the profile
 * the athlete built.
 */
function ReadyToRace({
  username,
  avatarUri,
  onDone,
}: {
  username: string;
  avatarUri: string | null;
  onDone: () => void;
}) {
  const handle = username || 'champion';
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <Aurora tint={palette.green400} second={palette.amber300} />
      <StepScroll>
        <View style={styles.offerMiddle}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.readyAvatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.readyAvatar} />
            ) : (
              <View style={[styles.readyAvatar, styles.photoPlaceholder]}>
                <Text style={font('extrabold', 48, { color: palette.green600 })}>
                  {handle.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.readyAvatarBadge}>
              <Text style={{ fontSize: 16, color: palette.white }}>✓</Text>
            </View>
          </Animated.View>
          <Animated.Text
            entering={springIn(2)}
            style={font('extrabold', 28, { color: palette.ink, marginTop: 22, textAlign: 'center' })}
            {...scaleForRole('heading')}
          >
            Ready to race, @{handle}
          </Animated.Text>
          <Animated.Text entering={springIn(3)} style={[text.body, styles.centeredCopy]}>
            Your plan is built. Your first set starts the moment you tap below.
          </Animated.Text>
          <View style={styles.readyStats}>
            {READY_STATS.map((stat, i) => (
              <Animated.View key={stat.label} entering={springIn(i + 4, 90)}>
                <View style={styles.readyStat}>
                  <Text style={{ fontSize: 20 }}>{stat.emoji}</Text>
                  <Text style={font('extrabold', 17, { color: palette.ink, marginTop: 4 })}>{stat.value}</Text>
                  <Text style={styles.readyStatLabel}>{stat.label}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>
      </StepScroll>
      <PrimaryButton label="Start my first set" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  // iOS-kit screens
  nudgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: '#ffffff',
  },
  nudgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeApp: { ...font('bold', 10.5, { color: palette.grey600 }), letterSpacing: 0.8 },
  nudgeTitle: { ...font('extrabold', 15, { color: palette.ink }), marginTop: 2 },
  nudgeBody: { ...font('regular', 13, { color: palette.grey600 }), marginTop: 1 },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 26 },
  freqDial: { alignItems: 'center', marginTop: 26 },
  freqNumber: { ...font('extrabold', 64, { color: palette.ink }), letterSpacing: -2.5, lineHeight: 70 },
  freqUnit: { ...font('extrabold', 10.5, { color: palette.grey600 }), letterSpacing: 2, marginTop: -2 },
  freqNote: {
    alignItems: 'center',
    gap: 2,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignSelf: 'center',
  },
  photoStage: { alignItems: 'center', marginTop: 26, marginBottom: 22 },
  photoRingBox: { width: 176, height: 176, alignItems: 'center', justifyContent: 'center' },
  photoRing: { flex: 1, borderRadius: 88 },
  photoRingGap: {
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBig: { width: 154, height: 154, borderRadius: 77 },
  photoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 3,
    borderColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  photoHandle: { ...font('extrabold', 22, { color: palette.ink }), letterSpacing: -0.6, marginTop: 14 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  photoMini: { width: 40, height: 40, borderRadius: 20 },
  vaultStage: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 190 },
  offerPrice: { ...font('extrabold', 28, { color: palette.ink }), letterSpacing: -0.8, marginTop: 18 },

  root: { flex: 1, backgroundColor: palette.canvas },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 4,
    zIndex: 5,
  },
  stepWrap: { flex: 1 },
  homeCard: {
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  step: { flex: 1, paddingHorizontal: 20, paddingBottom: 24 },
  stepPadded: { paddingTop: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  brandMarkImg: { width: 40, height: 40 },
  tagline: { ...text.caption, fontSize: 13, textAlign: 'center', marginTop: 4 },
  welcomeBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  welcomeWordmark: { ...font('extrabold', 22, { color: palette.ink }), letterSpacing: -0.5 },
  welcomeCopy: { alignItems: 'center', marginTop: 20 },
  welcomeTitle: {
    ...font('extrabold', 30, { color: palette.ink }),
    letterSpacing: -0.8,
    lineHeight: 35,
    textAlign: 'center',
  },
  welcomeBody: {
    ...font('regular', 17, { color: palette.grey600 }),
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 320,
  },
  hero: {
    flex: 1,
    minHeight: 0,
    borderRadius: 32,
    borderCurve: 'continuous',
    marginTop: 18,
    backgroundColor: '#f6f7f8',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  heroGlow: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: -40,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(34,197,94,0.16)',
  },
  heroStage: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  heroCouple: { width: '100%', aspectRatio: WELCOME_HERO_ASPECT },
  heroBadgeLeft: { position: 'absolute', top: 16, left: 16, zIndex: 2 },
  heroBadgeRight: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.white,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  heroBadgeLabel: {
    ...font('bold', 9.5, { color: palette.grey600 }),
    letterSpacing: 0.5,
  },
  centeredCopy: { textAlign: 'center', marginTop: 8, maxWidth: 300, alignSelf: 'center' },

  // Showcase (demo video in a phone frame)
  showcaseEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    shadowColor: palette.green600,
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
    borderRadius: radius['6xl'],
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  // Value screens
  valueVisual: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 150, marginVertical: 8 },
  valuePoint: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  valuePointIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
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
    borderColor: palette.green700,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.green600,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },
  valueBubbleImg: { width: 152, height: 101 },
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
    padding: 16,
    borderRadius: radius['4xl'],
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  chartEyebrow: {
    ...font('extrabold', 10, { color: palette.grey600 }),
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  chartTrendPill: {
    backgroundColor: palette.green50,
    borderRadius: radius['2xl'],
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  chartAxisLabel: { ...font('bold', 9.5, { color: palette.grey450 }) },
  chartTrophy: { position: 'absolute', top: -12, right: -6, zIndex: 3 },

  // Personalised plan / projection / first-week screens
  planVisual: { alignItems: 'center', justifyContent: 'center', marginTop: 24, marginBottom: 8 },
  planCard: { width: '100%', borderRadius: radius['4xl'], padding: 20 },
  planCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  planCardEyebrow: {
    ...font('extrabold', 10.5, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 2,
  },
  planWeekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  planDay: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDayOn: { backgroundColor: palette.white },
  planCardFoot: {
    ...font('semibold', 12, { color: 'rgba(240,255,244,0.92)' }),
    marginTop: 16,
    textAlign: 'center',
  },
  /* Sized by its content (flexBasis auto, never shrinks) and only then grows into
     spare room. At `flex: 1` it shared the free space equally with the spacer
     above the button, came out shorter than the chart card, and the card spilled
     over the note below it. */
  projectionWrap: {
    flexGrow: 1,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  projectionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.green50,
    borderRadius: radius.xl,
    padding: 12,
    marginTop: 4,
  },
  commitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.amber50,
    borderRadius: radius.xl,
    padding: 12,
    marginTop: 8,
  },
  paywallTrophy: { width: 104, height: 69 },
  holdWrap: {
    height: 56,
    borderRadius: 28,
    borderCurve: 'continuous',
    backgroundColor: palette.green100,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: palette.green600, opacity: 0.35 },
  holdLabel: { ...font('extrabold', 16, { color: palette.ink }), paddingHorizontal: 12, textAlign: 'center' },

  commitFootnote: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginTop: 8,
  },
  // Question steps
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  questionRowActive: { borderColor: palette.green500, borderWidth: 2, backgroundColor: palette.green50 },
  questionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Antidote screen
  antidoteVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    position: 'relative',
  },
  boardMock: { width: '100%', maxWidth: 320, padding: 16, borderRadius: radius['4xl'] },
  boardMockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  boardMockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
  },
  boardMockRowYou: {
    backgroundColor: palette.green50,
    borderWidth: 1.5,
    borderColor: palette.green200,
  },
  boardMockRank: { fontSize: 15, width: 22, textAlign: 'center' },
  boardMockDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardMockBadge: { position: 'absolute', top: -26, right: -2, zIndex: 4 },
  antidoteBubble: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderColor: palette.green700,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.green600,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },

  // Couple mode screen
  coupleVisual: { alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 4 },
  coupleCard: {
    width: '100%',
    borderRadius: radius['5xl'],
    paddingVertical: 20,
    alignItems: 'center',
  },
  coupleFaces: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  coachBubbleImg: { width: 162, height: 108 },
  coachBubble: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: palette.purple100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.purple600,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 8,
  },
  coachCue: {
    backgroundColor: palette.white,
    borderRadius: radius['2xl'],
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...shadow.card,
  },
  coachCueTop: { position: 'absolute', top: 4, right: -10 },
  coachCueBottom: { position: 'absolute', bottom: 26, left: -12 },

  // First-week ladder
  weekWrap: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    padding: 16,
    marginTop: 16,
    ...surfaceShadow,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  weekDay: { flex: 1, alignItems: 'center' },
  weekDayValue: { ...font('extrabold', 12, { color: palette.ink }), marginBottom: 4 },
  weekBarTrack: { height: 88, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  weekBar: {
    width: '68%',
    borderRadius: radius.sm,
    backgroundColor: palette.green400,
    minHeight: 4,
  },
  // The opening day is the one they act on today, so it carries the brand colour.
  weekBarFirst: { backgroundColor: palette.green600 },
  weekRestDash: { width: '52%', height: 3, borderRadius: radius.xs, backgroundColor: palette.divider },
  weekDayLabel: { ...font('bold', 9.5, { color: palette.grey600 }), marginTop: 8 },
  weekDayLabelFirst: { ...font('extrabold', 9.5, { color: palette.green700 }), letterSpacing: 0.4 },
  weekTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.divider,
  },
  weekTotalLeft: { gap: 4 },
  weekTotalLabel: {
    ...font('extrabold', 9.5, { color: palette.grey600 }),
    letterSpacing: 1.6,
  },
  weekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.green50,
    borderRadius: radius['2xl'],
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 150,
  },


  // Projected-climb bar chart (Building step)
  projectionCard: {
    width: '100%',
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    padding: 16,
    marginTop: 16,
    ...surfaceShadow,
  },
  projectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  socialButton: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  /* Dims without moving. Swapping the mark for a spinner inside a fixed-width
     slot keeps the label from sliding sideways at the moment of the tap. */
  socialButtonBusy: { opacity: 0.6 },
  socialGlyph: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },

  /* The three things sign-in is protecting. */
  saveVault: { marginTop: 26, alignItems: 'center' },
  /* Wraps rather than clips. Three 88pt cards plus two 12pt gaps need 288pt,
     and a 320pt screen leaves only 280 after the step's padding — so the row
     overflowed at the default font size on small devices, and on every device
     once the OS font scale passed ~1.5, with the third card cut off rather
     than reflowed. */
  saveVaultRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  saveVaultItem: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    /* A floor the card may drop below when the row is tight — as a hard
       `minWidth` it was the thing forcing the overflow. */
    flexBasis: 88,
    flexShrink: 1,
  },
  saveVaultIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveVaultLabel: font('extrabold', 12, { color: palette.ink }),

  signInFinePrint: {
    ...font('bold', 11.5, { color: palette.grey600 }),
    textAlign: 'center',
    marginTop: 14,
    maxWidth: 290,
    alignSelf: 'center',
  },

  /* Success takes the whole screen — see `SignedIn`. */
  signedInScreen: { alignItems: 'center', justifyContent: 'center' },
  signedInBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedInBadgeTick: font('extrabold', 38, { color: palette.green600 }),
  /* Runs for the length of the parent's advance timer, so the pause reads as
     progress rather than as a stall. */
  signedInBar: {
    width: 132,
    height: 4,
    borderRadius: 2,
    marginTop: 26,
    backgroundColor: palette.border,
    overflow: 'hidden',
  },
  signedInBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: palette.green500,
  },
  authError: {
    ...font('bold', 12.5, { color: palette.red500 }),
    textAlign: 'center',
    marginTop: 8,
  },
  /* Deliberately quiet: the primary path is claiming a new name, and this must
     not compete with it. Only the returning athlete is looking for it. */
  haveAccountLink: {
    ...font('medium', 13, { color: palette.grey450 }),
    textAlign: 'center',
    marginTop: 16,
  },
  haveAccountStrong: font('extrabold', 13, { color: palette.green700 }),
  /* The success counterpart to authError. Green rather than red, and a tick
     rather than bare text, because "it worked" should be readable at a glance
     without being read word by word. */
  signedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: palette.tintGreenTop,
  },
  signedInTick: font('extrabold', 13, { color: palette.green600 }),
  signedInText: {
    ...font('bold', 12.5, { color: palette.green700 }),
    flexShrink: 1,
  },
  legal: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
  },
  legalLink: {
    color: palette.grey600,
    textDecorationLine: 'underline',
  },
  exerciseTile: {
    flex: 1,
    borderRadius: radius['5xl'],
    padding: 16,
    height: 210,
    justifyContent: 'space-between',
  },
  usernameField: {
    // `minHeight` at render time — see `@/theme/fontScale`. A text field that
    // cannot grow crops the name the athlete is typing into it.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderRadius: radius['2xl'],
    paddingHorizontal: 16,
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
    marginTop: 20,
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
    padding: 16,
  },
  skip: { alignItems: 'center', marginTop: 12, padding: 8 },
  /* Sits below the paywall's scroll region so "Maybe later" is on screen at any
     height. The top border keeps it from reading as part of the plan cards. */
  paywallSkipBar: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.canvas,
  },
  /* Not the shared `skip` style, whose 8pt padding gives a ~34pt target — 14pt
     under Android's 48pt minimum. This is the one control a Play reviewer has
     to find and press, so it gets a full-width, full-height target. */
  paywallSkip: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tryNow: { alignItems: 'center', marginTop: 12, paddingVertical: 4 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius['2xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
  },
  /* The result a screen lands on, tinted so it reads as a conclusion rather
     than one more row in the list above it. */
  rulePayoff: {
    alignItems: 'center',
    padding: 14,
    borderRadius: radius['3xl'],
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
  },
  rulePayoffRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  /* Phone, gap, person — the setup being described, at a glance. */
  spaceStage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 22,
  },
  spacePhone: {
    width: 34,
    height: 58,
    borderRadius: 8,
    backgroundColor: palette.ink,
    padding: 3,
  },
  spacePhoneScreen: { flex: 1, borderRadius: 5, backgroundColor: palette.green400 },
  spaceDistance: {
    ...font('bold', 11, { color: palette.grey600 }),
    borderTopWidth: 1,
    borderColor: palette.border,
    paddingTop: 4,
    minWidth: 62,
    textAlign: 'center',
  },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
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
  frequencyCard: { padding: 24, marginTop: 24, borderRadius: radius['6xl'] },
  frequencyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  frequencyValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
  },
  dayPicker: {
    flexDirection: 'row',
    marginTop: 20,
    position: 'relative',
    backgroundColor: palette.divider,
    borderRadius: radius.lg,
    padding: 4,
  },
  /** Springs between the seven slots; width matches one slot of the row. */
  dayThumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '14.28%',
    backgroundColor: palette.green500,
    borderRadius: radius.md,
  },
  dayChip: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frequencyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f1f7f2',
    borderRadius: radius.xl,
    padding: 12,
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
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius['2xl'],
  },
  versusStage: { flex: 1, justifyContent: 'center', gap: 20 },
  versusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  versusAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versusAvatarYou: { borderWidth: 3, borderColor: palette.green500 },
  vsPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.canvas,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rivalCol: { flex: 1, alignItems: 'center', gap: 6 },
  // Matches the AI pill used on the Arena leaderboard, so a labelled partner
  // reads the same everywhere in the app.
  aiTag: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  rivalName: { ...font('extrabold', 16, { color: palette.ink }), marginTop: 10 },
  rivalPace: { ...font('bold', 11.5, { color: palette.grey600 }) },
  declineButton: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    marginTop: 8,
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
  buildList: { width: '100%', paddingHorizontal: 16, paddingVertical: 8, marginTop: 24 },
  buildRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
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
  timelineRow: { flexDirection: 'row', gap: 12 },
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
    gap: 12,
    borderWidth: 2,
    borderRadius: radius['2xl'],
    paddingVertical: 16,
    paddingHorizontal: 16,
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
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    width: 96,
    alignItems: 'center',
  },
  noPayment: {
    ...font('extrabold', 13, { color: palette.ink }),
    textAlign: 'center',
    marginVertical: 12,
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
  readyAvatarWrap: { width: 132, height: 132 },
  readyAvatar: { width: 132, height: 132, borderRadius: 66, borderWidth: 4, borderColor: palette.white },
  readyAvatarBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.green600,
    borderWidth: 3,
    borderColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  readyStat: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius['2xl'],
    paddingVertical: 12,
    paddingHorizontal: 16,
    /* A floor the card may drop below when the row is tight, not a hard
       minimum that forces an overflow. */
    flexBasis: 96,
    flexShrink: 1,
  },
  readyStatLabel: { ...font('bold', 10.5, { color: palette.grey600 }), marginTop: 4 },
  offerReadyBubble: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: palette.amber50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.amber500,
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
