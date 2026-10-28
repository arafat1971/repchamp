import { ClipOp, Skia, TileMode, type SkCanvas, type SkFont, type SkImage, type SkTypeface } from '@shopify/react-native-skia';

import {
  CLIP,
  frameAt,
  resultHeadline,
  theirDisplayName,
  type RaceClipInput,
  type RaceTimeline,
} from '@/domain/raceClip';

/**
 * Paints one frame of the race clip onto a 720x1280 canvas.
 *
 * Layout keeps everything that matters inside x 60..620 and above y 1050:
 * TikTok and Reels lay their buttons down the right edge and the caption over
 * the bottom fifth.
 */

export interface ClipAssets {
  heavy: SkTypeface;
  bold: SkTypeface;
  logo: SkImage | null;
  trophy: SkImage | null;
}

export interface ClipScene {
  input: RaceClipInput;
  timeline: RaceTimeline;
  /** Shown in the header chip, e.g. "SQUATS · 20s DUEL". */
  chip: string;
}

const W = CLIP.width;
const H = CLIP.height;
const MID = W / 2;
const ME_X = 200;
const THEM_X = 500;

const C = {
  bgTop: '#101826',
  bgBottom: '#0b1220',
  me: '#4ade80',
  them: '#60a5fa',
  ink: '#ffffff',
  quiet: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.10)',
  brand: '#22C55E',
  dark: '#0F1512',
  gold: '#fbbf24',
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const fonts = new WeakMap<SkTypeface, Map<number, SkFont>>();
function font(typeface: SkTypeface, size: number): SkFont {
  let sizes = fonts.get(typeface);
  if (!sizes) {
    sizes = new Map();
    fonts.set(typeface, sizes);
  }
  let cached = sizes.get(size);
  if (!cached) {
    cached = Skia.Font(typeface, size);
    sizes.set(size, cached);
  }
  return cached;
}

function paint(color: string, alpha = 1) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setAlphaf(alpha);
  return p;
}

function textWidth(f: SkFont, text: string) {
  return f.measureText(text).width;
}

/** The largest size up to `max` at which `text` fits in `width`. */
function fitted(typeface: SkTypeface, text: string, width: number, max: number): SkFont {
  const probe = font(typeface, max);
  const w = textWidth(probe, text);
  if (w <= width) return probe;
  return font(typeface, Math.max(12, Math.floor((max * width) / w)));
}

function centered(canvas: SkCanvas, text: string, x: number, y: number, f: SkFont, color: string, alpha = 1) {
  canvas.drawText(text, x - textWidth(f, text) / 2, y, paint(color, alpha), f);
}

/** Draws `draw` scaled by `s` around (x, y). */
function scaled(canvas: SkCanvas, x: number, y: number, s: number, draw: () => void) {
  canvas.save();
  canvas.translate(x, y);
  canvas.scale(s, s);
  canvas.translate(-x, -y);
  draw();
  canvas.restore();
}

function background(canvas: SkCanvas) {
  const p = Skia.Paint();
  p.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: 0 },
      { x: W, y: H },
      [Skia.Color(C.bgTop), Skia.Color(C.bgBottom)],
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), p);
}

function header(canvas: SkCanvas, scene: ClipScene, assets: ClipAssets) {
  const word = 'RepChamp';
  const f = font(assets.heavy, 44);
  const icon = 64;
  const gap = 14;
  const total = (assets.logo ? icon + gap : 0) + textWidth(f, word);
  let x = MID - total / 2;
  if (assets.logo) {
    canvas.save();
    canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(x, 92, icon, icon), 16, 16), ClipOp.Intersect, true);
    canvas.drawImageRect(
      assets.logo,
      Skia.XYWHRect(0, 0, assets.logo.width(), assets.logo.height()),
      Skia.XYWHRect(x, 92, icon, icon),
      paint(C.ink),
    );
    canvas.restore();
    x += icon + gap;
  }
  canvas.drawText(word, x, 140, paint(C.ink), f);

  const chipFont = font(assets.bold, 24);
  const chipW = textWidth(chipFont, scene.chip) + 40;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(MID - chipW / 2, 178, chipW, 46), 23, 23), paint(C.ink, 0.1));
  centered(canvas, scene.chip, MID, 209, chipFont, C.quiet);
}

