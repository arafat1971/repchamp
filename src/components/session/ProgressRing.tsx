import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * Circular progress ring used by calibration, the build-profile step and the
 * form-report score.
 *
 * Drives strokeDashoffset through requestAnimationFrame on standard Circle to avoid
 * the Reanimated Fabric JNI synchronouslyUpdateUIProps ANR loop on Android.
 */
export function ProgressRing({
  percent,
  size = 82,
  strokeWidth = 6,
  color = palette.green500,
  trackColor = 'rgba(255,255,255,0.2)',
  children,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const target = Math.max(0, Math.min(100, percent)) / 100;
  const [currentProgress, setCurrentProgress] = useState(target);
  const progressRef = useRef(currentProgress);
  progressRef.current = currentProgress;

  useEffect(() => {
    const startVal = progressRef.current;
    const endVal = target;
    const startTime = Date.now();
    const duration = 160;
    let animId: number;

    const frame = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progressRatio = Math.min(1, elapsed / duration);
      // easeOutQuad
      const eased = 1 - (1 - progressRatio) * (1 - progressRatio);
      const nextVal = startVal + (endVal - startVal) * eased;
      setCurrentProgress(nextVal);
      if (progressRatio < 1) {
        animId = requestAnimationFrame(frame);
      }
    };

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [target]);

  const dashoffset = circumference * (1 - currentProgress);

  return (
    <View style={{ width: size, height: size }}>
      {/* Rotated so 0% starts at 12 o'clock rather than 3 o'clock. */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>{children}</View>
      </View>
    </View>
  );
}

/** Percentage label for the middle of a calibration ring. */
export function RingPercent({ percent }: { percent: number }) {
  return (
    <Text style={font('extrabold', 20, { color: palette.white })}>
      {Math.round(percent)}
      <Text style={font('extrabold', 11, { color: palette.white })}>%</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
