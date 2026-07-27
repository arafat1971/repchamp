import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreathingImage, Floating, StaggerIn } from '@/components/motion';
import { ProgressRing } from '@/components/session/ProgressRing';
import { Card, PressableScale, PrimaryButton, ProgressBar } from '@/components/ui';
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
const TOTAL_PROGRESS_STEPS = 12;

// Onboarding media — the in-app demo clip and the illustrated value-screen art.
const DEMO_VIDEO = require('../assets/remove_text_bro_thought_202607272319.mp4');
const HERO_COUPLE = require('../assets/couple-hero.png');
const TROPHY_GOLD = require('../assets/trophy-gold.png');
const MEDAL_BRONZE = require('../assets/medal-bronze.png');
const BADGE_VS = require('../assets/badge-vs.png');
const FIRE_FLAME = require('../assets/fire-flame.png');
const IC_PUSHUP = require('../assets/ic-pushup.png');

const GOALS = [
  { id: 'strength', emoji: '🏋️', label: 'Get Stronger', tint: palette.green50 },
  { id: 'reps', emoji: '#️⃣', label: 'Track My Reps', tint: palette.blue150 },
  { id: 'form', emoji: '✅', label: 'Improve Form', tint: palette.purple100 },
  { id: 'compete', emoji: '🏆', label: 'Compete With Others', tint: palette.amber50 },
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
  const [weeklyGoal, setWeeklyGoal] = useState(4);
  const [buildPercent, setBuildPercent] = useState(0);
  const [plan, setPlan] = useState<'year' | 'month'>('year');

  const next = useCallback(() => setStep((s) => s + 1), []);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const finish = useCallback(() => {
    completeOnboarding({ username: username || 'champion', weeklyGoal, avatarUri });
    router.replace('/(tabs)');
  }, [completeOnboarding, username, weeklyGoal, avatarUri, router]);

  /* Build-profile progress animation (step 10). */
  useEffect(() => {
    if (step !== 10) return;
    setBuildPercent(0);
    const id = setInterval(() => {
      setBuildPercent((p) => {
        if (p >= 100) {
          clearInterval(id);
          setTimeout(() => setStep((s) => (s === 10 ? 11 : s)), 650);
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

  const showProgressBar = step > 0 && step < 10;
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
        {step === 0 ? <Welcome onNext={next} /> : null}
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
            title="Better together"
            body="Pair with your partner, share one streak, and race friends head-to-head in live duels."
            points={[
              { icon: '💞', title: 'Couple mode', sub: 'One shared streak, two phones' },
              { icon: '⚔️', title: 'Live duels', sub: 'Race a rival rep-for-rep' },
              { icon: '🔥', title: 'Keep the streak', sub: 'Neither of you wants to break it' },
            ]}
            visual={
              <View style={styles.valueCoupleWrap}>
                <Image source={HERO_COUPLE} style={styles.valueCoupleImg} contentFit="contain" />
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
            title="Compete and climb"
            body="Earn XP for every set, rise through the leagues, and top the weekly leaderboard."
            points={[
              { icon: '🏆', title: 'Weekly leagues', sub: 'Bronze to the top tier' },
              { icon: '⚡', title: 'Earn XP', sub: 'Every rep moves you up' },
              { icon: '📈', title: 'Track progress', sub: 'Personal bests, week over week' },
            ]}
            visual={
              <View style={styles.valueTrophyWrap}>
                <Floating distance={8}>
                  <Image source={TROPHY_GOLD} style={styles.valueTrophyImg} contentFit="contain" />
                </Floating>
                <Floating distance={5} delay={200} style={styles.valueMedal}>
                  <Image source={MEDAL_BRONZE} style={{ width: 40, height: 40 }} contentFit="contain" />
                </Floating>
                <Floating distance={6} delay={450} style={styles.valueFire}>
                  <Image source={FIRE_FLAME} style={{ width: 38, height: 38 }} contentFit="contain" />
                </Floating>
              </View>
            }
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
        {step === 9 ? <Challenge onNext={() => setStep(10)} /> : null}
        {step === 10 ? <Building percent={buildPercent} /> : null}
        {step === 11 ? <Paywall plan={plan} onSelect={setPlan} onNext={next} /> : null}
        {step === 12 ? <Offer onDone={finish} /> : null}
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

function Welcome({ onNext }: { onNext: () => void }) {
  const router = useRouter();
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

      <View style={{ gap: 11, marginTop: 16 }}>
        <SocialButton label="Sign up with Google" glyph="G" glyphColor="#4285F4" onPress={onNext} />
        <SocialButton label="Sign up with Apple" glyph="" glyphColor={palette.ink} onPress={onNext} />
      </View>
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

function Challenge({ onNext }: { onNext: () => void }) {
  return (
    <View style={[styles.step, styles.stepPadded]}>
      <View style={styles.challengeChip}>
        <Text style={font('extrabold', 11, { color: palette.green600 })}>CHALLENGE</Text>
      </View>
      <Text style={[text.h1, { fontSize: 30, marginTop: 14, textAlign: 'center' }]}>
        Incoming Challenge
      </Text>
      <Text style={[text.body, styles.centeredCopy]}>
        Jeff has challenged you to a rep fight. Beat him to claim the XP.
      </Text>

      <View style={styles.versusRow}>
        <View style={[styles.versusAvatar, { backgroundColor: palette.blue300 }]}>
          <Text style={font('extrabold', 28, { color: palette.blue900 })}>J</Text>
        </View>
        <Text style={{ fontSize: 26 }}>⚡</Text>
        <View style={[styles.versusAvatar, { backgroundColor: palette.green50 }]}>
          <Text style={{ fontSize: 30 }}>🧍</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Accept Fight" onPress={onNext} />
      <Pressable onPress={onNext} accessibilityRole="button" style={styles.declineButton}>
        <Text style={font('extrabold', 15, { color: palette.ink })}>Decline Fight</Text>
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
      <Text style={[text.h1, { fontSize: 27, textAlign: 'center' }]}>
        Start your FREE 3-Day trial to continue
      </Text>

      <View style={{ marginTop: 24, gap: 2 }}>
        {timeline.map((t, i) => (
          <View key={t.title} style={styles.timelineRow}>
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
          </View>
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

function Offer({ onDone }: { onDone: () => void }) {
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
        Your one-time offer
      </Text>

      <View style={styles.offerMiddle}>
        <LinearGradient colors={[palette.green400, palette.green600]} style={styles.offerBadge}>
          <Text style={font('extrabold', 54, { color: palette.white })}>34%</Text>
          <Text style={font('extrabold', 20, { color: palette.white })}>OFF</Text>
        </LinearGradient>
        <Text style={{ marginTop: 28 }}>
          <Text style={font('extrabold', 20, { color: palette.grey450, textDecorationLine: 'line-through' })}>
            34,99 €
          </Text>
          <Text style={font('extrabold', 20, { color: palette.ink })}> 22,99 €/year</Text>
        </Text>
        <Text style={[text.captionMd, { marginTop: 6 }]}>
          34% less than the regular annual plan
        </Text>
      </View>

      <PrimaryButton label="Start Free Trial" onPress={onDone} />
      <Text style={styles.commitment}>✓ No Commitment · Cancel Anytime</Text>
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
  valueBubbleImg: { width: 96, height: 96 },
  valueCoupleWrap: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  valueCoupleImg: { width: 230, height: 172 },
  valueBadgeVs: { position: 'absolute', top: 4, right: 44 },
  valueTrophyWrap: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  valueTrophyImg: { width: 150, height: 150 },
  valueMedal: { position: 'absolute', left: 46, bottom: 14 },
  valueFire: { position: 'absolute', right: 50, top: 18 },
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
