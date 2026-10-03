import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const PAD = 4;

/**
 * The Train tab's switcher: one thumb slides under the active label. It turns a
 * long scroll of five sections into a short page the athlete steers, so the
 * tab opens on what they came to do instead of everything at once.
 */
export function TrainSegments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.id === value));

  /* Driven from the width + index each render so the thumb is right on first
     layout and after a rotation, not only after a tap. */
  x.value = withSpring(index * segment, { damping: 18, stiffness: 220, mass: 0.8 });
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={styles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {segment > 0 ? <Animated.View style={[styles.thumb, { width: segment }, thumb]} /> : null}
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(o.id);
            }}
          >
            <Text
              numberOfLines={1}
              style={font(active ? 'extrabold' : 'bold', 13, {
                color: active ? palette.white : palette.grey600,
              })}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PAD,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.07)',
    ...surfaceShadow,
  },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.pill,
    backgroundColor: palette.ink,
  },
  item: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
});
