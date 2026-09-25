import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import type { HomeFocus } from '@/domain/homeFocus';
import { getExercise, type ExerciseId } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/* Shot on the same green as `gradients.brandStrong`, so the photograph reads
   as part of the card rather than a rectangle pasted onto it. */
const COUPLE_HERO = require('../../../assets/couple-hero.png');

/* The same illustrations the Quick Start tiles use. The daily-challenge hero
   showed a generic 🎯 while a drawn Push-Ups figure already existed two cards
   below it — the card announcing the movement was the one not depicting it. */
const EXERCISE_ART: Partial<Record<ExerciseId, number>> = {
  push: require('../../../assets/ic-pushup.png'),
  squat: require('../../../assets/ic-squat.png'),
};

/**
 * Card treatment per movement, so the hero matches what it depicts.
 *
 * The daily-challenge card was hardcoded to `gradients.squat` — purple — for
 * every exercise. A Push-Ups challenge rendered purple while the Push-Ups
 * figure on it, the Quick Start tile below it and `colors.push` were all green.
 * The card contradicted its own illustration.
 */
const EXERCISE_THEME: Partial<
  Record<ExerciseId, { colors: HeroColors; glow: keyof typeof shadow }>
> = {
  push: { colors: gradients.heroEmerald, glow: 'brand' },
  squat: { colors: gradients.heroViolet, glow: 'squat' },
};

type HeroColors = readonly [string, string, ...string[]];

/** The rendered shape of a focus: what the card says and where it goes. */
interface HeroContent {
  emoji: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  colors: HeroColors;
  glow: keyof typeof shadow;
  /**
   * Optional photograph behind the copy. Only the couple states carry one —
   * the card has to stay legible, and an image behind every focus would turn
   * the one adaptive action on Home back into wallpaper.
   */
  image?: number;
  /**
   * A corner illustration, as opposed to `image`'s full-bleed photograph.
   * Replaces the emoji on cards that name a specific movement — drawn art at
   * 92pt carries a card that a 40pt glyph cannot.
   */
  art?: number;
}

/**
 * Translate a `HomeFocus` decision into card content.
 *
 * Copy lives here, deliberately close to the visual, while the *choice* of which
 * focus to show stays in the pure `selectHomeFocus`. Keeping them apart means the
 * priority logic is testable and the wording is easy to tune without touching it.
 */
function contentFor(focus: HomeFocus): HeroContent {
  switch (focus.kind) {
    case 'first-session':
      return {
        emoji: '💪',
        eyebrow: 'START HERE',
        title: 'Your first set',
        body: '60 seconds, no target — just find your rhythm.',
        cta: 'Start now',
        colors: gradients.heroEmerald,
        glow: 'brand',
      };
    case 'streak-at-risk':
      return {
        emoji: '🔥',
        eyebrow: `${focus.streak} DAY STREAK`,
        title: `Don't break it with ${focus.partnerName}`,
        body: 'One of you still has to train today to keep the streak alive.',
        cta: 'Train now',
        colors: gradients.heroAmber,
        glow: 'amber',
      };
    case 'partner-trained':
      return {
        emoji: '👀',
        eyebrow: 'YOUR TURN',
        title: `${focus.partnerName} already trained`,
        body: `${focus.partnerName} showed up today. Don’t leave them hanging.`,
        colors: gradients.brandStrong,
        cta: 'Catch up',
        glow: 'brand',
        image: COUPLE_HERO,
      };
    case 'invite-partner':
      return {
        emoji: '🤝',
        eyebrow: 'COUPLE MODE',
        title: 'Train with your partner',
        body: 'A shared streak that only survives if you both show up.',
        cta: 'Invite them',
        colors: gradients.brandStrong,
        glow: 'brand',
        image: COUPLE_HERO,
      };
    case 'daily-challenge': {
      const def = getExercise(focus.exercise);
      return {
        emoji: '🎯',
        eyebrow: 'TODAY’S CHALLENGE',
        title: `${focus.target} ${def.label}`,
        body: 'Clear it to keep your daily rhythm going.',
        cta: 'Take the challenge',
        /* Falls back to purple for movements with no theme of their own, which
           is what every exercise used to get regardless. */
        ...(EXERCISE_THEME[focus.exercise] ?? { colors: gradients.heroViolet, glow: 'squat' as const }),
        art: EXERCISE_ART[focus.exercise],
      };
    }
    case 'goal-met':
      return {
        emoji: '🏆',
        eyebrow: 'WEEKLY GOAL',
        title: `${focus.days} of ${focus.goal} days — done`,
        body: 'You hit your week. Bank a bonus set, or rest easy.',
        cta: 'Bonus set',
        colors: gradients.heroAmber,
        glow: 'amber',
      };
    case 'recovery':
      return {
        emoji: '🧘',
        eyebrow: 'RECOVERY',
        title: 'Take it easy',
        body: 'You’ve done your bit today. A little mobility keeps you loose.',
        cta: 'Mobility',
        colors: gradients.heroIndigo,
        glow: 'brand',
      };
  }
}

