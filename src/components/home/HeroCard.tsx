import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ArrowIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { WALL_COPY } from '@/domain/hardPaywall';
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
        eyebrow: 'Start here',
        title: 'Your first set',
        body: '60 seconds, no target — just find your rhythm.',
        cta: 'Start now',
        colors: gradients.heroEmerald,
        glow: 'brand',
        art: EXERCISE_ART.push,
      };
    case 'streak-at-risk':
      return {
        eyebrow: `${focus.streak}-day streak`,
        title: `Don't break it with ${focus.partnerName}`,
        body: 'One of you still has to train today to keep the streak alive.',
        cta: 'Train now',
        colors: gradients.heroAmber,
        glow: 'amber',
      };
    case 'partner-trained':
      return {
        eyebrow: 'Your turn',
        title: `${focus.partnerName} already trained`,
        body: `${focus.partnerName} showed up today. Don’t leave them hanging.`,
        colors: gradients.brandStrong,
        cta: 'Catch up',
        glow: 'brand',
        image: COUPLE_HERO,
      };
    case 'invite-partner':
      return {
        eyebrow: 'Couple mode',
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
        eyebrow: 'Today’s challenge',
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
        eyebrow: 'Weekly goal',
        title: `${focus.days} of ${focus.goal} days — done`,
        body: 'You hit your week. Bank a bonus set, or rest easy.',
        cta: 'Bonus set',
        colors: gradients.heroAmber,
        glow: 'amber',
      };
    case 'recovery':
      return {
        eyebrow: 'Recovery',
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
  bonus,
  locked = false,
}: {
  focus: HomeFocus;
  onPress: () => void;
  progress?: { value: number; target: number };
  /** A time-boxed reason to go now ("+5 XP before 6 PM"), shown as a tag. */
  bonus?: string | null;
  /** Free reps are spent: the card says so and its tap opens the paywall. */
  locked?: boolean;
}) {
  const base = contentFor(focus);
  const c = locked ? { ...base, body: WALL_COPY.heroBody, cta: 'See Pro' } : base;
  const showProgress = !c.image && focus.kind === 'daily-challenge' && !!progress;
  const pct = showProgress && progress ? Math.min(1, progress.value / Math.max(1, progress.target)) : 0;
  if (!c.image) {
    return (
      <LightHero
        c={c}
        onPress={onPress}
        urgent={focus.kind === 'streak-at-risk'}
        bonus={bonus && !locked ? bonus : null}
        progress={showProgress ? progress : undefined}
        pct={pct}
      />
    );
  }
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={c.cta}>
      <View style={styles.shadowWrap}>
      <LinearGradient
        /* Flat: one deep colour, not a wash. The photo cards keep their ramp,
           which blends the photograph into the card. */
        colors={c.image ? c.colors : [c.colors[1], c.colors[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, c.image ? styles.cardWithPhoto : null]}
      >
        {c.image ? (
          <>
            <Image source={c.image} style={styles.photo} contentFit="cover" />
            {/* Compact card: the couple sits in the right of the frame and the copy
                in the left, so nothing is drawn across their faces. This fade
                carries the card's green across from the left and clears by
                the middle, which also hides the photo's hard left edge. */}
            <LinearGradient
              colors={['rgba(20,58,17,1)', 'rgba(20,58,17,1)', 'rgba(22,64,19,0.45)', 'rgba(22,64,19,0)']}
              locations={[0, 0.47, 0.6, 0.76]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        ) : null}
        <View style={styles.top}>
          <Text style={[styles.eyebrow, c.image ? styles.textOverPhoto : null]}>{c.eyebrow}</Text>
          {/* Drawn art only. The emoji that used to fill this corner on the
              other states repeated the title in a font the OS picks. */}
          {c.image || !c.art ? null : (
            <>
              {/* The figure is drawn dark, on a dark card: a pale disc behind
                  it is what lets it be seen at all. */}
              <View style={styles.artGlow} pointerEvents="none" />
              <Image source={c.art} style={styles.art} contentFit="contain" />
            </>
          )}
        </View>
        <Text style={[styles.title, c.image ? styles.titleOverPhoto : null, c.image ? styles.textOverPhoto : null]}>{c.title}</Text>
        {/* The supporting line would fall across the couple's faces. On a photo
            card the image does that work, so the copy stays title + CTA. */}
        {/* A bonus with a deadline beats a general line about rhythm, so it
            takes the body's place when there is one. */}
        {c.image ? null : bonus && !locked ? (
          <View style={styles.bonus}>
            <Text style={styles.bonusText} numberOfLines={1}>
              {bonus}
            </Text>
          </View>
        ) : (
          <Text style={styles.body} numberOfLines={2}>
            {c.body}
          </Text>
        )}
        {/* The button and the progress share one row: what to do, and how far
            along it you already are. */}
        <View style={[styles.ctaRow, c.image ? styles.ctaRowOverPhoto : null]}>
          <View style={styles.cta}>
            <Text style={[styles.ctaText, { color: c.colors[c.colors.length - 1] }]}>{c.cta}</Text>
            <View style={[styles.ctaArrowWrap, { backgroundColor: c.colors[1] }]}>
              <ArrowIcon size={14} color={palette.white} strokeWidth={2.4} />
            </View>
          </View>
          {showProgress && progress ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <ProgressFill fraction={Math.max(0.03, pct)} />
              </View>
              <Text style={styles.progressText}>
                {Math.min(progress.value, progress.target)}/{progress.target}
              </Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>
      </View>
    </PressableScale>
  );
}



/**
 * The hero on a light surface — every focus except the photo ones.
 *
 * Home is white cards on a pale canvas with one green accent. The hero used to
 * be the exception: a dark slab whose colour changed with the focus (emerald,
 * violet, amber, indigo), with a pale disc behind the drawn figure because the
 * figure is drawn dark. On white the figure needs no disc, the green CTA is
 * the one filled button on screen, and amber is kept for the one state that
 * is a warning — a shared streak about to break.
 */
function LightHero({
  c,
  onPress,
  urgent,
  bonus,
  progress,
  pct,
}: {
  c: HeroContent;
  onPress: () => void;
  urgent: boolean;
  bonus: string | null;
  progress?: { value: number; target: number };
  pct: number;
}) {
  const accent = urgent ? palette.amber800 : palette.green700;
  const fill = urgent ? palette.amber600 : palette.green600;
  const wash = urgent ? (['#FFF4E0', '#FFFFFF'] as const) : (['#E3F7EA', '#FFFFFF'] as const);
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${c.title}. ${c.cta}`}>
      <View style={light.shadowWrap}>
        <LinearGradient colors={wash} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={light.card}>
          {c.art ? <Image source={c.art} style={light.art} contentFit="contain" /> : null}
          <View style={light.eyebrowRow}>
            <View style={[light.eyebrowDot, { backgroundColor: fill }]} />
            <Text style={[light.eyebrow, { color: accent }]}>{c.eyebrow}</Text>
          </View>
          <Text style={[light.title, c.art ? light.titleBesideArt : null]}>{c.title}</Text>
          {bonus ? (
            <View style={[light.bonus, { backgroundColor: urgent ? palette.amber50 : palette.green50 }]}>
              <Text style={[light.bonusText, { color: accent }]} numberOfLines={1}>
                {bonus}
              </Text>
            </View>
          ) : (
            <Text style={[light.body, c.art ? light.titleBesideArt : null]} numberOfLines={2}>
              {c.body}
            </Text>
          )}
          <View style={light.ctaRow}>
            <View style={[light.cta, { backgroundColor: fill }]}>
              <Text style={light.ctaText}>{c.cta}</Text>
              <ArrowIcon size={14} color={palette.white} strokeWidth={2.6} />
            </View>
            {progress ? (
              <View style={light.progressBlock}>
                <View style={light.progressTrack}>
                  <ProgressFill fraction={Math.max(0.03, pct)} color={fill} />
                </View>
                <Text style={light.progressText}>
                  {Math.min(progress.value, progress.target)}/{progress.target}
                </Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>
      </View>
    </PressableScale>
  );
}

function ProgressFill({ fraction, color }: { fraction: number; color?: string }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(350, withTiming(fraction, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [fraction, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <Animated.View style={[styles.progressFill, color ? { backgroundColor: color } : null, style]} />;
}


const styles = StyleSheet.create({
  /* A plain shadow. A coloured one reads as a glow, which reads as generated. */
  shadowWrap: {
    borderRadius: radius['6xl'],
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  card: {
    borderRadius: radius['6xl'],
    padding: 18,
    justifyContent: 'space-between',
    /* The photo is absolutely positioned; without this they square
       off the rounded corners the rest of Home is built on. */
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  /* Editorial proportions for the photo variant: room for the couple to be
     people rather than a strip, with the copy in the top third where the scrim
     is strongest. */
  cardWithPhoto: { minHeight: 180, justifyContent: 'flex-start' },
  ctaRowOverPhoto: { marginTop: 12 },
  /* Starts below the copy rather than filling the card, so the couple's faces
     land in the clear zone of the scrim instead of under its darkest part. */
  photo: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '62%' },
  titleOverPhoto: { maxWidth: '50%' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: {
    ...font('semibold', 12, { color: 'rgba(255,255,255,0.72)' }),
    letterSpacing: 0.2,
    marginTop: 2,
  },
  /* Sized to carry the card, not decorate it; negative margins let the 3:2
     illustration bleed into the padding so it sits flush to the corner. */
  artGlow: {
    position: 'absolute',
    top: -34,
    right: -34,
    width: 172,
    height: 132,
    borderRadius: 66,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  art: { position: 'absolute', top: -8, right: -10, width: 120, height: 80 },
  title: {
    ...font('extrabold', 24, { color: palette.white }),
    marginTop: 20,
    lineHeight: 28,
    letterSpacing: -0.6,
  },
  body: {
    ...font('medium', 12.5, { color: 'rgba(255,255,255,0.78)' }),
    marginTop: 4,
    lineHeight: 17,
  },
  bonus: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(253,224,71,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.35)',
  },
  bonusText: font('bold', 11.5, { color: '#FDE68A' }),
  progressBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
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
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ctaText: font('bold', 14),
  ctaArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: font('bold', 13, { color: palette.white }),
});

const light = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius['6xl'],
    shadowColor: '#0F1F17',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  card: {
    borderRadius: radius['6xl'],
    borderCurve: 'continuous',
    padding: 20,
    minHeight: 172,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
  },
  /* Drawn figure, large and flush to the top-right: on white it reads at full
     strength with nothing behind it. */
  art: { position: 'absolute', top: 18, right: 4, width: 150, height: 100 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { ...font('bold', 12.5), letterSpacing: 0.2 },
  title: {
    ...font('extrabold', 28, { color: palette.ink }),
    marginTop: 14,
    lineHeight: 32,
    letterSpacing: -0.8,
  },
  /* Copy stops short of the figure so the two never overlap. */
  titleBesideArt: { maxWidth: '62%' },
  body: { ...font('medium', 13.5, { color: palette.grey700 }), marginTop: 6, lineHeight: 19 },
  bonus: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  bonusText: font('bold', 12),
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  ctaText: font('extrabold', 15, { color: palette.white }),
  progressBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(15,31,23,0.08)',
    overflow: 'hidden',
  },
  progressText: {
    ...font('bold', 12.5, { color: palette.ink }),
    fontVariant: ['tabular-nums'],
  },
});
