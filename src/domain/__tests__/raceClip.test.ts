import {
  CLIP,
  CLIP_FRAME_COUNT,
  buildTimeline,
  clipCaption,
  countAt,
  frameAt,
  normaliseRepTimes,
  theirDisplayName,
  resultHeadline,
  type RaceClipInput,
} from '@/domain/raceClip';

const base: RaceClipInput = {
  myName: 'Sam',
  theirName: 'Alex',
  theirIsAI: false,
  exerciseLabel: 'Squats',
  cooperative: false,
  won: true,
  drew: false,
  myReps: 4,
  theirReps: 2,
  startedAt: 1_000,
  durationMs: 20_000,
  myRepTimes: [3_000, 6_000, 11_000, 16_000],
  theirRepTimes: [9_000, 19_000],
};

const lastFrame = CLIP_FRAME_COUNT - 1;
const raceStartFrame = Math.ceil((CLIP.introMs / 1000) * CLIP.fps);
const raceFrameAt = (t: number) =>
  Math.round(((CLIP.introMs + CLIP.raceMs * t) / 1000) * CLIP.fps);

describe('raceClip', () => {
  it('is 8.2 seconds of 9:16 at 30 fps', () => {
    expect(CLIP.width / CLIP.height).toBeCloseTo(9 / 16);
    expect(CLIP_FRAME_COUNT).toBe(246);
  });

  it('places reps by their real time in the race', () => {
    expect(normaliseRepTimes([3_000, 11_000], 2, 1_000, 20_000)).toEqual([0.1, 0.5]);
  });

  it('spaces reps evenly when the start is unknown', () => {
    expect(normaliseRepTimes([5, 6], 2, null, 20_000)).toEqual([0.25, 0.75]);
  });

  it('fills reps that arrived without a time so the count still reaches the total', () => {
    const out = normaliseRepTimes([11_000], 3, 1_000, 20_000);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(0.5);
    expect(out[1]).toBeGreaterThan(0.5);
    expect(out[2]).toBeLessThan(1);
  });

  it('clamps times outside the race and ignores extra stamps', () => {
    expect(normaliseRepTimes([0, 99_000, 5_000], 2, 1_000, 20_000)).toEqual([0, 1]);
  });

  it('counts the reps landed by a point in the race', () => {
    expect(countAt([0.1, 0.5, 0.9], 0.5)).toBe(2);
    expect(countAt([], 1)).toBe(0);
  });

  it('opens on the title card at zero', () => {
    const f = frameAt(base, buildTimeline(base), 0);
    expect(f.phase).toBe('intro');
    expect(f.myCount).toBe(0);
    expect(f.theirCount).toBe(0);
    expect(f.secondsLeft).toBe(20);
  });

  it('replays the race from the recorded times', () => {
    const timeline = buildTimeline(base);
    expect(frameAt(base, timeline, raceStartFrame).phase).toBe('race');
    const half = frameAt(base, timeline, raceFrameAt(0.5));
    expect(half.myCount).toBe(3);
    expect(half.theirCount).toBe(1);
    expect(half.secondsLeft).toBe(10);
  });

  it('always ends on the true final score', () => {
    const f = frameAt(base, buildTimeline(base), lastFrame);
    expect(f.phase).toBe('result');
    expect(f.myCount).toBe(4);
    expect(f.theirCount).toBe(2);
    expect(f.secondsLeft).toBe(0);
  });

  it('never counts down past the total during the race', () => {
    const timeline = buildTimeline(base);
    let prev = 0;
    for (let i = 0; i < CLIP_FRAME_COUNT; i++) {
      const f = frameAt(base, timeline, i);
      expect(f.myCount).toBeGreaterThanOrEqual(prev);
      expect(f.myCount).toBeLessThanOrEqual(base.myReps);
      prev = f.myCount;
    }
  });

  it('headlines the end card for a viewer, naming the winner', () => {
    expect(resultHeadline(base)).toEqual({ headline: 'SAM WINS', score: '4-2 · SQUATS' });
    expect(resultHeadline({ ...base, won: false, theirIsAI: true, theirName: 'Mia' }).headline).toBe(
      'MIA (AI) WINS',
    );
    expect(resultHeadline({ ...base, won: false, drew: true }).headline).toBe('DEAD HEAT');
    expect(resultHeadline({ ...base, cooperative: true })).toEqual({
      headline: '6 TOGETHER',
      score: '4 + 2 · SQUATS',
    });
  });

  it('labels AI partners as AI', () => {
    expect(theirDisplayName({ theirName: 'Mia', theirIsAI: true })).toBe('Mia (AI)');
    expect(theirDisplayName({ theirName: 'Alex', theirIsAI: false })).toBe('Alex');
    expect(theirDisplayName({ theirName: ' ', theirIsAI: false })).toBe('Opponent');
  });

  it('writes a caption that ends with the link', () => {
    expect(clipCaption(base, 'https://x.y')).toBe(
      '4 squats. Think you can beat me on RepChamp? https://x.y',
    );
    expect(clipCaption({ ...base, cooperative: true }, 'L')).toContain('6 squats together');
  });
});
