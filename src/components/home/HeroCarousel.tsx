import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import { font } from '@/theme/typography';
import { palette, radius, shadow, SCREEN_GUTTER } from '@/theme/tokens';

export type HeroSlide = {
  id: string;
  emoji: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  colors: readonly [string, string];
  onPress: () => void;
  /**
   * Photo behind the card, instead of a flat gradient.
   *
   * The gradient still renders underneath as a scrim, so the copy keeps its
   * contrast while the image loads and wherever the artwork is pale. Slides
   * without one are unchanged.
   */
  image?: number;
  /** Two-word footnote row under the CTA, e.g. "⚡ Live reps". */
  chips?: readonly string[];
  /**
   * Second line of the title, drawn in brand green under the white first line.
   *
   * Splitting it rather than colouring a substring keeps the two lines
   * independently wrappable — "Train" and "Together" are one phrase to a
   * reader but two very different lengths once translated.
   */
  titleAccent?: string;
};

/* The couple photo with the pose skeleton drawn over it — the one image that
   shows what the app does *and* who it is for, which is why the lead card
   gets it and the others stay on flat gradients. Shared with onboarding. */
const COUPLE_HERO = require('../../../assets/couple-hero.png');

const INTERVAL_MS = 8000;
/** Autoplay stays off this long after a swipe, so it never fights the athlete. */
const RESUME_AFTER_TOUCH_MS = 10000;
// Gutter comes from tokens so the page width always matches what `Screen` pads
// by; a local copy would silently mis-snap if either side changed.

/**
 * Rotating home hero.
 *
 * This used to cross-fade on a timer with no gesture at all: the dots were
 * decoration, and the card could not be swiped even though it looked like a
 * carousel. It is now a real paged ScrollView — drag it, and it snaps.
 *
 * Autoplay is kept, because the top of the screen should still feel alive for
 * someone who never touches it, but it always loses to the athlete: any touch
 * cancels the pending advance, and it stays off for `RESUME_AFTER_TOUCH_MS`
 * after the last interaction rather than yanking the card away mid-read.
 */
