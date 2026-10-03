import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { lightImpactHaptic, playTickleSound } from '@/lib/feedback';
import type { PandaMood, PandaOutfit } from '@/domain/pandaMood';
import type { PandaAction } from '@/domain/pandaActions';
import * as Art from '../../../plugins/pandaArt';
import type { Part } from '../../../plugins/pandaArt';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

/* ---------- The drawing, compiled once per outfit ---------- */

interface Compiled {
  parts: { d: string; fill: string; stroke?: string; width?: number; opacity?: number }[];
  grads: { id: string; name: string; box?: readonly [number, number, number] }[];
}

let seq = 0;
function compile(parts: Part[]): Compiled {
  const grads: Compiled['grads'] = [];
  const out = parts.map((p) => {
    let fill = p.fill ?? 'none';
    if (fill.startsWith('grad:') && Art.GRADIENTS[fill.slice(5)]) {
      const id = `g${seq++}`;
      grads.push({ id, name: fill.slice(5), box: p.box });
      fill = `#${id}`;
    }
    return { d: p.d, fill, stroke: p.stroke, width: p.width, opacity: p.opacity };
  });
  return { parts: out, grads };
}

const LOOKS = ['open', 'love', 'sparkle'] as const;
const LIDS = ['shut', 'happy', 'thirsty', 'sleepy'] as const;
const MOUTHS = ['smile', 'sip', 'gulp', 'thirsty', 'o', 'sleepy', 'blep'] as const;
type Look = (typeof LOOKS)[number];
type Lid = (typeof LIDS)[number];
type Mouth = (typeof MOUTHS)[number];

function build(outfit: PandaOutfit) {
  const eyes = Art.EYES;
  return {
    back: compile(Art.backParts(outfit, { feet: false })),
    feet: [compile(Art.footParts(0)), compile(Art.footParts(1))] as const,
    nose: compile(Art.noseParts()),
    blush: compile(Art.blushParts()),
    head: compile(Art.headParts(outfit, { ears: false, nose: false })),
    ears: [compile(Art.earParts(0)), compile(Art.earParts(1))] as const,
    whites: compile(eyes.flatMap((e) => Art.eyeWhiteParts(e))),
    iris: Object.fromEntries(LOOKS.map((l) => [l, compile(eyes.flatMap((e) => Art.irisParts(e, l)))])) as Record<Look, Compiled>,
    lids: Object.fromEntries(LIDS.map((k) => [k, compile(eyes.flatMap((e) => Art.lidParts(e, k)))])) as Record<Lid, Compiled>,
    mouths: Object.fromEntries(MOUTHS.map((m) => [m, compile(Art.mouthParts(m))])) as Record<Mouth, Compiled>,
    doodle: compile(Art.doodleParts(outfit)),
    sweat: compile(Art.sweatParts()),
    bottleBack: compile(Art.bottleBackParts(Art.REST)),
    bottleFront: compile(Art.bottleFrontParts(Art.REST)),
    arms: compile(Art.armParts(outfit, Art.REST)),
  };
}
const ART: Record<PandaOutfit, ReturnType<typeof build>> = { classic: build('classic'), hoodie: build('hoodie') };

