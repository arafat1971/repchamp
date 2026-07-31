import { BlurMask, Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
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

/** Skeleton bone stroke width (px). */
const BONE_STROKE_WIDTH = 5;

/** Joint marker radius — medium dots (~3× the previous thin markers). */
const JOINT_RADIUS = 9;

/**
 * How far past the wrist / ankle to extend the limb line toward fingers / toes.
 * MoveNet stops at wrist and ankle; extending along the limb direction makes
 * the silhouette reach the hands and feet without inventing noisy keypoints.
 */
const HAND_EXTEND = 0.38;
const FOOT_EXTEND = 0.42;

/** Proximal → distal pairs used to grow hands and feet. */
const LIMB_TIPS: readonly (readonly [number, number, number])[] = [
  [KEYPOINT_INDEX.leftElbow, KEYPOINT_INDEX.leftWrist, HAND_EXTEND],
  [KEYPOINT_INDEX.rightElbow, KEYPOINT_INDEX.rightWrist, HAND_EXTEND],
  [KEYPOINT_INDEX.leftKnee, KEYPOINT_INDEX.leftAnkle, FOOT_EXTEND],
  [KEYPOINT_INDEX.rightKnee, KEYPOINT_INDEX.rightAnkle, FOOT_EXTEND],
];

/** Android skips all BlurMask passes — big win on Mali/Adreno mid-range SoCs. */
const LIGHT_OVERLAY = Platform.OS === 'android';

/** Fixed pose buffer length — avoids allocating a new Array every display frame. */
const SMOOTH_LEN = POSE_BUFFER_LENGTH;

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
   * Inference lands roughly every 33–50ms, but the screen refreshes every
   * 8–16ms (up to 60/120 Hz). Drawing raw inference output makes the skeleton
   * step; easing toward the newest pose every display frame keeps the UI at a
   * smooth 60 FPS feel even when the camera/model run slower.
   *
   * Double-buffers a fixed-length array so we do not allocate on every vsync.
   */
  const smoothed = useSharedValue<number[]>([]);
  const smoothA = useSharedValue<number[]>(new Array(SMOOTH_LEN).fill(0));
  const smoothB = useSharedValue<number[]>(new Array(SMOOTH_LEN).fill(0));
  const smoothFlip = useSharedValue(0);

  useFrameCallback(() => {
    'worklet';
    if (!visible.value) return;
    const target = pose.value;
    if (target.length < SMOOTH_LEN) return;

    const current = smoothed.value;
    if (current.length !== SMOOTH_LEN) {
      smoothed.value = target.slice();
      return;
    }

    const alpha = 0.35;
    const write = smoothFlip.value === 0 ? smoothA.value : smoothB.value;
    for (let i = 0; i < SMOOTH_LEN; i += 3) {
      const cx = current[i] as number;
      const cy = current[i + 1] as number;
      write[i] = cx + ((target[i] as number) - cx) * alpha;
      write[i + 1] = cy + ((target[i + 1] as number) - cy) * alpha;
      write[i + 2] = target[i + 2] as number;
    }
    // Reassign so derived Skia paths see an update; flip buffers next frame.
    smoothed.value = write;
    smoothFlip.value = 1 - smoothFlip.value;
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

    const toScreen = (nx: number, ny: number) => ({
      x: offsetX + nx * drawnW,
      y: offsetY + ny * drawnH,
    });

    for (const [a, b] of bones) {
      const as = p[a * 3 + 2] as number;
      const bs = p[b * 3 + 2] as number;
      // Skip a bone if either end is uncertain — a line to a hallucinated joint
      // reads as broken tracking, which is worse than an absent limb.
      if (as < DRAW_THRESHOLD || bs < DRAW_THRESHOLD) continue;

      const from = toScreen(p[a * 3] as number, p[a * 3 + 1] as number);
      const to = toScreen(p[b * 3] as number, p[b * 3 + 1] as number);
      path.moveTo(from.x, from.y);
      path.lineTo(to.x, to.y);
    }

    // Grow arms/legs past wrist and ankle so the figure reaches hands and feet.
    for (const [proximal, distal, extend] of LIMB_TIPS) {
      const ps = p[proximal * 3 + 2] as number;
      const ds = p[distal * 3 + 2] as number;
      if (ps < DRAW_THRESHOLD || ds < DRAW_THRESHOLD) continue;

      const px = p[proximal * 3] as number;
      const py = p[proximal * 3 + 1] as number;
      const dx = p[distal * 3] as number;
      const dy = p[distal * 3 + 1] as number;
      const tip = toScreen(dx + (dx - px) * extend, dy + (dy - py) * extend);
      const wristOrAnkle = toScreen(dx, dy);
      path.moveTo(wristOrAnkle.x, wristOrAnkle.y);
      path.lineTo(tip.x, tip.y);
    }

    return path;
  }, [smoothed, frame, screenW, screenH, bones]);

  /**
   * Tiny tip markers at the extrapolated finger / toe ends — same size as
   * other joints so the silhouette stays clean.
   */
  const tipPoints = useDerivedValue(() => {
    const tips: { x: number; y: number }[] = [];
    const p = smoothed.value;
    const f = frame.value;
    if (p.length < POSE_BUFFER_LENGTH || f.width === 0 || f.height === 0) return tips;

    const scale = Math.max(screenW / f.width, screenH / f.height);
    const drawnW = f.width * scale;
    const drawnH = f.height * scale;
    const offsetX = (screenW - drawnW) / 2;
    const offsetY = (screenH - drawnH) / 2;

    for (const [proximal, distal, extend] of LIMB_TIPS) {
      const ps = p[proximal * 3 + 2] as number;
      const ds = p[distal * 3 + 2] as number;
      if (ps < DRAW_THRESHOLD || ds < DRAW_THRESHOLD) continue;
      const px = p[proximal * 3] as number;
      const py = p[proximal * 3 + 1] as number;
      const dx = p[distal * 3] as number;
      const dy = p[distal * 3 + 1] as number;
      tips.push({
        x: offsetX + (dx + (dx - px) * extend) * drawnW,
        y: offsetY + (dy + (dy - py) * extend) * drawnH,
      });
    }
    return tips;
  }, [smoothed, frame, screenW, screenH]);

  const opacity = useDerivedValue(() => (visible.value ? 1 : 0), [visible]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group opacity={opacity}>
        {!LIGHT_OVERLAY ? (
          <>
            <Path
              path={skeleton}
              style="stroke"
              strokeWidth={BONE_STROKE_WIDTH + 8}
              strokeCap="round"
              strokeJoin="round"
              color={color}
              opacity={0.28}
            >
              <BlurMask blur={12} style="normal" />
            </Path>
            <Path
              path={skeleton}
              style="stroke"
              strokeWidth={BONE_STROKE_WIDTH + 2}
              strokeCap="round"
              strokeJoin="round"
              color={color}
              opacity={0.75}
            >
              <BlurMask blur={4} style="normal" />
            </Path>
          </>
        ) : (
          <Path
            path={skeleton}
            style="stroke"
            strokeWidth={BONE_STROKE_WIDTH + 1.5}
            strokeCap="round"
            strokeJoin="round"
            color={color}
            opacity={0.55}
          />
        )}

        <Path
          path={skeleton}
          style="stroke"
          strokeWidth={BONE_STROKE_WIDTH}
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

        <TipDots tips={tipPoints} color={color} />
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

/** One joint marker — medium filled dot, same size everywhere. */
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
    () => ((pose.value[index * 3 + 2] ?? 0) >= DRAW_THRESHOLD ? JOINT_RADIUS : 0),
    [pose],
  );

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={r}
      color={LIGHT_OVERLAY ? color : '#ffffff'}
      opacity={LIGHT_OVERLAY ? 0.95 : 1}
    />
  );
}

/** Small tip dots at extrapolated finger / toe ends. */
function TipDots({
  tips,
  color,
}: {
  tips: SharedValue<{ x: number; y: number }[]>;
  color: string;
}) {
  return (
    <Group>
      {Array.from({ length: 4 }, (_, i) => (
        <TipDot key={i} index={i} tips={tips} color={color} />
      ))}
    </Group>
  );
}

function TipDot({
  index,
  tips,
  color,
}: {
  index: number;
  tips: SharedValue<{ x: number; y: number }[]>;
  color: string;
}) {
  const cx = useDerivedValue(() => tips.value[index]?.x ?? -100, [tips]);
  const cy = useDerivedValue(() => tips.value[index]?.y ?? -100, [tips]);
  const r = useDerivedValue(() => (tips.value[index] ? JOINT_RADIUS : 0), [tips]);

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={r}
      color={LIGHT_OVERLAY ? color : '#ffffff'}
      opacity={LIGHT_OVERLAY ? 0.95 : 1}
    />
  );
}
