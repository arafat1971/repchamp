import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import { font } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';

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

/**
 * Rotating home hero — game events cycle every 8s so the top of the screen
 * always feels alive (Train Together, Daily, Friend Online, Tournament, XP).
 */
export function HeroCarousel({ slides }: { slides: readonly HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const safeSlides = slides.length > 0 ? slides : [];

  useEffect(() => {
    if (safeSlides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % safeSlides.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [safeSlides.length]);

  const slide = safeSlides[index] ?? safeSlides[0];
  if (!slide) return null;

  return (
    <View>
      <Animated.View key={slide.id} entering={FadeIn.duration(420)} exiting={FadeOut.duration(280)}>
        <PressableScale onPress={slide.onPress} accessibilityRole="button" accessibilityLabel={slide.cta}>
          <LinearGradient colors={slide.colors} style={[styles.card, shadow.brand]}>
            <View style={styles.top}>
              <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
              <Text style={styles.emoji}>{slide.emoji}</Text>
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
            <View style={styles.ctaRow}>
              <BlurView intensity={28} tint="light" style={styles.ctaGlass} experimentalBlurMethod="dimezisBlurView">
                <Text style={styles.ctaText}>{slide.cta}</Text>
                <View style={styles.ctaArrow}>
                  <Text style={font('bold', 12, { color: palette.green700 })}>→</Text>
                </View>
              </BlurView>
            </View>
          </LinearGradient>
        </PressableScale>
      </Animated.View>

      {safeSlides.length > 1 ? (
        <View style={styles.dots}>
          {safeSlides.map((s, i) => (
            <Dot key={s.id} active={i === index} />
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
  onDoubleXp: () => void;
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
      cta: input.paired ? 'Open couple mode' : 'Invite partner',
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
      title: 'New friend energy',
      body: `${input.onlineLabel} — challenge someone before they log off.`,
      cta: 'Find a rival',
      colors: ['#0369a1', '#0ea5e9'] as const,
      onPress: input.onFriends,
    },
    {
      id: 'tournament',
      emoji: '🏆',
      eyebrow: input.isWeekend ? 'WEEKEND EVENT' : 'ARENA',
      title: input.isWeekend ? 'Weekend Tournament' : 'Climb the Arena',
      body: input.isWeekend
        ? 'Bracket weekend is live. Win rounds, bank league XP.'
        : 'Duels feed your league climb all week long.',
      cta: 'Enter Arena',
      colors: ['#b45309', '#f59e0b'] as const,
      onPress: input.onTournament,
    },
    {
      id: 'double-xp',
      emoji: '⚡',
      eyebrow: 'LIMITED BOOST',
      title: 'Double XP Event',
      body: 'Finish a set before the window closes for 2× XP on practice.',
      cta: 'Start earning',
      colors: ['#be123c', '#fb7185'] as const,
      onPress: input.onDoubleXp,
    },
  ];
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['4xl'],
    padding: 22,
    minHeight: 200,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: {
    ...font('bold', 10, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 2,
    marginTop: 2,
  },
  emoji: { fontSize: 36 },
  title: {
    ...font('bold', 26, { color: palette.white }),
    marginTop: 14,
    lineHeight: 30,
  },
  body: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: 8,
    lineHeight: 19,
  },
  ctaRow: { marginTop: 18 },
  ctaGlass: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    shadowColor: '#16a34a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
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
    gap: 6,
    marginTop: 12,
  },
  dot: {
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.green500,
  },
});
