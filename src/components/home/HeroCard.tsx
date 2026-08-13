import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import type { HomeFocus } from '@/domain/homeFocus';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/* Shot on the same green as `gradients.brandStrong`, so the photograph reads
   as part of the card rather than a rectangle pasted onto it. */
const COUPLE_HERO = require('../../../assets/couple-hero.png');

/** The rendered shape of a focus: what the card says and where it goes. */
interface HeroContent {
  emoji: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  colors: readonly [string, string];
  glow: keyof typeof shadow;
  /**
   * Optional photograph behind the copy. Only the couple states carry one —
   * the card has to stay legible, and an image behind every focus would turn
   * the one adaptive action on Home back into wallpaper.
   */
  image?: number;
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
      <LinearGradient
        colors={c.colors}
        style={[styles.card, c.image ? styles.cardWithPhoto : null, shadow[c.glow]]}
      >
        {c.image ? (
          <>
            <Image source={c.image} style={styles.photo} contentFit="cover" />
            {/* Top-down scrim, opaque where the copy sits and clearing before it
                reaches the faces — the photograph carries the bottom of the card
                at full strength instead of being half-veiled. */}
            <LinearGradient
              colors={['rgba(31,79,26,0.97)', 'rgba(31,79,26,0.72)', 'rgba(31,79,26,0)']}
              locations={[0, 0.18, 0.33]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : null}
        <View style={styles.top}>
          <Text style={styles.eyebrow}>{c.eyebrow}</Text>
          {/* The photograph already says it. A 40pt glyph on top of real people
              is the same message twice, and it crowds the corner they occupy. */}
          {c.image ? null : <Text style={styles.emoji}>{c.emoji}</Text>}
        </View>
        <Text style={styles.title}>{c.title}</Text>
        {/* The supporting line would fall across the couple's faces. On a photo
            card the image does that work, so the copy stays title + CTA. */}
        {c.image ? null : <Text style={styles.body}>{c.body}</Text>}
        <View style={styles.ctaRow}>
          <View style={styles.ctaGlass}>
            <Text style={styles.ctaText}>{c.cta}</Text>
            <View style={styles.ctaArrowWrap}>
              <Text style={styles.ctaArrow}>→</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['4xl'],
    padding: 20,
    minHeight: 200,
    justifyContent: 'space-between',
    /* The photo is absolutely positioned; without this it squares off the
       rounded corners the rest of Home is built on. */
    overflow: 'hidden',
  },
  /* Taller than the plain card: the photo owns the bottom band, and the CTA
     needs to clear the couple rather than sit across their shoulders.
     `flex-start` overrides the plain card's `space-between` — with the body
     line dropped, spreading the remaining copy would strand the CTA on the
     bottom edge, directly over the couple's hands. */
  cardWithPhoto: { minHeight: 300, justifyContent: 'flex-start' },
  /* The couple are centred in the source frame and fill it edge to edge, so the
     photo occupies the lower band of the card at full width rather than a right
     panel — that keeps both faces, both crowns and the skeletons uncut, and
     leaves the top of the card clear for the eyebrow and title. */
  photo: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: {
    ...font('bold', 10, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 2,
    marginTop: 4,
  },
  emoji: { fontSize: 40 },
  title: {
    ...font('bold', 26, { color: palette.white }),
    marginTop: 12,
    lineHeight: 30,
  },
  body: {
    ...font('regular', 13, { color: 'rgba(255,255,255,0.9)' }),
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
