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
};

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
  const safeSlides = slides.length > 0 ? slides : [];
  const count = safeSlides.length;

  // Clamp rather than reset in an effect: the slide set changes when a duel
  // arrives or the couple pairs, and writing state from an effect to correct
  // an out-of-range index costs an extra render and fights React's own rules.
  const safeIndex = index < count ? index : 0;

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      if (Date.now() - lastTouchRef.current < RESUME_AFTER_TOUCH_MS) return;
      setIndex((i) => {
        const next = (i + 1) % count;
        scrollRef.current?.scrollTo({ x: next * pageW, animated: true });
        return next;
      });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [count, pageW]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / pageW);
      setIndex(Math.max(0, Math.min(count - 1, next)));
    },
    [count, pageW],
  );

  const markTouched = useCallback(() => {
    lastTouchRef.current = Date.now();
  }, []);

  if (count === 0) return null;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        // The card is inset from the screen edge, so a page is narrower than the
        // window. snapToInterval pages on that width instead of the viewport,
        // which is what keeps a slide centred rather than drifting per page.
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
                <View style={styles.top}>
                  <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
                  <Text style={styles.emoji}>{slide.emoji}</Text>
                </View>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.body}>{slide.body}</Text>
                <View style={styles.ctaRow}>
                  <View style={styles.ctaGlass}>
                    <Text style={styles.ctaText}>{slide.cta}</Text>
                    <View style={styles.ctaArrow}>
                      <Text style={font('bold', 12, { color: palette.green700 })}>→</Text>
                    </View>
                  </View>
                </View>
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
      title: input.paired
        ? `Train with ${input.partnerName ?? 'your partner'}`
        : 'Train Together',
      body: input.paired
        ? 'One shared streak. Live reps side by side.'
        : 'A shared streak that only survives if you both show up.',
      cta: input.paired ? 'Train together' : 'Invite partner',
      colors: ['#166534', '#22c55e'] as const,
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
