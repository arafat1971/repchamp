import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import type { CameraDevice, CameraOutput } from 'react-native-vision-camera';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { text } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * Frames per second requested from the camera.
 *
 * Higher is better for both the overlay's smoothness and rep-timing precision:
 * at 30fps a rep boundary can be up to 33ms off, at 50fps under 20ms.
 */
export const TARGET_FPS = 50;

/** Dark camera backdrop, tinted per exercise, matching the prototype's `.cam`. */
const BACKDROP: Record<string, readonly [string, string, string]> = {
  push: [palette.camGreenTop, palette.camGreenMid, palette.camGreenBottom],
  squat: [palette.camPurpleTop, palette.camPurpleMid, palette.camPurpleBottom],
  // Mobility drills borrow the tint of the movement they extend: shoulder rolls
  // ride on the push (green) family, the full-body stretch on the squat (purple).
  shoulder: [palette.camGreenTop, palette.camGreenMid, palette.camGreenBottom],
  stretch: [palette.camPurpleTop, palette.camPurpleMid, palette.camPurpleBottom],
};

/**
 * The sweeping scan line from the prototype. Purely decorative — it signals
 * "the camera is analysing" without implying a specific detection state.
 */
function ScanLine({ height }: { height: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -130 + progress.value * (height + 130) }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.scanWrap, style]}>
      <LinearGradient
        colors={['transparent', 'rgba(34,197,94,0.13)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Shared camera surface for every phase of a session.
 *
 * Renders the live preview when the camera is available and a tinted gradient
 * when it is not — so the flow still runs on a simulator or when permission is
 * pending, instead of showing a black rectangle.
 */
export function CameraStage({
  exercise,
  outputs,
  device,
  isActive,
  cameraReady,
  height,
  children,
}: {
  exercise: string;
  outputs: CameraOutput[];
  /** Resolved front camera, or undefined on hardware without one. */
  device: CameraDevice | undefined;
  isActive: boolean;
  cameraReady: boolean;
  height: number;
  children?: ReactNode;
}) {
  const colors = BACKDROP[exercise] ?? BACKDROP.push!;

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={colors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {cameraReady && device ? (
        <Camera
          isActive={isActive}
          device={device}
          outputs={outputs}
          // Ask for a high frame rate so the skeleton overlay tracks smoothly.
          // The camera falls back to its nearest supported rate if 50 is not
          // available on this device.
          constraints={[{ fps: TARGET_FPS }]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Inset vignette — the prototype's `box-shadow: inset 0 0 160px 50px`. */}
      <View pointerEvents="none" style={styles.vignette} />
      <ScanLine height={height} />

      {children}
    </View>
  );
}

/** Small status chip shown above the frame during calibration and duelling. */
export function StatusChip({
  label,
  accent,
  borderColor,
}: {
  label: string;
  accent: string;
  borderColor?: string;
}) {
  return (
    <View style={[styles.chip, { borderColor: borderColor ?? 'rgba(255,255,255,0.2)' }]}>
      <View style={[styles.chipDot, { backgroundColor: accent, shadowColor: accent }]} />
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  vignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    shadowColor: palette.black,
    shadowOpacity: 0.7,
    shadowRadius: 160,
    // iOS renders the inset glow via shadow; Android approximates with a border.
    borderWidth: 0,
  },
  scanWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 130,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(9,14,11,0.6)',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  chipLabel: {
    ...text.badge,
    fontSize: 12,
    letterSpacing: 0.72,
    color: palette.white,
  },
});
