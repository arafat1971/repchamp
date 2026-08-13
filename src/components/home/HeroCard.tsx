import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

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
                photo that stops. The long 0.30→0.58 falloff is what removes the
                seam — a short one produces a visible band edge. */}
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
        ) : null}
        <View style={styles.top}>
          <Text style={[styles.eyebrow, c.image ? styles.textOverPhoto : null]}>{c.eyebrow}</Text>
          {/* The photograph already says it. A 40pt glyph on top of real people
              is the same message twice, and it crowds the corner they occupy. */}
          {c.image ? null : c.art ? (
            <Image source={c.art} style={styles.art} contentFit="contain" />
          ) : (
            <Text style={styles.emoji}>{c.emoji}</Text>
          )}
        </View>
        <Text style={[styles.title, c.image ? styles.textOverPhoto : null]}>{c.title}</Text>
        {/* The supporting line would fall across the couple's faces. On a photo
            card the image does that work, so the copy stays title + CTA. */}
        {c.image ? null : <Text style={styles.body}>{c.body}</Text>}
        <View style={[styles.ctaRow, c.image ? styles.ctaRowOverPhoto : null]}>
          <View style={[styles.ctaGlass, c.image ? styles.ctaSolid : null]}>
            <Text style={[styles.ctaText, c.image ? styles.ctaTextSolid : null]}>{c.cta}</Text>
            <View style={[styles.ctaArrowWrap, c.image ? styles.ctaArrowWrapSolid : null]}>
              <Text style={[styles.ctaArrow, c.image ? styles.ctaTextSolid : null]}>→</Text>
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
  /* Editorial proportions for the photo variant: a 4:5-ish frame gives the
     couple room to be people rather than a strip, and keeps the copy in the
     top third where the scrim is strongest. `flex-start` overrides the plain
     card's `space-between`, which would push the CTA onto the couple's hands. */
  cardWithPhoto: { minHeight: 360, justifyContent: 'flex-start' },
  /* The CTA sits directly under the title as one block. Verified on device:
     letting it drift down puts it across the crowns, which is where the eye
     goes first. */
  ctaRowOverPhoto: { marginTop: 14 },
  /* The couple are centred in the source frame and fill it edge to edge, so the
     photo occupies the lower band of the card at full width rather than a right
     panel — that keeps both faces, both crowns and the skeletons uncut, and
     leaves the top of the card clear for the eyebrow and title. */
  /* Fills the card rather than occupying a band. A band has a top edge, and
     that edge read as a seam between two stacked rectangles — the giveaway
     that this was a text block sitting on a photo rather than one image. The
     scrim below does all the shaping instead, so there is no hard boundary
     anywhere. Anchored bottom: the couple stand on the floor of the frame, and
     cropping from the top loses only empty backdrop. */
  /* Starts below the copy rather than filling the card. Full-bleed put the
     couple's heads directly under the darkest part of the scrim — faces halved,
     crowns lost, the whole thing reading as a torso shot. Beginning at 30%
     drops them into the clear zone. The seam that a band edge used to create is
     handled by the scrim's long falloff meeting the photo mid-fade, so there is
     still no visible join. */
  photo: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '30%' },
  /* Straddles the photo's top edge: opaque green where the photo begins,
     transparent below, so the join dissolves instead of drawing a line.
     Positioned to start slightly above 30% so it has green to blend into. */
  seamFade: { position: 'absolute', left: 0, right: 0, top: '26%', height: 72 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: {
    ...font('bold', 10, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 2,
    marginTop: 4,
  },
  emoji: { fontSize: 40 },
  /* Sized to carry the card, not decorate it. Verified on device: at 92pt the
     figure read as a sticker floating in the corner. The art is a 3:2
     illustration on a transparent ground, so it needs real width before it
     looks drawn rather than pasted. Negative margins let it bleed into the
     card's padding and sit flush to the corner, which is what stops it
     hovering. */
  art: { width: 150, height: 100, marginTop: -14, marginRight: -14 },
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
  /* On a flat gradient the copy is always on a known colour; over a photograph
     it is not. A tight shadow keeps the title crisp wherever the crop puts it,
     without the halo that a large soft one would give. */
  textOverPhoto: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  /* 0.22 white is glass over a solid gradient and mush over a photo. Opaque
     white with dark text reads as a real, pressable control at a glance —
     which is what the growth loop's one call to action should look like. */
  ctaSolid: {
    backgroundColor: palette.white,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  ctaTextSolid: { color: palette.green900 },
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
  /* The disc is near-white, which vanishes on the solid white button. Inverted
     to green so the arrow stays a distinct affordance rather than a smudge. */
  ctaArrowWrapSolid: { backgroundColor: palette.green100 },
});