/**
 * The one adaptive action on Home.
 *
 * Renders whatever `selectHomeFocus` decided is most important right now, as a
 * single dominant card. `onPress` is wired by the screen to the right
 * destination for the focus kind (start a session, open the invite modal, …).
 *
 * `progress` is shown only on the daily challenge: a target with no sense of
 * how far along you are is a chore; with one it is a gap you want to close.
 */
export function HeroCard({
  focus,
  onPress,
  progress,
}: {
  focus: HomeFocus;
  onPress: () => void;
  progress?: { value: number; target: number };
}) {
  const c = contentFor(focus);
  const [width, setWidth] = useState(0);
  const showProgress = !c.image && focus.kind === 'daily-challenge' && !!progress;
  const pct = showProgress && progress ? Math.min(1, progress.value / Math.max(1, progress.target)) : 0;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={c.cta}>
      <View style={[styles.shadowWrap, { shadowColor: shadow[c.glow].shadowColor }]}>
      <LinearGradient
        colors={c.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, c.image ? styles.cardWithPhoto : null]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {c.image ? (
          <>
            <Image source={c.image} style={styles.photo} contentFit="cover" />
            {/* The photo's top edge is a hard horizontal line, which puts the
                card back to reading as two stacked blocks. This short gradient
                sits *on* that edge and dissolves it into the green above. */}
            <LinearGradient
              colors={['rgba(23,66,20,1)', 'rgba(23,66,20,0)']}
              locations={[0, 1]}
              style={styles.seamFade}
              pointerEvents="none"
            />
            {/* Four stops, not three, and none of them reaching full opacity at
                the bottom: the copy needs contrast at the top, the faces need
                to be untouched in the middle, and the floor of the frame needs
                a slight darkening so the card reads as one object rather than a
                photo that stops. */}
            <LinearGradient
              colors={[
                'rgba(20,58,17,0.96)',
                'rgba(22,64,19,0.82)',
                'rgba(26,72,22,0.10)',
                'rgba(18,52,15,0.34)',
              ]}
              locations={[0, 0.22, 0.42, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          /* Two concentric rings off the top-right corner: depth without a
             texture, and a quiet echo of the rings the athlete closes below. */
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Orbits />
            <LinearGradient
              colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.sheen}
            />
          </View>
        )}
        <View style={styles.top}>
          <View style={[styles.eyebrowPill, c.image ? styles.eyebrowPillPhoto : null]}>
            <Text style={styles.eyebrow}>{c.eyebrow}</Text>
          </View>
          {/* The photograph already says it. A glyph on top of real people is
              the same message twice, and it crowds the corner they occupy. */}
          {c.image ? null : c.art ? (
            <Image source={c.art} style={styles.art} contentFit="contain" />
          ) : (
            <View style={styles.emojiBadge}>
              <Text style={styles.emoji}>{c.emoji}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.title, c.image ? styles.textOverPhoto : null]}>{c.title}</Text>
        {/* The supporting line would fall across the couple's faces. On a photo
            card the image does that work, so the copy stays title + CTA. */}
        {c.image ? null : <Text style={styles.body}>{c.body}</Text>}
        {showProgress && progress ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <ProgressFill fraction={Math.max(0.03, pct)} />
            </View>
            <Text style={styles.progressText}>
              {Math.min(progress.value, progress.target)} / {progress.target}
            </Text>
          </View>
        ) : null}
        <View style={[styles.ctaRow, c.image ? styles.ctaRowOverPhoto : null]}>
          <View style={styles.cta}>
            <Text style={[styles.ctaText, { color: c.colors[c.colors.length - 1] }]}>{c.cta}</Text>
            <View style={[styles.ctaArrowWrap, { backgroundColor: c.colors[1] }]}>
              <NudgeArrow />
            </View>
          </View>
        </View>
        {width > 0 ? <Sweep width={width} /> : null}
      </LinearGradient>
      </View>
    </PressableScale>
  );
}

