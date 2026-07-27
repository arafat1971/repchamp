import { BlurMask, Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { KEYPOINT_INDEX, SKELETON_BONES } from '@/vision/keypoints';

/** Flat pose buffer shared with the frame processor: `[x, y, score] * 17`. */
export const POSE_BUFFER_LENGTH = 17 * 3;

/** Joints below this confidence are not drawn, rather than drawn wrong. */
const DRAW_THRESHOLD = 0.3;

export interface PoseFrameSize {
  width: number;
  height: number;
}

export interface PoseOverlayProps {
  /** Keypoints in full-frame normalised coordinates. */
  pose: SharedValue<number[]>;
  /** Size of the source frame, needed to undo the preview's cover-scaling. */
  frame: SharedValue<PoseFrameSize>;
  /** Accent colour — green for push-ups, purple for squats. */
  color: string;
  visible: SharedValue<boolean>;
}

/**
 * Live glowing skeleton drawn over the camera preview.
 *
 * Runs entirely on the UI thread: the frame processor writes keypoints into a
 * shared value and Skia reads them in derived values, so nothing crosses to
 * React and no component re-renders. That is what lets the overlay track at the
 * camera's full frame rate — driving it from `useState` would cap it at whatever
 * the JS thread manages while also running inference.
 *
 * The glow is three passes of the same geometry: a wide, heavily blurred halo,
 * a mid blurred pass for density, then a crisp core.
 */
export function PoseOverlay({ pose, frame, color, visible }: PoseOverlayProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();

  // Bone indices resolved once — the topology never changes.
  const bones = useMemo(
    () => SKELETON_BONES.map(([from, to]) => [KEYPOINT_INDEX[from], KEYPOINT_INDEX[to]] as const),
    [],
  );

  /**
   * Display-rate interpolation of the keypoints.
   *
   * Inference lands roughly every 40ms, but the screen refreshes every 8-16ms.
   * Drawing raw inference output makes the skeleton visibly step between poses.
   * This eases the drawn position toward the newest pose on every display frame,
   * so the limbs glide continuously no matter how often the model reports.
   *
   * Runs in a frame callback on the UI thread, so it costs nothing on the JS
   * thread that is already busy with the rep counter.
   */
  const smoothed = useSharedValue<number[]>([]);

  useFrameCallback(() => {
    'worklet';
    const target = pose.value;
    if (target.length === 0) return;

    const current = smoothed.value;
    // First pose, or a topology change — snap rather than glide in from nowhere.
    if (current.length !== target.length) {
      smoothed.value = target;
      return;
    }

    // 0.35 tracks quickly enough to feel responsive while removing the step.
    const alpha = 0.35;
    const next = new Array<number>(target.length);
    for (let i = 0; i < target.length; i += 3) {
      const cx = current[i] as number;
      const cy = current[i + 1] as number;
      next[i] = cx + ((target[i] as number) - cx) * alpha;
      next[i + 1] = cy + ((target[i + 1] as number) - cy) * alpha;
      // Confidence is a gate, not a position — smoothing it would make joints
      // fade in and out instead of appearing crisply.
      next[i + 2] = target[i + 2] as number;
    }
    smoothed.value = next;
  }, true);

  const skeleton = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const p = smoothed.value;
    const f = frame.value;
    if (p.length < POSE_BUFFER_LENGTH || f.width === 0 || f.height === 0) return path;

    /**
     * The preview fills the screen with `cover`, so the frame is scaled up until
     * it covers both axes and the overflow is cropped evenly. Mapping normalised
     * coordinates straight onto screen size would stretch the skeleton to the
     * screen's aspect ratio and slide it away from the body.
     */
    const scale = Math.max(screenW / f.width, screenH / f.height);
    const drawnW = f.width * scale;
    const drawnH = f.height * scale;
    const offsetX = (screenW - drawnW) / 2;
    const offsetY = (screenH - drawnH) / 2;

    for (const [a, b] of bones) {
      const as = p[a * 3 + 2] as number;
      const bs = p[b * 3 + 2] as number;
      // Skip a bone if either end is uncertain — a line to a hallucinated joint
      // reads as broken tracking, which is worse than an absent limb.
      if (as < DRAW_THRESHOLD || bs < DRAW_THRESHOLD) continue;

      path.moveTo(
        offsetX + (p[a * 3] as number) * drawnW,
        offsetY + (p[a * 3 + 1] as number) * drawnH,
      );
      path.lineTo(
        offsetX + (p[b * 3] as number) * drawnW,
        offsetY + (p[b * 3 + 1] as number) * drawnH,
      );
    }
    return path;
  }, [smoothed, frame, screenW, screenH, bones]);

  const opacity = useDerivedValue(() => (visible.value ? 1 : 0), [visible]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group opacity={opacity}>
        {/* Outer halo — wide and heavily blurred. */}
        <Path
          path={skeleton}
          style="stroke"
          strokeWidth={18}
          strokeCap="round"
          strokeJoin="round"
          color={color}
          opacity={0.35}
        >
          <BlurMask blur={18} style="normal" />
        </Path>

        {/* Inner glow — tighter and brighter, gives the line body. */}
        <Path
          path={skeleton}
          style="stroke"
          strokeWidth={8}
          strokeCap="round"
          strokeJoin="round"
          color={color}
          opacity={0.85}
        >
          <BlurMask blur={6} style="normal" />
        </Path>

        {/* Core — crisp, near-white so the limb reads clearly against the glow. */}
        <Path
          path={skeleton}
          style="stroke"
          strokeWidth={3}
          strokeCap="round"
          strokeJoin="round"
          color="#eaffef"
        />

        <Joints
          pose={smoothed}
          frame={frame}
          color={color}
          screenW={screenW}
          screenH={screenH}
        />
      </Group>
    </Canvas>
  );
}