function intro(canvas: SkCanvas, scene: ClipScene, assets: ClipAssets, t: number) {
  const me = scene.input.myName.toUpperCase() || 'ME';
  const them = theirDisplayName(scene.input).toUpperCase();
  const a = easeOutBack(clamp01(t * 1.8));
  const b = easeOutBack(clamp01((t - 0.15) * 1.8));
  const c = easeOutBack(clamp01((t - 0.3) * 1.8));

  scaled(canvas, MID, 520, a, () =>
    centered(canvas, me, MID, 545, fitted(assets.heavy, me, 560, 92), C.me),
  );
  scaled(canvas, MID, 660, b, () =>
    centered(canvas, scene.input.cooperative ? '+' : 'VS', MID, 700, font(assets.heavy, 120), C.ink),
  );
  scaled(canvas, MID, 800, c, () =>
    centered(canvas, them, MID, 830, fitted(assets.heavy, them, 560, 92), C.them),
  );
  if (scene.input.cooperative) {
    centered(canvas, 'ONE SHARED SET', MID, 940, font(assets.bold, 30), C.quiet, clamp01((t - 0.4) * 3));
  }
}

/** 1 right as a rep lands, fading to 0 over 220 ms of clip time. */
function pulse(fractions: readonly number[], raceT: number) {
  let last = -1;
  for (const f of fractions) if (f <= raceT && f > last) last = f;
  if (last < 0) return 0;
  return clamp01(1 - ((raceT - last) * CLIP.raceMs) / 220);
}

function column(
  canvas: SkCanvas,
  assets: ClipAssets,
  opts: {
    x: number;
    name: string;
    count: number;
    maxCount: number;
    color: string;
    pop: number;
    trophy: boolean;
  },
) {
  const { x, name, count, maxCount, color, pop } = opts;
  const trophy = opts.trophy ? assets.trophy : null;
  // Room for the trophy beside the winner's name, inside the same 250 width.
  const nameFont = fitted(assets.heavy, name, trophy ? 200 : 250, 40);
  centered(canvas, name, x + (trophy ? 22 : 0), 430, nameFont, color);
  if (trophy) {
    const th = 46;
    const tw = (th * trophy.width()) / trophy.height();
    const left = x + 22 - textWidth(nameFont, name) / 2 - tw - 10;
    canvas.drawImageRect(
      trophy,
      Skia.XYWHRect(0, 0, trophy.width(), trophy.height()),
      Skia.XYWHRect(left, 430 - 38, tw, th),
      paint(C.ink),
    );
  }

  const numberFont = font(assets.heavy, 190);
  scaled(canvas, x, 580, 1 + 0.16 * pop, () => centered(canvas, String(count), x, 645, numberFont, C.ink));

  const barTop = 700;
  const barH = 230;
  const barW = 110;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x - barW / 2, barTop, barW, barH), 24, 24), paint(C.ink, 0.08));
  const fill = maxCount > 0 ? (barH * count) / maxCount : 0;
  if (fill > 0) {
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(x - barW / 2, barTop + barH - fill, barW, fill), 24, 24),
      paint(color, 0.85),
    );
  }
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function drawFrame(canvas: SkCanvas, scene: ClipScene, assets: ClipAssets, frameIndex: number) {
  const { input, timeline } = scene;
  const f = frameAt(input, timeline, frameIndex);

  background(canvas);
  header(canvas, scene, assets);

  if (f.phase === 'intro') {
    intro(canvas, scene, assets, f.phaseT);
    return;
  }

  const maxCount = Math.max(input.myReps, input.theirReps, 1);
  const result = f.phase === 'result';
  const meWon = !input.cooperative && !input.drew && input.won;
  const themWon = !input.cooperative && !input.drew && !input.won;

  if (!result) {
    centered(canvas, clock(f.secondsLeft), MID, 320, font(assets.heavy, 64), C.ink);
  } else {
    const { headline, score } = resultHeadline(input);
    const s = easeOutBack(clamp01(f.phaseT * 3));
    const color = input.drew ? C.gold : themWon ? C.them : C.me;
    scaled(canvas, MID, 300, s, () =>
      centered(canvas, headline, MID, 318, fitted(assets.heavy, headline, 580, 64), color),
    );
    centered(canvas, score, MID, 362, font(assets.bold, 26), C.quiet, clamp01(f.phaseT * 3));
  }

  column(canvas, assets, {
    x: ME_X,
    name: input.myName.toUpperCase() || 'ME',
    count: f.myCount,
    maxCount,
    color: C.me,
    pop: result ? 0 : pulse(timeline.mine, f.raceT),
    trophy: result && meWon,
  });
  column(canvas, assets, {
    x: THEM_X,
    name: theirDisplayName(input).toUpperCase(),
    count: f.theirCount,
    maxCount,
    color: C.them,
    pop: result ? 0 : pulse(timeline.theirs, f.raceT),
    trophy: result && themWon,
  });

  if (result) {
    // The ask, rising in once the score has landed.
    const t = easeOutCubic(clamp01((f.phaseT - 0.2) * 2.5));
    const y = 958 - 30 * (1 - t);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(100, y, 520, 92), 46, 46), paint(C.brand, t));
    centered(canvas, 'Race me on RepChamp', MID, y + 59, font(assets.heavy, 38), C.dark, t);
  }
}