/**
 * A band of light that crosses the card every few seconds — the polish of a
 * foil card, and the one thing on Home that says "this is the button".
 * Still under Reduce Motion.
 */
function Sweep({ width }: { width: number }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduced) return;
    x.value = withRepeat(
      withSequence(
        withDelay(2600, withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) })),
        withTiming(-1, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [x, reduced]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * (width * 0.9) }, { rotate: '18deg' }],
  }));
  if (reduced) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.sweep, { left: width / 2 - 60 }, style]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** The corner rings breathe, slowly and out of step with each other. */
function Orbits() {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, reduced]);
  const large = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 0.05 }] }));
  const small = useAnimatedStyle(() => ({ transform: [{ scale: 1.06 - t.value * 0.06 }] }));
  return (
    <>
      <Animated.View style={[styles.orbitLarge, large]} />
      <Animated.View style={[styles.orbitSmall, small]} />
    </>
  );
}

function ProgressFill({ fraction }: { fraction: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(350, withTiming(fraction, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [fraction, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <Animated.View style={[styles.progressFill, style]} />;
}

/** The CTA's arrow leans forward now and then — an invitation, not a flash. */
function NudgeArrow() {
  const reduced = useReducedMotion();
  const dx = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    dx.value = withRepeat(
      withSequence(
        withDelay(1800, withTiming(3, { duration: 180, easing: Easing.out(Easing.quad) })),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(3, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [dx, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  return <Animated.Text style={[styles.ctaArrow, style]}>→</Animated.Text>;
}

const styles = StyleSheet.create({
  /* A tinted, long shadow in the card's own hue — lift, not a neon halo. */
  shadowWrap: {
    borderRadius: radius['4xl'],
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  card: {
    borderRadius: radius['4xl'],
    padding: 22,
    minHeight: 210,
    justifyContent: 'space-between',
    /* The photo and orbits are absolutely positioned; without this they square
       off the rounded corners the rest of Home is built on. */
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  /* Editorial proportions for the photo variant: room for the couple to be
     people rather than a strip, with the copy in the top third where the scrim
     is strongest. */
  cardWithPhoto: { minHeight: 360, justifyContent: 'flex-start' },
  ctaRowOverPhoto: { marginTop: 14 },
  /* Starts below the copy rather than filling the card, so the couple's faces
     land in the clear zone of the scrim instead of under its darkest part. */
  photo: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '30%' },
  seamFade: { position: 'absolute', left: 0, right: 0, top: '26%', height: 72 },
  orbitLarge: {
    position: 'absolute',
    top: -110,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  orbitSmall: {
    position: 'absolute',
    top: -50,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
  sweep: { position: 'absolute', top: -80, bottom: -80, width: 120 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrowPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 2,
  },
  eyebrowPillPhoto: { backgroundColor: 'rgba(0,0,0,0.22)' },
  eyebrow: {
    ...font('bold', 10, { color: 'rgba(255,255,255,0.92)' }),
    letterSpacing: 1.6,
  },
  emojiBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  /* Sized to carry the card, not decorate it; negative margins let the 3:2
     illustration bleed into the padding so it sits flush to the corner. */
  art: { width: 150, height: 100, marginTop: -14, marginRight: -14 },
  title: {
    ...font('extrabold', 28, { color: palette.white }),
    marginTop: 14,
    lineHeight: 33,
    letterSpacing: -0.6,
  },
  body: {
    ...font('medium', 13.5, { color: 'rgba(255,255,255,0.78)' }),
    marginTop: 6,
    lineHeight: 19,
  },
  progressBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.white },
  progressText: {
    ...font('bold', 12, { color: 'rgba(255,255,255,0.9)' }),
    fontVariant: ['tabular-nums'],
  },
  ctaRow: { marginTop: 18 },
  /* On a flat gradient the copy is always on a known colour; over a photograph
     it is not. A tight shadow keeps the title crisp wherever the crop puts it. */
  textOverPhoto: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  /* One solid white control on every variant. Glass over a gradient read as
     decoration; opaque white with the card's deepest tone as text reads as the
     thing to press. */
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.white,
    paddingVertical: 8,
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ctaText: font('bold', 14.5),
  ctaArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: font('bold', 13, { color: palette.white }),
});