function GradientDefs({ scope, arts }: { scope: string; arts: Compiled[] }) {
  return (
    <Defs>
      {arts.flatMap((a) =>
        a.grads.map(({ id, name, box }) => {
          const g = Art.GRADIENTS[name];
          if (!g) return null;
          const stops = g.stops.map(([o, c, op]) => <Stop key={o} offset={o} stopColor={c} stopOpacity={op ?? 1} />);
          if (g.type === 'linear') {
            return (
              <LinearGradient key={id} id={`${scope}${id}`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                {stops}
              </LinearGradient>
            );
          }
          const [cx, cy, r] = g.relative && box ? Art.gradientCircle(g, box) : [g.cx, g.cy, g.r];
          return (
            <RadialGradient key={id} id={`${scope}${id}`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r}>
              {stops}
            </RadialGradient>
          );
        }),
      )}
    </Defs>
  );
}

function Parts({ scope, art }: { scope: string; art: Compiled }) {
  return (
    <>
      {art.parts.map((p, i) => (
        <Path
          key={i}
          d={p.d}
          fill={p.fill.startsWith('#g') ? `url(#${scope}${p.fill.slice(1)})` : p.fill}
          stroke={p.stroke}
          strokeWidth={p.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={p.opacity}
        />
      ))}
    </>
  );
}

function Layer({ scope, arts, children }: { scope: string; arts: Compiled[]; children?: React.ReactNode }) {
  return (
    <Svg viewBox={`0 0 ${Art.W} ${Art.H}`} style={StyleSheet.absoluteFill}>
      <GradientDefs scope={scope} arts={arts} />
      {children}
    </Svg>
  );
}

/* Pivots as fractions of the 200 x 260 box. */
const NECK = '50% 67%';
/** Where each ear meets the head (drawing coordinates): a twitch swings it from here. */
const EAR_PIVOTS = [
  [Art.EARS[0]![0] + 10, Art.EARS[0]![1] + Art.DY + 12],
  [Art.EARS[1]![0] - 10, Art.EARS[1]![1] + Art.DY + 12],
] as const;

/** The top of the eyes: lids slide down from here. */
const LID_TOP = `50% ${((Art.EYES[0]!.cy - Art.EYES[0]!.r - 1.2) / Art.H) * 100}%`;
/** The belly breathes from the ground up. */
const SEAT = '50% 90%';
/** The bottle turns about its own centre when lifted. */
const BOTTLE_PIVOT = `${(Art.REST.cx / Art.W) * 100}% ${((Art.REST.cy + Art.DY) / Art.H) * 100}%`;
/** Lifting to drink: turn and move the resting bottle onto the sip pose. */
const LIFT = {
  angle: Art.SIP.angle - Art.REST.angle,
  dx: Art.SIP.cx - Art.REST.cx,
  dy: Art.SIP.cy - Art.REST.cy,
};

/** An ear flick: a quick swing, then a springy settle. */
function flick(amt: number) {
  'worklet';
  return withSequence(withTiming(amt, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 6, stiffness: 260 }));
}

/** Happy feet: kick, kick, settle. */
function kick() {
  'worklet';
  return withSequence(
    withTiming(1, { duration: 120 }),
    withTiming(-1, { duration: 140 }),
    withTiming(0.8, { duration: 130 }),
    withSpring(0, { damping: 7, stiffness: 200 }),
  );
}

/** A squash-and-stretch hop: crouch, spring up, land soft. */
function squashHop() {
  'worklet';
  return withSequence(
    withTiming(-0.6, { duration: 140, easing: Easing.out(Easing.quad) }),
    withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
    withSpring(0, { damping: 6, stiffness: 170 }),
  );
}

type Reaction = 'love' | 'giggle' | 'surprise' | 'hug';

/** Run a state update just after the current effect, not inside it. */
const later = (fn: () => void) => {
  setTimeout(fn, 0);
};

/**
 * The hydration panda: a fluffy vector panda hugging a big water bottle that
 * holds what is left of today's water (`remaining`, 0..100 %).
 *
 * It is alive on its own — it breathes, sways, blinks and glances around —
 * and answers what is happening:
 * - `sipKey` bumping: it lifts the bottle to its mouth, tips it, gulps twice
 *   with happy eyes, and the water drains to the new level mid-gulp. The
 *   water stays level with the ground while the bottle tips.
 * - `mood`: `thirsty` (heavy lids, sweat drop), `sleepy` (drowsy, z's),
 *   `celebrate` (sparkly eyes — the bottle is finished), `happy`.
 * - `interactive`: a tap gets a reaction (a giggle, a hop, a
 *   surprised jump), and its eyes follow your finger.
 */
export function PandaJar({
  id,
  remaining,
  width,
  phase,
  sipKey,
  outfit = 'classic',
  mood = 'happy',
  mirrored = false,
  interactive = false,
  onPoke,
  gesture,
  decorations = false,
  paused = false,
}: {
  /** Unique per panda — SVG ids are global. */
  id: string;
  /** What is left in the bottle, 0..100. */
  remaining: number;
  width: number;
  phase: SharedValue<number>;
  /** Bump to make the panda take a drink. */
  sipKey: number;
  outfit?: PandaOutfit;
  mood?: PandaMood;
  /** Face the other way — the partner's panda faces mine. */
  mirrored?: boolean;
  interactive?: boolean;
  onPoke?: () => void;
  /**
   * A gesture to play: `giving` reaches toward the other panda, otherwise it
   * is on the receiving end. A new `key` plays it again.
   */
  gesture?: { kind: PandaAction; key: number; giving: boolean } | null;
  /**
   * The doodles, sweat drop and sparkles around the panda. Off in the app,
   * where the panda stands clean; on for the widget preview, to match the
   * home-screen widget.
   */
  decorations?: boolean;
  /** Stop the idle loops and the per-frame fur spring — the screen is not the one on show. */
  paused?: boolean;
}) {
  const art = ART[outfit];
  const reduced = useReducedMotion();
  const height = (width * Art.H) / Art.W;
  const target = Math.max(0, Math.min(100, remaining)) / 100;
  const scope = useMemo(() => `${id.replace(/[^a-zA-Z0-9]/g, '')}-`, [id]);

  /* The idle breath/sway, declared first: the water's slosh reads it too. */
  const idle = useSharedValue(0);
  const sway = mood === 'sleepy' ? 7 : 4.5;
  /* A tap's hop, declared early: the crown tuft reacts to it. */
  const hop = useSharedValue(0);
  /* Little life: head tilt, nose sniff, happy feet, a hop, a warm blush. */
  const tilt = useSharedValue(0);
  const nose = useSharedValue(0);
  const feet = useSharedValue(0);
  const bounce = useSharedValue(0);
  const glow = useSharedValue(0);

  /* ---- The drink ---- */
  const lift = useSharedValue(0);
  const gulp = useSharedValue(0);
  /* The drink is on while the bottle is up: derived from the lift itself, so
     the face and the bottle can never disagree. */
  const [drinking, setDrinking] = useState(false);
  const drinkingRef = useRef(false);
  useAnimatedReaction(
    () => lift.value > 0.01,
    (up, was) => {
      if (up !== was) runOnJS(setDrinking)(up);
    },
  );
  const lastSip = useRef(sipKey);
  useEffect(() => {
    if (sipKey === lastSip.current) return;
    lastSip.current = sipKey;
    if (reduced) return;
    drinkingRef.current = true;
    lift.set(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.cubic) }),
        withDelay(900, withTiming(0, { duration: 560, easing: Easing.inOut(Easing.cubic) })),
      ),
    );
    feet.set(withDelay(1500, kick()));
    gulp.set(
      withDelay(
        520,
        withSequence(
          withTiming(1, { duration: 220 }),
          withTiming(0, { duration: 220 }),
          withTiming(1, { duration: 220 }),
          withTiming(0, { duration: 220 }),
        ),
      ),
    );
    const t = setTimeout(() => {
      drinkingRef.current = false;
    }, 2000);
    return () => clearTimeout(t);
  }, [sipKey, reduced, lift, gulp, feet]);

  /* The water: it drains while the bottle is at the lips, otherwise eases. */
  const level = useSharedValue(target);
  useEffect(() => {
    if (reduced) {
      level.value = withTiming(target, { duration: 250 });
    } else if (drinkingRef.current) {
      level.value = withDelay(620, withTiming(target, { duration: 760, easing: Easing.inOut(Easing.quad) }));
    } else {
      level.value = withSpring(target, { damping: 14, stiffness: 60 });
    }
  }, [target, reduced, level]);

  /* Water keeps level with the ground: the bottle layer turns by
     `lift * LIFT.angle`, so its water is drawn tilted the other way. */
  const water = useAnimatedProps(() => ({
    d:
      Art.waterPath(
        level.value,
        Art.REST,
        phase.value * 1.6,
        reduced ? 0 : 1.1 + lift.value * 1.6,
        // The water lags the bottle's sway a little: a gentle slosh.
        -(lift.value * LIFT.angle + (idle.value - 0.5) * 2.4) + (idle.value - 0.5) * 3.5,
      ) ||
      'M0,0',
  }));

  /* ---- Idle life ---- */
  const blink = useSharedValue(0);
  const glance = useSharedValue(0);
  const earL = useSharedValue(0);
  const earR = useSharedValue(0);
  useEffect(() => {
    if (reduced || paused) return;
    idle.value = withRepeat(withTiming(1, { duration: mood === 'sleepy' ? 3600 : 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    const shut = () => withSequence(withTiming(1, { duration: 70 }), withDelay(60, withTiming(0, { duration: 90 })));
    blink.value = withRepeat(withSequence(withDelay(2800, shut()), withDelay(3400, shut()), withDelay(160, shut())), -1, false);
    glance.value = withRepeat(
      withSequence(
        withDelay(3800, withTiming(-1, { duration: 260 })),
        withDelay(900, withTiming(0.8, { duration: 320 })),
        withDelay(700, withTiming(0, { duration: 260 })),
      ),
      -1,
      false,
    );
      /* A curious head tilt now and then, held a beat. */
    tilt.set(withRepeat(
      withSequence(
        withDelay(7600, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) })),
        withDelay(1100, withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) })),
        withDelay(9800, withTiming(-0.7, { duration: 380, easing: Easing.out(Easing.back(2)) })),
        withDelay(900, withTiming(0, { duration: 420 })),
      ),
      -1,
      false,
    ));
    /* A quick sniff: two little nose twitches. */
    const twitch = () => withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 90 }));
    nose.set(withRepeat(withSequence(withDelay(5400, twitch()), withDelay(60, twitch()), withDelay(8200, twitch())), -1, false));
    /* Happy feet: a little kick-kick every so often. */
    feet.set(withRepeat(withSequence(withDelay(6300, kick()), withDelay(11200, kick())), -1, false));
    /* And a small bounce from sheer happiness. */
    bounce.set(withRepeat(withSequence(withDelay(12500, squashHop()), withDelay(15000, squashHop())), -1, false));
    /* Now and then an ear flicks — one, later the other, sometimes twice. */
    earL.value = withRepeat(withSequence(withDelay(4200, flick(-14)), withDelay(5100, flick(-10)), withDelay(260, flick(-12))), -1, false);
    earR.value = withRepeat(withSequence(withDelay(6800, flick(13)), withDelay(4300, flick(11))), -1, false);
    return () => {
      cancelAnimation(idle);
      cancelAnimation(blink);
      cancelAnimation(glance);
      cancelAnimation(earL);
      cancelAnimation(earR);
      cancelAnimation(tilt);
      cancelAnimation(nose);
      cancelAnimation(feet);
      cancelAnimation(bounce);
    };
  }, [reduced, paused, mood, idle, blink, glance, earL, earR, tilt, nose, feet, bounce]);
  const noseProps = useAnimatedProps(() => ({
    scaleX: 1 + nose.value * 0.12,
    scaleY: 1 - nose.value * 0.1,
    originX: Art.NOSE[0],
    originY: Art.NOSE[1],
  }));
  /* Feet kick in opposition: one up while the other goes down. */
  const footLProps = useAnimatedProps(() => ({ rotation: -feet.value * 14, originX: Art.HIPS[0]![0], originY: Art.HIPS[0]![1] }));
  const footRProps = useAnimatedProps(() => ({ rotation: feet.value * -10 * (feet.value < 0 ? -1.3 : 1), originX: Art.HIPS[1]![0], originY: Art.HIPS[1]![1] }));
  const blushProps = useAnimatedProps(() => ({ opacity: Math.min(1, 0.85 + glow.value * 0.6) }));
  const blushGlowProps = useAnimatedProps(() => ({ opacity: glow.value * 0.55 }));
  const earLProps = useAnimatedProps(() => ({ rotation: earL.value, originX: EAR_PIVOTS[0][0], originY: EAR_PIVOTS[0][1] }));
  const earRProps = useAnimatedProps(() => ({ rotation: earR.value, originX: EAR_PIVOTS[1][0], originY: EAR_PIVOTS[1][1] }));

  /* ---- The crown tuft: soft hair that trails the head and settles ----
     A damped spring per frame: the head's own motion drags the tips the
     other way, a light breeze keeps them alive, and a finger stroking the
     panda ruffles them. */
  const furPos = useSharedValue(0);
  const furVel = useSharedValue(0);
  const furLift = useSharedValue(0);
  const furLiftVel = useSharedValue(0);
  const furClock = useSharedValue(0);
  const lastHead = useSharedValue(0);
  const furFrame = useFrameCallback((frame) => {
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    furClock.value += dt;
    const headAngle = (idle.value - 0.5) * sway + tilt.value * 11 + lift.value * 5 + Math.sin(hop.value * Math.PI * 3) * 4 * hop.value;
    const headVel = (headAngle - lastHead.value) / Math.max(dt, 0.001);
    lastHead.value = headAngle;
    const breeze = reduced ? 0 : Math.sin(furClock.value * 0.9) * 0.18 + Math.sin(furClock.value * 2.3) * 0.06;
    // Spring toward rest (plus breeze), pushed by the head's motion.
    const k = 38;
    const c = 5.5;
    furVel.value += ((breeze - furPos.value) * k - furVel.value * c - headVel * 0.35) * dt;
    furPos.value = Math.max(-1.6, Math.min(1.6, furPos.value + furVel.value * dt));
    // A hop throws the hair up; it floats back down.
    furLiftVel.value += ((-furLift.value) * 30 - furLiftVel.value * 5 + hop.value * 40) * dt;
    furLift.value = Math.max(-1, Math.min(1.4, furLift.value + furLiftVel.value * dt));
  }, !reduced && !paused);
  useEffect(() => {
    furFrame.setActive(!reduced && !paused);
  }, [furFrame, reduced, paused]);
  const furKind = Art.FUR_KIND[outfit];
  const furProps = useAnimatedProps(() => ({ d: Art.crownFur(furPos.value, furLift.value, furClock.value, furKind) }));
  const furShadow = useAnimatedProps(() => ({ d: Art.crownFur(furPos.value, furLift.value, furClock.value, furKind) }));

  /* Stroking the panda ruffles its tuft, in the direction of the stroke. */
  const lastTouchX = useRef<number | null>(null);
  const ruffle = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    if (lastTouchX.current != null) {
      const dx = (x - lastTouchX.current) / width;
      furVel.set(furVel.get() + (mirrored ? -dx : dx) * 60);
      furLiftVel.set(furLiftVel.get() + Math.abs(dx) * 25);
    }
    lastTouchX.current = x;
  };
  /* Eyes follow a finger on the panda for a moment. */
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const follow = useSharedValue(0);
  const lookAt = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    lastTouchX.current = locationX;
    /* A touch near an ear makes it flick. */
    if (!reduced && locationY < height * 0.3) {
      const left = locationX < width * 0.4;
      const right = locationX > width * 0.6;
      if (left !== right) {
        const onMyLeft = mirrored ? right : left;
        if (onMyLeft) earL.set(flick(-18));
        else earR.set(flick(18));
      }
    }
    const nx = (locationX / width) * 2 - 1;
    const ny = (locationY / height) * 2 - 0.9;
    lookX.value = withTiming((mirrored ? -nx : nx) * 2.4, { duration: 160 });
    lookY.value = withTiming(Math.max(-1, Math.min(1, ny)) * 1.8, { duration: 160 });
    follow.value = withSequence(withTiming(1, { duration: 120 }), withDelay(1400, withTiming(0, { duration: 400 })));
  };
  const irisStyle = useAnimatedStyle(() => {
    const auto = glance.value * 1.8;
    const x = follow.value * lookX.value + (1 - follow.value) * auto;
    const y = follow.value * lookY.value;
    return { transform: [{ translateX: (x * width) / Art.W }, { translateY: (y * height) / Art.H }] };
  });

  /* ---- Taps ---- */
  const wiggle = useSharedValue(0);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [pokes, setPokes] = useState(0);
  useEffect(() => {
    if (!reaction) return;
    const t = setTimeout(() => setReaction(null), 1700);
    return () => clearTimeout(t);
  }, [reaction]);
  const poke = () => {
    lightImpactHaptic();
    // A tap is a tickle: it giggles and squirms (a surprised jump now and then).
    const next: Reaction = pokes % 4 === 3 ? 'surprise' : 'giggle';
    playTickleSound();
    setPokes((n) => n + 1);
    setReaction(next);
    if (!reduced) {
      glow.set(withSequence(withTiming(1, { duration: 180 }), withDelay(900, withTiming(0, { duration: 700 }))));
      feet.set(kick());
      if (next === 'giggle') {
        wiggle.set(0);
        wiggle.set(withTiming(1, { duration: 900 }));
      } else {
        hop.set(0);
        hop.set(
          withSequence(
            withTiming(next === 'surprise' ? 1.4 : 1, { duration: 170, easing: Easing.out(Easing.quad) }),
            withSpring(0, { damping: 5, stiffness: 150 }),
          ),
        );
      }
    }
    onPoke?.();
  };

  /* ---- Gestures between the two pandas ----
     Leaning is in screen space (outside the mirror), toward the other panda:
     right for mine on the left, left for theirs on the right. */
  const toward = mirrored ? -1 : 1;
  const lean = useSharedValue(0);
  const leanStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lean.value * toward * width * 0.11 }, { rotate: `${lean.value * toward * 9}deg` }],
  }));
  const lastGesture = useRef(gesture?.key ?? 0);
  useEffect(() => {
    if (!gesture || gesture.key === lastGesture.current) return;
    lastGesture.current = gesture.key;
    if (reduced) return;
    const { kind, giving } = gesture;
    const reach = (amt: number, hold: number) =>
      lean.set(
        withSequence(
          withTiming(amt, { duration: 240, easing: Easing.out(Easing.quad) }),
          withDelay(hold, withSpring(0, { damping: 8, stiffness: 120 })),
        ),
      );
    const bounce = (h: number) =>
      hop.set(withSequence(withTiming(h, { duration: 170, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 5, stiffness: 150 })));
    glow.set(withSequence(withTiming(1, { duration: 200 }), withDelay(1100, withTiming(0, { duration: 700 }))));
    if (kind === 'hug') {
      // Both lean all the way in and hold it, eyes closed happy, cheeks warm.
      reach(1, 1300);
      later(() => setReaction('hug'));
    } else if (kind === 'cheers') {
      // Bottles up and toward each other — clink — then a sip.
      reach(0.6, 1000);
      lift.set(withSequence(withTiming(0.55, { duration: 380, easing: Easing.out(Easing.cubic) }), withDelay(900, withTiming(0, { duration: 450 }))));
    } else if (kind === 'highfive') {
      reach(0.55, 220);
      bounce(1.1);
      feet.set(kick());
      later(() => setReaction('giggle'));
    } else if (kind === 'boop') {
      if (giving) {
        reach(0.8, 140);
      } else {
        // Nose scrunch, a surprised little "o", a hop back.
        nose.set(withSequence(withTiming(1.6, { duration: 70 }), withTiming(0, { duration: 120 }), withTiming(1.2, { duration: 70 }), withTiming(0, { duration: 140 })));
        lean.set(withSequence(withTiming(-0.35, { duration: 120 }), withSpring(0, { damping: 7, stiffness: 160 })));
        bounce(0.5);
        later(() => setReaction('surprise'));
      }
    } else if (giving) {
      // Tickling: wiggling fingers reach across.
      reach(0.45, 260);
    } else {
      later(() => setReaction('giggle'));
      wiggle.set(0);
      wiggle.set(withTiming(1, { duration: 900 }));
      feet.set(kick());
    }
    // Keyed by the gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture?.key]);

  /* Whether the drink is mid-gulp, for the mouth. */
  const [gulping, setGulping] = useState(false);
  useAnimatedReaction(
    () => gulp.value > 0.5,
    (now, before) => {
      if (now !== before) runOnJS(setGulping)(now);
    },
  );

  /* Celebrating: cheeks stay warm. */
  useEffect(() => {
    if (reduced) return;
    glow.set(mood === 'celebrate' ? withRepeat(withTiming(0.7, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true) : withTiming(0, { duration: 400 }));
  }, [mood, reduced, glow]);

  /* A blep now and then when content: the tongue pokes out for a moment. */
  const [blep, setBlep] = useState(false);
  useEffect(() => {
    if (reduced || mood !== 'happy') return;
    let off: ReturnType<typeof setTimeout> | undefined;
    const on = setInterval(() => {
      setBlep(true);
      off = setTimeout(() => setBlep(false), 1400);
    }, 13000);
    return () => {
      clearInterval(on);
      if (off) clearTimeout(off);
    };
  }, [reduced, mood]);

  /* ---- What the face shows ---- */
  const lidKind: Lid | null = drinking
    ? 'happy'
    : reaction === 'giggle' || reaction === 'hug'
      ? 'happy'
      : reaction
        ? null
        : mood === 'thirsty'
          ? 'thirsty'
          : mood === 'sleepy'
            ? 'sleepy'
            : null;
  const look: Look = reaction === 'love' || mood === 'celebrate' ? 'love' : (Art.EYE_LOOK[outfit] as Look);
  const mouth: Mouth = drinking
    ? gulping
      ? 'gulp'
      : 'sip'
    : reaction === 'surprise'
      ? 'o'
      : reaction
        ? 'smile'
        : mood === 'thirsty'
          ? 'thirsty'
          : mood === 'sleepy'
            ? 'sleepy'
            : blep
              ? 'blep'
              : 'smile';
  const blinkOn = !reduced && lidKind === null;
  /* A blink is the lids sliding down over the eyes and back up. */
  const lidSlide = useAnimatedStyle(() => ({
    opacity: blinkOn && blink.value > 0.03 ? 1 : 0,
    transform: [{ scaleY: Math.max(0.02, blink.value) }],
  }));

  /* ---- Motion ---- */
  const whole = useAnimatedStyle(() => ({
    transform: [
      { translateY: -hop.value * 12 - bounce.value * 6 },
      { rotate: `${Math.sin(wiggle.value * Math.PI * 6) * 5 * (1 - wiggle.value)}deg` },
      { scaleX: (mirrored ? -1 : 1) * (1 + hop.value * 0.03) },
      { scaleY: 1 - hop.value * 0.02 + bounce.value * 0.03 - Math.max(0, -bounce.value) * 0.08 },
    ],
  }));
  /* The belly rises and falls on its own; the head rides on top of it. */
  const belly = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + idle.value * 0.022 }, { scaleX: 1 + idle.value * 0.008 }] }));
  const head = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(idle.value - 0.5) * sway + tilt.value * 11 + lift.value * 5 + Math.sin(hop.value * Math.PI * 3) * 4 * hop.value}deg` },
      { translateY: lift.value * 3 - gulp.value * 1.2 },
    ],
  }));
  const bottle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (lift.value * LIFT.dx * width) / Art.W },
      { translateY: ((lift.value * LIFT.dy - idle.value * 1.2 - gulp.value * 1.5) * height) / Art.H },
      { rotate: `${lift.value * LIFT.angle + (idle.value - 0.5) * 2.4}deg` },
    ],
  }));
  const arms = useAnimatedStyle(() => ({
    transform: [
      { translateX: (lift.value * LIFT.dx * 0.55 * width) / Art.W },
      { translateY: ((lift.value * LIFT.dy * 0.6 - idle.value * 1.2) * height) / Art.H },
      { rotate: `${lift.value * LIFT.angle * 0.35}deg` },
    ],
  }));

  const picture = (
    <Animated.View collapsable={false} style={[{ width, height }, leanStyle]}>
    <Animated.View style={[{ width, height }, whole]}>
      <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, { transformOrigin: SEAT }, belly]}>
        <Layer scope={`${scope}b`} arts={[art.back, art.feet[0], art.feet[1]]}>
          <Parts scope={`${scope}b`} art={art.back} />
          <AnimatedG animatedProps={footLProps}>
            <Parts scope={`${scope}b`} art={art.feet[0]} />
          </AnimatedG>
          <AnimatedG animatedProps={footRProps}>
            <Parts scope={`${scope}b`} art={art.feet[1]} />
          </AnimatedG>
        </Layer>
      </Animated.View>
      <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, { transformOrigin: NECK }, head]}>
        <Layer scope={`${scope}h`} arts={[art.ears[0], art.ears[1], art.nose, art.blush, art.head, art.whites, art.doodle, art.sweat, art.mouths[mouth]]}>
          {/* Ears inside the head's own drawing, each swinging from its root. */}
          <AnimatedG animatedProps={earLProps}>
            <Parts scope={`${scope}h`} art={art.ears[0]} />
          </AnimatedG>
          <AnimatedG animatedProps={earRProps}>
            <Parts scope={`${scope}h`} art={art.ears[1]} />
          </AnimatedG>
          <Parts scope={`${scope}h`} art={art.head} />
          <AnimatedG animatedProps={blushProps}>
            <Parts scope={`${scope}h`} art={art.blush} />
          </AnimatedG>
          {/* A warmer glow over the cheeks on a tap or while celebrating. */}
          <AnimatedG animatedProps={blushGlowProps}>
            <Parts scope={`${scope}h`} art={art.blush} />
          </AnimatedG>
          <AnimatedG animatedProps={noseProps}>
            <Parts scope={`${scope}h`} art={art.nose} />
          </AnimatedG>
          <Parts scope={`${scope}h`} art={art.whites} />
          <Parts scope={`${scope}h`} art={art.mouths[mouth]} />
          {decorations ? <Parts scope={`${scope}h`} art={art.doodle} /> : null}
          {decorations && mood === 'thirsty' && !drinking ? <Parts scope={`${scope}h`} art={art.sweat} /> : null}
        </Layer>
        <Svg viewBox={`0 0 ${Art.W} ${Art.H}`} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id={`${scope}fur`} gradientUnits="userSpaceOnUse" x1={0} y1={80} x2={0} y2={30}>
              <Stop offset={0} stopColor="#FFFFFF" />
              <Stop offset={1} stopColor="#E4E9F4" />
            </LinearGradient>
          </Defs>
          <G transform="translate(1.1,1.5)">
            <AnimatedPath animatedProps={furShadow} fill="#A5AFC6" opacity={0.7} />
          </G>
          <AnimatedPath animatedProps={furProps} fill={`url(#${scope}fur)`} />
        </Svg>
        <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, irisStyle]}>
          <Layer scope={`${scope}i`} arts={[art.iris[look]]}>
            <Parts scope={`${scope}i`} art={art.iris[look]} />
          </Layer>
        </Animated.View>
        {lidKind ? (
          <Layer scope={`${scope}l`} arts={[art.lids[lidKind]]}>
            <Parts scope={`${scope}l`} art={art.lids[lidKind]} />
          </Layer>
        ) : (
          <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, { transformOrigin: LID_TOP }, lidSlide]}>
            <Layer scope={`${scope}l`} arts={[art.lids.shut]}>
              <Parts scope={`${scope}l`} art={art.lids.shut} />
            </Layer>
          </Animated.View>
        )}
      </Animated.View>
      <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, { transformOrigin: BOTTLE_PIVOT }, bottle]}>
        <Layer scope={`${scope}w`} arts={[art.bottleBack, art.bottleFront]}>
          <Defs>
            <LinearGradient id={`${scope}water`} gradientUnits="userSpaceOnUse" x1={0} y1={150} x2={0} y2={256}>
              <Stop offset={0} stopColor="#9ADEFF" />
              <Stop offset={0.5} stopColor="#56B4F8" />
              <Stop offset={1} stopColor="#2A86EA" />
            </LinearGradient>
          </Defs>
          <Parts scope={`${scope}w`} art={art.bottleBack} />
          <AnimatedPath animatedProps={water} fill={`url(#${scope}water)`} opacity={0.9} />
          <Parts scope={`${scope}w`} art={art.bottleFront} />
        </Layer>
        {drinking ? <Bubbles width={width} height={height} level={level} /> : null}
      </Animated.View>
      <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, { transformOrigin: BOTTLE_PIVOT }, arms]}>
        <Layer scope={`${scope}a`} arts={[art.arms]}>
          <Parts scope={`${scope}a`} art={art.arms} />
        </Layer>
      </Animated.View>
      {decorations && mood === 'celebrate' && !reduced ? (
        <>
          <Sparkle left={width * 0.02} top={height * 0.46} size={width * 0.12} delay={0} />
          <Sparkle left={width * 0.86} top={height * 0.6} size={width * 0.1} delay={700} />
        </>
      ) : null}
      {mood === 'sleepy' && !reduced ? <Zzz left={width * 0.78} top={height * 0.08} size={width * 0.11} /> : null}
    </Animated.View>
    </Animated.View>
  );

  return (
    <View style={{ width, height }} onTouchMove={interactive ? ruffle : undefined}>
      {interactive ? (
        <Pressable onPressIn={lookAt} onPress={poke} accessibilityRole="button" accessibilityLabel="Tap the panda">
          {picture}
        </Pressable>
      ) : (
        picture
      )}
      {reaction === 'surprise' && !reduced ? <Pop key={pokes} text="!" width={width} height={height} /> : null}
      {reaction === 'giggle' && !reduced ? <Pop key={pokes} text="hehe" width={width} height={height} /> : null}
    </View>
  );
}


