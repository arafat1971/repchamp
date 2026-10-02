import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { Avatar } from '@/components/ui';
import { palette } from '@/theme/tokens';

/**
 * Two people joined by a line with a beating heart between them.
 *
 * The one visual for "connected" — the bond hero, and anywhere else two
 * athletes are shown as a pair. `lit` fills the link green (both trained
 * today); unlit it is a faint dashed rule, which reads as "waiting".
 */
export function LinkedAvatars({
  me,
  them,
  lit = true,
  size = 56,
}: {
  me: { initial: string; uri?: string | null; color: string };
  them: { initial: string; uri?: string | null; color: string };
  lit?: boolean;
  size?: number;
}) {
  const beat = useSharedValue(1);
  useEffect(() => {
    if (!lit) return;
    beat.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 420, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [lit, beat]);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  return (
    <View style={styles.row}>
      <View style={[styles.ring, { borderRadius: size }]}>
        <Avatar initial={me.initial} uri={me.uri} size={size} background={me.color} color={palette.white} />
      </View>
      <View style={styles.link}>
        <View style={[styles.line, lit ? styles.lineLit : styles.lineDim]} />
        <Animated.View style={[styles.heart, heartStyle, !lit && styles.heartDim]}>
          <Text style={styles.heartGlyph}>{lit ? '♥' : '·'}</Text>
        </Animated.View>
      </View>
      <View style={[styles.ring, { borderRadius: size }]}>
        <Avatar initial={them.initial} uri={them.uri} size={size} background={them.color} color={palette.white} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  link: { width: 52, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2 },
  lineLit: { backgroundColor: palette.green400 },
  lineDim: { backgroundColor: 'rgba(255,255,255,0.25)' },
  heart: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartDim: { backgroundColor: 'rgba(255,255,255,0.35)' },
  heartGlyph: { fontSize: 14, lineHeight: 17, color: palette.red500 },
});
