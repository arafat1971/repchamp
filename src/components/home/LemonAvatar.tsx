import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { font } from '@/theme/typography';

/**
 * A headshot dressed as a lemon slice, to perch on the rim of a glass.
 *
 * Rind, pith and faint segment lines are drawn over and around the photo, so
 * it reads as a garnish first and a face second — playful, and it tells you
 * whose glass is whose without a label. With no photo, the slice shows the
 * initial on lemon flesh.
 */
export function LemonAvatar({
  uri,
  initial,
  size = 40,
}: {
  uri?: string | null;
  initial: string;
  size?: number;
}) {
  const r = size / 2;
  const photo = size - 10;
  const segments = 8;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Rind, then pith. */}
        <Circle cx={r} cy={r} r={r - 0.5} fill="#facc15" />
        <Circle cx={r} cy={r} r={r - 3} fill="#fef9c3" />
      </Svg>

      <View style={[styles.flesh, { width: photo, height: photo, borderRadius: photo / 2, top: 5, left: 5 }]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: photo, height: photo }} contentFit="cover" />
        ) : (
          <View style={[styles.initialBox, { width: photo, height: photo }]}>
            <Text style={font('extrabold', photo * 0.42, { color: '#a16207' })}>{initial}</Text>
          </View>
        )}
      </View>

      {/* Segment lines over the flesh — the detail that makes it a slice. */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: segments }, (_, i) => {
          const a = (i / segments) * 2 * Math.PI;
          const inner = photo * 0.12;
          const outer = photo / 2;
          return (
            <Line
              key={i}
              x1={r + inner * Math.cos(a)}
              y1={r + inner * Math.sin(a)}
              x2={r + outer * Math.cos(a)}
              y2={r + outer * Math.sin(a)}
              stroke="#fef08a"
              strokeOpacity={uri ? 0.28 : 0.6}
              strokeWidth={1.1}
            />
          );
        })}
        <Circle cx={r} cy={r} r={photo / 2} stroke="#fde047" strokeWidth={1.4} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  flesh: { position: 'absolute', overflow: 'hidden', backgroundColor: '#fde68a' },
  initialBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fde68a' },
});
