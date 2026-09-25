import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SCREEN_GUTTER } from '@/theme/tokens';

/**
 * The canvas behind Home — a still wash under the masthead that follows the
 * time of day, and settles into the page colour.
 *
 * This used to carry five drifting green circles. They read as bubbles over
 * the cards rather than depth behind them, and motion that means nothing
 * cheapens the motion that does (rings closing, counts landing). The sky
 * changing with the hour is the one ambient cue worth having: the screen at
 * 7am and at 10pm should not feel like the same screen.
 *
 * Render it as the first child of the scroll content: it scrolls away with
 * the masthead. Pinned to the screen, it tinted whatever card scrolled under.
 */
export function HomeAmbient({ hour = new Date().getHours() }: { hour?: number }) {
  const sky = skyFor(hour);
  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient colors={sky.wash} locations={[0, 0.55, 1]} style={styles.wash} />
      <View style={[styles.glow, { backgroundColor: sky.glow }]} />
      <View style={[styles.glowSmall, { backgroundColor: sky.glowSoft }]} />
    </View>
  );
}

type Sky = {
  wash: readonly [string, string, string];
  glow: string;
  glowSoft: string;
  /** Text accent for the masthead eyebrow, so the date wears the sky's colour. */
  accent: string;
};

const FADE = 'rgba(246,247,245,0)';

/** Dawn gold, daytime green, sunset rose, night indigo. */
export function skyFor(hour: number): Sky {
  if (hour >= 5 && hour < 11) {
    return { wash: ['#FCE9CF', '#FBF2E4', FADE], glow: 'rgba(245,158,11,0.14)', glowSoft: 'rgba(251,191,36,0.10)', accent: '#B45309' };
  }
  if (hour >= 11 && hour < 17) {
    return { wash: ['#D9F0E1', '#EDF6F0', FADE], glow: 'rgba(34,197,94,0.10)', glowSoft: 'rgba(56,189,248,0.07)', accent: '#15803D' };
  }
  if (hour >= 17 && hour < 21) {
    return { wash: ['#F8DCD0', '#F3E6EE', FADE], glow: 'rgba(244,114,182,0.12)', glowSoft: 'rgba(249,115,22,0.10)', accent: '#BE185D' };
  }
  return { wash: ['#DCE2F6', '#EAEDF7', FADE], glow: 'rgba(99,102,241,0.12)', glowSoft: 'rgba(56,189,248,0.08)', accent: '#4338CA' };
}

const styles = StyleSheet.create({
  /* Reaches past the gutter and up under the status bar. */
  root: {
    position: 'absolute',
    top: -200,
    left: -SCREEN_GUTTER,
    right: -SCREEN_GUTTER,
    height: 720,
    overflow: 'hidden',
  },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 620 },
  glow: {
    position: 'absolute',
    top: 60,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
  },
  glowSmall: {
    position: 'absolute',
    top: 240,
    left: -90,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
});