function Joints({
  pose,
  frame,
  color,
  screenW,
  screenH,
}: {
  pose: SharedValue<number[]>;
  frame: SharedValue<PoseFrameSize>;
  color: string;
  screenW: number;
  screenH: number;
}) {
  return (
    <Group>
      {Array.from({ length: 17 }, (_, i) => (
        <Joint
          key={i}
          index={i}
          pose={pose}
          frame={frame}
          color={color}
          screenW={screenW}
          screenH={screenH}
        />
      ))}
    </Group>
  );
}

/**
 * One joint marker.
 *
 * Each reads the shared buffer independently so a low-confidence joint can
 * collapse to zero radius without disturbing the others.
 */
function Joint({
  index,
  pose,
  frame,
  color,
  screenW,
  screenH,
}: {
  index: number;
  pose: SharedValue<number[]>;
  frame: SharedValue<PoseFrameSize>;
  color: string;
  screenW: number;
  screenH: number;
}) {
  const cx = useDerivedValue(() => {
    const f = frame.value;
    if (f.width === 0) return -100;
    const scale = Math.max(screenW / f.width, screenH / f.height);
    const drawnW = f.width * scale;
    return (screenW - drawnW) / 2 + (pose.value[index * 3] ?? 0) * drawnW;
  }, [pose, frame, screenW, screenH]);

  const cy = useDerivedValue(() => {
    const f = frame.value;
    if (f.height === 0) return -100;
    const scale = Math.max(screenW / f.width, screenH / f.height);
    const drawnH = f.height * scale;
    return (screenH - drawnH) / 2 + (pose.value[index * 3 + 1] ?? 0) * drawnH;
  }, [pose, frame, screenW, screenH]);

  const r = useDerivedValue(
    () => ((pose.value[index * 3 + 2] ?? 0) >= DRAW_THRESHOLD ? 5.5 : 0),
    [pose],
  );

  return (
    <>
      <Circle cx={cx} cy={cy} r={r} color={color} opacity={0.7}>
        <BlurMask blur={10} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={r} color="#ffffff" />
    </>
  );
}
