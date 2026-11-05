import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { palette } from '@/theme/tokens';

/**
 * A closing ring, in the Activity-ring idiom.
 *
 * Drives strokeDashoffset through requestAnimationFrame on standard Circle to avoid
 * the Reanimated Fabric JNI synchronouslyUpdateUIProps ANR loop on Android.
 */
export function ProgressRing({
  percent,
  size = 84,
  thickness = 9,
  from,
  to,
  track = palette.border,
  children,
  /** Animate on mount. Off for a ring that appears mid-scroll. */
  animate = true,
}: {
  percent: number;
  size?: number;
  thickness?: number;
  from: string;
  to: string;
  track?: string;
  children?: React.ReactNode;
  animate?: boolean;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = Math.max(0, Math.min(100, percent));

  const [currentVal, setCurrentVal] = useState(animate ? 0 : target);
  const currentValRef = useRef(currentVal);
  currentValRef.current = currentVal;

  useEffect(() => {
    const startVal = currentValRef.current;
    const endVal = target;
    const startTime = Date.now();
    const duration = animate ? 900 : 0;

    if (duration === 0) {
      setCurrentVal(endVal);
      return;
    }

    let animId: number;
    const frame = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progressRatio = Math.min(1, elapsed / duration);
      // easeOutCubic
      const t = 1 - progressRatio;
      const eased = 1 - t * t * t;
      const nextVal = startVal + (endVal - startVal) * eased;
      setCurrentVal(nextVal);
      if (progressRatio < 1) {
        animId = requestAnimationFrame(frame);
      }
    };

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [target, animate]);

  const dashoffset = circumference - (circumference * currentVal) / 100;

  /* Unique per instance: two rings on one screen sharing a gradient id would
     both take whichever definition mounted last. */
  const gradientId = `ring-${from.replace('#', '')}-${to.replace('#', '')}-${size}`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={thickness}
          fill="none"
        />

        {/* Rotated so the ring starts at twelve o'clock, not three. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          /* A zero-length dash with a round cap still paints a dot. */
          opacity={target > 0 ? 1 : 0}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