/** Bubbles rising up the water column while it drinks. */
function Bubbles({ width, height, level }: { width: number; height: number; level: SharedValue<number> }) {
  return (
    <>
      {[
        { x: -4, delay: 0, size: 5 },
        { x: 4, delay: 300, size: 4 },
        { x: -1, delay: 600, size: 6 },
        { x: 2.5, delay: 900, size: 3.5 },
      ].map((b, i) => (
        <Bubble key={i} {...b} width={width} height={height} level={level} />
      ))}
    </>
  );
}

function Bubble({
  x,
  delay,
  size,
  width,
  height,
  level,
}: {
  x: number;
  delay: number;
  size: number;
  width: number;
  height: number;
  level: SharedValue<number>;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) }), 2, false));
  }, [delay, t]);
  const anim = useAnimatedStyle(() => {
    const top = Math.max(0.06, level.value - 0.05);
    const [px, py] = Art.bottleAxis(t.value * top);
    return {
      opacity: t.value > 0 && t.value < 0.95 && level.value > 0.05 ? 0.9 : 0,
      transform: [
        { translateX: ((px + x + Math.sin(t.value * 9) * 1.2) * width) / Art.W - size / 2 },
        { translateY: (py * height) / Art.H - size / 2 },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }, anim]} />;
}


