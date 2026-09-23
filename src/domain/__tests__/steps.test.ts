import { readFileSync } from 'fs';
import { join } from 'path';

import {
  DEFAULT_STEP_GOAL,
  MAX_DAILY_STEPS,
  MAX_STEP_GOAL,
  MIN_STEP_GOAL,
  type StepsUnavailableReason,
  formatSteps,
  isFixableByAthlete,
  sanitizeStepGoal,
  sanitizeSteps,
  stepStepGoal,
  stepsProgress,
  stepsUnavailableCopy,
} from '../steps';

describe('a step count we are willing to believe', () => {
  it('accepts an ordinary day', () => {
    expect(sanitizeSteps(8432)).toBe(8432);
  });

  it('accepts a day with no steps yet', () => {
    expect(sanitizeSteps(0)).toBe(0);
  });

  /* Null rather than zero: "the sensor said nothing sensible" and "you have
     not moved" are different, and only the second is a number. */
  it('refuses a negative or garbage count', () => {
    expect(sanitizeSteps(-1)).toBeNull();
    expect(sanitizeSteps(Number.NaN)).toBeNull();
    expect(sanitizeSteps(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('refuses a count past any human day', () => {
    expect(sanitizeSteps(MAX_DAILY_STEPS)).toBe(MAX_DAILY_STEPS);
    expect(sanitizeSteps(MAX_DAILY_STEPS + 1)).toBeNull();
  });
});

describe('the goal', () => {
  it('clamps below the minimum up and above the maximum down', () => {
    expect(sanitizeStepGoal(10)).toBe(MIN_STEP_GOAL);
    expect(sanitizeStepGoal(999_999)).toBe(MAX_STEP_GOAL);
  });

  it('falls back to the default for a garbage goal', () => {
    expect(sanitizeStepGoal(Number.NaN)).toBe(DEFAULT_STEP_GOAL);
  });

  it('steps a thousand at a time', () => {
    expect(stepStepGoal(8000, 1)).toBe(9000);
    expect(stepStepGoal(8000, -1)).toBe(7000);
  });

  it('does not step past either end of the band', () => {
    expect(stepStepGoal(MIN_STEP_GOAL, -1)).toBe(MIN_STEP_GOAL);
    expect(stepStepGoal(MAX_STEP_GOAL, 1)).toBe(MAX_STEP_GOAL);
  });
});

describe('progress toward the goal', () => {
  it('reports the fraction walked so far', () => {
    const p = stepsProgress(4000, 8000);
    expect(p.percent).toBe(50);
    expect(p.remaining).toBe(4000);
    expect(p.met).toBe(false);
  });

  it('is met exactly at the target', () => {
    expect(stepsProgress(8000, 8000).met).toBe(true);
    expect(stepsProgress(7999, 8000).met).toBe(false);
  });

  it('never reports more than a full ring, or a negative remainder', () => {
    const p = stepsProgress(20000, 8000);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.steps).toBe(20000);
  });

  it('treats an unbelievable count as zero rather than rendering it', () => {
    expect(stepsProgress(Number.NaN, 8000).steps).toBe(0);
  });
});

describe('formatting', () => {
  it('groups thousands so five digits stay readable', () => {
    expect(formatSteps(8432)).toBe('8,432');
    expect(formatSteps(12045)).toBe('12,045');
  });

  it('renders a still day as zero', () => {
    expect(formatSteps(0)).toBe('0');
  });
});

describe('saying why there is no count', () => {
  /* Every reason must produce copy naming the actual situation. A hedged
     line sends the athlete hunting for a setting that will not help. */
  it.each<StepsUnavailableReason>(['unsupported', 'denied', 'no-sensor', 'error'])(
    'has a specific line for %s',
    (reason) => {
      const copy = stepsUnavailableCopy(reason);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy).not.toMatch(/unavailable|something went wrong/i);
    },
  );

  it('names the platform rather than blaming the device', () => {
    expect(stepsUnavailableCopy('unsupported')).toMatch(/iPhone/);
  });

  /* Only a permission refusal is worth offering a button for; the others
     cannot be fixed by tapping anything. */
  it('marks only a permission refusal as fixable by the athlete', () => {
    expect(isFixableByAthlete('denied')).toBe(true);
    expect(isFixableByAthlete('unsupported')).toBe(false);
    expect(isFixableByAthlete('no-sensor')).toBe(false);
    expect(isFixableByAthlete('error')).toBe(false);
  });
});

/*
 * The permission string iOS requires before the pedometer may be touched.
 *
 * Requesting motion access without `NSMotionUsageDescription` does not fail
 * gracefully — iOS terminates the app on the spot. So the absence of this key
 * is not a missing-feature bug, it is a crash on the first Home render of any
 * iPhone build, and the unit tests here cannot see it because they mock
 * `expo-sensors` entirely. Assert the config instead.
 */
describe('the iOS motion permission is declared', () => {
  const appJson = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'app.json'), 'utf8'),
  ) as { expo: { ios?: { infoPlist?: Record<string, unknown> } } };

  const plist = appJson.expo.ios?.infoPlist ?? {};

  it('declares NSMotionUsageDescription', () => {
    expect(typeof plist.NSMotionUsageDescription).toBe('string');
  });

  /* Apple rejects placeholder purpose strings, and an athlete reading it
     deserves to know what the data is for rather than that "the app needs
     access". */
  it('says what the steps are used for', () => {
    const copy = String(plist.NSMotionUsageDescription ?? '');
    expect(copy.length).toBeGreaterThan(30);
    expect(copy).toMatch(/step/i);
    expect(copy).not.toMatch(/requires access|needs access/i);
  });
});
