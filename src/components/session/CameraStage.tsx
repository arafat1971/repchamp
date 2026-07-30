import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import type { CameraDevice, CameraOutput } from 'react-native-vision-camera';

import { text } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * Frames per second requested from the camera (analysis stream).
 *
 * This is intentionally below display refresh: the skeleton overlay interpolates
 * toward each inference result on every vsync so the UI still feels like a
 * stable 60 FPS even when the model runs at ~20–30 Hz.
 *
 * Android low/mid devices struggle at 50fps with TFLite + Skia on the same
 * pipeline (ANRs / thermal). Cap Android at 30; iOS keeps 50 where silicon allows.
 */
export const TARGET_FPS = Platform.OS === 'android' ? 30 : 50;

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
  height: _height,
  cameraRef,
  fps,
  children,
}: {
  exercise: string;
  outputs: CameraOutput[];
  /** Resolved camera device, or undefined on hardware without one. */
  device: CameraDevice | undefined;
  isActive: boolean;
  cameraReady: boolean;
  height: number;
  cameraRef?: React.RefObject<any>;
  /** Override TARGET_FPS (adaptive thermal throttle). */
  fps?: number;
  children?: ReactNode;
}) {
  const colors = BACKDROP[exercise] ?? BACKDROP.push!;
  const requestFps = fps ?? TARGET_FPS;

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
          ref={cameraRef}
          isActive={isActive}
          device={device}
          outputs={outputs}
          // Ask for requestFps; the camera falls back to its nearest supported rate.
          constraints={[{ fps: requestFps }]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Inset vignette — the prototype's `box-shadow: inset 0 0 160px 50px`. */}
      <View pointerEvents="none" style={styles.vignette} />

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