/** A little word or mark popping above the head. */
function Pop({ text, width, height }: { text: string; width: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(withSpring(1, { damping: 7, stiffness: 220 }), withDelay(700, withTiming(0, { duration: 300 })));
  }, [t]);
  const anim = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.6 + t.value * 0.4 }, { translateY: -t.value * 4 }] }));
  return (
    <Animated.Text
      pointerEvents="none"
      style={[styles.pop, { left: width * 0.62, top: height * 0.04, fontSize: Math.max(12, width * 0.13) }, anim]}
    >
      {text}
    </Animated.Text>
  );
}

function Sparkle({ left, top, size, delay }: { left: number; top: number; size: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [delay, t]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.3 + t.value * 0.7, transform: [{ scale: 0.7 + t.value * 0.5 }] }));
  return (
    <Animated.Text pointerEvents="none" style={[styles.sparkle, { left, top, fontSize: size }, anim]}>
      ✨
    </Animated.Text>
  );
}

function Zzz({ left, top, size }: { left: number; top: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  const anim = useAnimatedStyle(() => ({
    opacity: t.value < 0.2 ? t.value * 5 : 1 - (t.value - 0.2) / 0.8,
    transform: [{ translateY: -t.value * size * 1.4 }, { translateX: t.value * size * 0.4 }],
  }));
  return (
    <Animated.Text pointerEvents="none" style={[styles.pop, { left, top, fontSize: size, color: '#7C8DB5' }, anim]}>
      z
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.7)',
  },
  float: { position: 'absolute', left: 0, top: 0 },
  pop: { position: 'absolute', fontWeight: '800', color: '#3B8CF0' },
  sparkle: { position: 'absolute' },
});