export function HeroCarousel({ slides }: { slides: readonly HeroSlide[] }) {
  const { width: screenW } = useWindowDimensions();
  const pageW = Math.max(1, screenW - SCREEN_GUTTER * 2);

  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  /** Epoch ms of the last touch; autoplay resumes only after the quiet window. */
  const lastTouchRef = useRef(0);
  /** True between touch-down and the scroll settling, so the sync effect defers. */
  const draggingRef = useRef(false);
  const safeSlides = slides.length > 0 ? slides : [];
  const count = safeSlides.length;

  // Clamp rather than reset in an effect: the slide set changes when a duel
  // arrives or the couple pairs, and writing state from an effect to correct
  // an out-of-range index costs an extra render and fights React's own rules.
  const safeIndex = index < count ? index : 0;

  /*
   * Autoplay advances from the clamped index.
   *
   * The updater reads current state, so it stays correct without a ref — and
   * clamping inside it matters: the slide set shrinks when a duel resolves, and
   * advancing from a now-out-of-range index would put the dots and the card on
   * different slides. The scroll is issued after, not from inside the updater,
   * which React only promises to run as a pure computation.
   */
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      if (Date.now() - lastTouchRef.current < RESUME_AFTER_TOUCH_MS) return;
      setIndex((i) => {
        const from = i < count ? i : 0;
        return (from + 1) % count;
      });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [count]);

  /*
   * Follow the index with the scroll position.
   *
   * Skipped while the athlete is touching the card. The index also changes when
   * *they* swipe (onMomentumScrollEnd reports where it landed), and re-issuing
   * a scrollTo for a position the card already reached would fight a gesture
   * still in flight — the card is where they put it, so leave it there.
   */
  useEffect(() => {
    if (draggingRef.current) return;
    scrollRef.current?.scrollTo({ x: safeIndex * pageW, animated: true });
  }, [safeIndex, pageW]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      draggingRef.current = false;
      const next = Math.round(e.nativeEvent.contentOffset.x / pageW);
      setIndex(Math.max(0, Math.min(count - 1, next)));
    },
    [count, pageW],
  );

  const markTouched = useCallback(() => {
    lastTouchRef.current = Date.now();
    draggingRef.current = true;
  }, []);

  if (count === 0) return null;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        // Android hands a nested scroll to the parent unless the child opts in,
        // so without this the vertical Screen ScrollView swallowed every
        // horizontal drag and the card never paged. directionalLockEnabled
        // keeps a slightly-diagonal swipe on one axis instead of scrolling both.
        nestedScrollEnabled
        directionalLockEnabled
        // Deliberately NOT `pagingEnabled`: that snaps to multiples of the
        // viewport, and a page here is narrower than the screen (the card is
        // inset by the gutter). The two disagree by the gutter on every page,
        // so a slide drifts 40dp further off by page 2 and 120dp by page 4.
        // snapToInterval pages on the real slide width instead.
        snapToInterval={pageW}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={markTouched}
        onTouchStart={markTouched}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
      >
        {safeSlides.map((slide) => (
          <View key={slide.id} style={{ width: pageW }}>
            <PressableScale
              onPress={slide.onPress}
              accessibilityRole="button"
              accessibilityLabel={slide.cta}
            >
              <LinearGradient colors={slide.colors} style={[styles.card, shadow.brand]}>
                {slide.image ? (
                  <>
                    {/* Anchored right so the couple sits beside the copy rather
                        than behind it — the left half stays a readable panel. */}
                    <Image
                      source={slide.image}
                      style={styles.photo}
                      contentFit="cover"
                      // Centre, not right: anchoring right cropped the man out
                      // of a card whose whole point is that there are two
                      // people in it.
                      contentPosition="center"
                      transition={220}
                      accessible={false}
                    />
                    {/* Scrim over the photo's left side. Without it the white
                        title sits on whatever the artwork happens to be, and
                        this one is bright green where the text begins. */}
                    <LinearGradient
                      colors={['rgba(4,28,16,0.88)', 'rgba(4,28,16,0.45)', 'rgba(4,28,16,0)']}
                      // Dark enough at the left edge to hold white text, then
                      // off quickly. An earlier pass ran 0.96 across the left
                      // half and, on screen, crushed the photo to near-black —
                      // the man all but disappeared and the bright green
                      // backdrop the artwork is built around went muddy.
                      locations={[0, 0.5, 0.85]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                  </>
                ) : null}

                {/* A photo card carries its own subject, so the eyebrow and
                    emoji are the parts that start to look like chrome — the
                    title is doing that work already. */}
                {slide.image ? null : (
                  <View style={styles.top}>
                    <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
                    <Text style={styles.emoji}>{slide.emoji}</Text>
                  </View>
                )}
                <Text style={[styles.title, slide.image ? styles.titleOnPhoto : null]}>
                  {slide.title}
                </Text>
                {slide.titleAccent ? (
                  <Text style={[styles.title, styles.titleOnPhoto, styles.titleAccent]}>
                    {slide.titleAccent}
                  </Text>
                ) : null}
                <Text style={styles.body}>{slide.body}</Text>
                <View style={styles.ctaRow}>
                  <View style={styles.ctaGlass}>
                    <Text style={styles.ctaText}>{slide.cta}</Text>
                    <View style={styles.ctaArrow}>
                      <Text style={font('bold', 12, { color: palette.green700 })}>→</Text>
                    </View>
                  </View>
                </View>
                {slide.chips?.length ? (
                  <View style={styles.chipRow}>
                    {slide.chips.map((chip) => (
                      <Text key={chip} style={styles.chip} numberOfLines={1}>
                        {chip}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </LinearGradient>
            </PressableScale>
          </View>
        ))}
      </ScrollView>

      {count > 1 ? (
        <View style={styles.dots}>
          {safeSlides.map((s, i) => (
            <Dot key={s.id} active={i === safeIndex} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 18 : 7);
  const opacity = useSharedValue(active ? 1 : 0.35);

  useEffect(() => {
    width.value = withTiming(active ? 18 : 7, { duration: 220 });
    opacity.value = withTiming(active ? 1 : 0.35, { duration: 220 });
  }, [active, opacity, width]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

/** Build the default game-event slide list for Home. */
export function buildHomeHeroSlides(input: {
  paired: boolean;
  partnerName: string | null;
  dailyDone: boolean;
  dailyTarget: number;
  onlineLabel: string;
  isWeekend: boolean;
  onTrainTogether: () => void;
  onDaily: () => void;
  onFriends: () => void;
  onTournament: () => void;
  onQuickMatch: () => void;
}): HeroSlide[] {
  return [
    {
      id: 'together',
      emoji: '🤝',
      eyebrow: 'COUPLE MODE',
      // Split across two lines so "Together" can carry the brand green, which
      // is what makes the word the card is about the thing the eye lands on.
      title: input.paired ? 'Train with' : 'Train',
      titleAccent: input.paired ? (input.partnerName ?? 'your partner') : 'Together',
      body: input.paired
        ? 'One shared streak. Live reps side by side.'
        : 'One shared streak.\nEvery single day.',
      cta: input.paired ? 'Train together' : 'Start Together',
      colors: ['#0b3d22', '#166534'] as const,
      image: COUPLE_HERO,
      // Only for the unpaired card: these are the pitch for pairing, and a
      // paired athlete has already bought it.
      chips: input.paired ? undefined : (['⚡ Live reps', '🎁 Free week for two'] as const),
      onPress: input.onTrainTogether,
    },
    {
      id: 'daily',
      emoji: '🎯',
      eyebrow: 'DAILY CHALLENGE',
      title: input.dailyDone ? 'Daily cleared' : `${input.dailyTarget} Push-Ups`,
      body: input.dailyDone
        ? 'Come back tomorrow for another shot at +300 XP.'
        : 'Clear it before midnight for a 300 XP boost.',
      cta: input.dailyDone ? 'View challenge' : 'Take the challenge',
      colors: ['#7c3aed', '#a855f7'] as const,
      onPress: input.onDaily,
    },
    {
      id: 'friend',
      emoji: '👋',
      eyebrow: 'SOCIAL',
      title: 'Rivals are warming up',
      body: `${input.onlineLabel} — challenge someone before they log off.`,
      cta: 'Find a rival',
      colors: ['#0369a1', '#0ea5e9'] as const,
      onPress: input.onFriends,
    },
    {
      id: 'tournament',
      emoji: '🏆',
      eyebrow: input.isWeekend ? 'WEEKEND ARENA' : 'ARENA',
      title: input.isWeekend ? 'Weekend duels' : 'Climb the Arena',
      body: input.isWeekend
        ? 'Bracket tournaments are coming soon — warm up with live duels now.'
        : 'Duels feed your league climb all week long.',
      cta: 'Enter Arena',
      colors: ['#b45309', '#f59e0b'] as const,
      onPress: input.onTournament,
    },
    {
      id: 'quick-match',
      emoji: '⚡',
      eyebrow: 'INSTANT DUEL',
      title: 'Quick Match',
      body: 'Jump into a timed set — real athletes when available, AI when not.',
      cta: 'Find a match',
      colors: ['#be123c', '#fb7185'] as const,
      onPress: input.onQuickMatch,
    },
  ];
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['4xl'],
    padding: 20,
    minHeight: 200,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  /* Fills the card behind the copy. The card clips it via `overflow: hidden`,
     so it takes the same rounded corners without repeating the radius here. */
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  /* Footnotes under the CTA — "⚡ Live reps". Wraps rather than truncating the
     row, because a longer translation should drop to a second line instead of
     silently losing a benefit. */
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  chip: font('bold', 12, { color: 'rgba(255,255,255,0.92)' }),
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: {
    ...font('bold', 10, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 2,
    marginTop: 4,
  },
  emoji: { fontSize: 36 },
  title: {
    ...font('bold', 26, { color: palette.white }),
    marginTop: 12,
    lineHeight: 30,
  },
  /* Larger and tighter on a photo card. There is no eyebrow above it to share
     the space with, and the headline is what has to hold against a busy
     image — at 26pt it read as a caption on top of a picture. */
  titleOnPhoto: {
    ...font('extrabold', 34, { color: palette.white }),
    marginTop: 0,
    lineHeight: 38,
  },
  titleAccent: { color: palette.green400 },
  body: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: 8,
    lineHeight: 19,
  },
  ctaRow: { marginTop: 16 },
  ctaGlass: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#16a34a',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaText: font('bold', 14, { color: palette.white }),
  ctaArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
  },
  dot: {
    height: 7,
    borderRadius: radius.xs,
    backgroundColor: palette.green500,
  },
});
