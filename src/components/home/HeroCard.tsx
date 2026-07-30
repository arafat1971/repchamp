import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import type { HomeFocus } from '@/domain/homeFocus';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/** The rendered shape of a focus: what the card says and where it goes. */
interface HeroContent {
  emoji: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  colors: readonly [string, string];
  glow: keyof typeof shadow;
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
        colors: gradients.brandStrong,
        glow: 'brand',
      };
    case 'streak-at-risk':
      return {
        emoji: '🔥',
        eyebrow: `${focus.streak} DAY STREAK`,
        title: `Don't break it with ${focus.partnerName}`,
        body: 'One of you still has to train today to keep the streak alive.',
        cta: 'Train now',
        colors: gradients.amber,
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
      };
    case 'daily-challenge': {
      const def = getExercise(focus.exercise);
      return {
        emoji: '🎯',
        eyebrow: 'TODAY’S CHALLENGE',
        title: `${focus.target} ${def.label}`,
        body: 'Clear it to keep your daily rhythm going.',
        cta: 'Take the challenge',
        colors: gradients.squat,
        glow: 'squat',
      };
    }
    case 'goal-met':
      return {
        emoji: '🏆',
        eyebrow: 'WEEKLY GOAL',
        title: `${focus.days} of ${focus.goal} days — done`,
        body: 'You hit your week. Bank a bonus set, or rest easy.',
        cta: 'Bonus set',
        colors: gradients.gold,
        glow: 'amber',
      };
    case 'recovery':
      return {
        emoji: '🧘',
        eyebrow: 'RECOVERY',
        title: 'Take it easy',
        body: 'You’ve done your bit today. A little mobility keeps you loose.',
        cta: 'Mobility',
        colors: gradients.info,
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
 */
export function HeroCard({ focus, onPress }: { focus: HomeFocus; onPress: () => void }) {
  const c = contentFor(focus);
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={c.cta}>
      <LinearGradient colors={c.colors} style={[styles.card, shadow[c.glow]]}>
        <View style={styles.top}>
          <Text style={styles.eyebrow}>{c.eyebrow}</Text>
          <Text style={styles.emoji}>{c.emoji}</Text>
        </View>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.body}>{c.body}</Text>
        <View style={styles.ctaRow}>
          <BlurView intensity={28} tint="light" style={styles.ctaGlass} experimentalBlurMethod="dimezisBlurView">
            <Text style={styles.ctaText}>{c.cta}</Text>
            <View style={styles.ctaArrowWrap}>
              <Text style={styles.ctaArrow}>→</Text>
            </View>
          </BlurView>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['4xl'], padding: 22, minHeight: 200, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: {
    ...font('bold', 10, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 2,
    marginTop: 2,
  },
  emoji: { fontSize: 40 },
  title: {
    ...font('bold', 26, { color: palette.white }),
    marginTop: 14,
    lineHeight: 30,
  },
  body: {
    ...font('regular', 13, { color: 'rgba(255,255,255,0.9)' }),
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
  ctaArrowWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: font('bold', 12, { color: palette.green700 }),
});
