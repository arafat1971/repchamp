import {
  DAILY_CHALLENGE_EXERCISE,
  DAILY_CHALLENGE_TARGET,
  challengeXpReward,
  dailyChallengeProgress,
} from '@/domain/dailyChallenge';
import { xpForSession } from '@/domain/progression';
import type { ExerciseId } from '@/vision/exercises';

/** Minimal record — only the fields the rule actually reads carry meaning. */
const set = (day: string, exercise: ExerciseId, reps: number) => ({ day, exercise, reps });

const TODAY = '2026-09-14';
const YESTERDAY = '2026-09-13';

describe('dailyChallengeProgress', () => {
  it('reads the best single set of the challenge movement today', () => {
    const p = dailyChallengeProgress(
      [
        set(TODAY, DAILY_CHALLENGE_EXERCISE, 8),
        set(TODAY, DAILY_CHALLENGE_EXERCISE, 17),
        set(TODAY, DAILY_CHALLENGE_EXERCISE, 11),
      ],
      TODAY,
    );
    expect(p.best).toBe(17);
    expect(p.remaining).toBe(DAILY_CHALLENGE_TARGET - 17);
    expect(p.cleared).toBe(false);
  });

  /* Best set, not the day's total: "beat 25 push-ups" is one set of 25, not
     five sets of five. All three call sites already worked this way — the rule
     is stated here so it stops being re-derived by each of them. */
  it('does not add separate sets together', () => {
    const p = dailyChallengeProgress(
      [
        set(TODAY, DAILY_CHALLENGE_EXERCISE, 13),
        set(TODAY, DAILY_CHALLENGE_EXERCISE, 13),
      ],
      TODAY,
    );
    expect(p.best).toBe(13);
    expect(p.cleared).toBe(false);
  });

  it('ignores other days and other movements', () => {
    const other: ExerciseId = DAILY_CHALLENGE_EXERCISE === 'push' ? 'squat' : 'push';
    const p = dailyChallengeProgress(
      [
        set(YESTERDAY, DAILY_CHALLENGE_EXERCISE, 99),
        set(TODAY, other, 99),
      ],
      TODAY,
    );
    expect(p.best).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.remaining).toBe(DAILY_CHALLENGE_TARGET);
  });

  it('clears exactly at the target, not before', () => {
    expect(
      dailyChallengeProgress(
        [set(TODAY, DAILY_CHALLENGE_EXERCISE, DAILY_CHALLENGE_TARGET - 1)],
        TODAY,
      ).cleared,
    ).toBe(false);
    expect(
      dailyChallengeProgress([set(TODAY, DAILY_CHALLENGE_EXERCISE, DAILY_CHALLENGE_TARGET)], TODAY)
        .cleared,
    ).toBe(true);
  });

  /* The percent feeds `ProgressBar`, which takes 0–100. Beating the target is
     a real and common outcome and must not render as a bar overflowing its
     track. */
  it('clamps percent at 100 when the target is beaten', () => {
    const p = dailyChallengeProgress(
      [set(TODAY, DAILY_CHALLENGE_EXERCISE, DAILY_CHALLENGE_TARGET * 2)],
      TODAY,
    );
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.cleared).toBe(true);
  });

  it('is zeroed, not broken, for an athlete with no sessions', () => {
    const p = dailyChallengeProgress([], TODAY);
    expect(p).toMatchObject({ best: 0, percent: 0, cleared: false });
    expect(p.remaining).toBe(DAILY_CHALLENGE_TARGET);
  });

  /* The three former call sites each declared these literals separately; the
     values must not change as part of consolidating them. */
  it('keeps the challenge the three call sites already shared', () => {
    expect(DAILY_CHALLENGE_EXERCISE).toBe('push');
    expect(DAILY_CHALLENGE_TARGET).toBe(25);
  });
});

describe('challengeXpReward', () => {
  /* The modal advertised a literal +300. That is true today only because two
     numbers happen to match; deriving it means the advertised reward cannot
     drift from the reward actually granted. */
  it('is the XP a cleared challenge actually pays', () => {
    expect(challengeXpReward()).toBe(xpForSession('solo', true));
  });

  it('is the 300 the modal used to hardcode', () => {
    expect(challengeXpReward()).toBe(300);
  });
});
