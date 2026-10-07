import {
  isDeviceStrained,
  noteInferenceMs,
  recentlyStrained,
  resetThermalHistoryForTests,
  resetThermalTelemetry,
} from '../thermal';
import { PHONE_REST_COPY } from '@/domain/phoneRestCopy';

/** Feeds `ms` once a "frame" for `seconds`, at 30 frames a second. */
function run(ms: number, seconds: number, startAt: number): number {
  let t = startAt;
  for (let i = 0; i < seconds * 30; i++) {
    noteInferenceMs(ms, t);
    t += 1000 / 30;
  }
  return t;
}

describe('device strain detection', () => {
  beforeEach(() => resetThermalHistoryForTests());

  it('stays quiet on a healthy phone', () => {
    run(28, 60, 1_000);
    expect(isDeviceStrained()).toBe(false);
  });

  it('ignores a short burst of slow frames', () => {
    const t = run(80, 5, 1_000);
    run(28, 30, t);
    expect(isDeviceStrained()).toBe(false);
  });

  it('does not let the hold timer span a pause in frames', () => {
    let t = run(70, 5, 1_000); // slow, but not yet 20s
    t += 60_000; // frames stop: backgrounded or between phases
    run(70, 5, t); // only 5s of slow frames since resuming
    expect(isDeviceStrained()).toBe(false);
  });

  it('flags a phone that stays slow for a sustained spell', () => {
    run(70, 40, 1_000);
    expect(isDeviceStrained()).toBe(true);
  });

  it('does not clear the moment it dips just under the threshold', () => {
    let t = run(70, 40, 1_000);
    t = run(44, 40, t); // between the enter and exit thresholds: hold
    expect(isDeviceStrained()).toBe(true);
    run(28, 40, t); // clearly recovered
    expect(isDeviceStrained()).toBe(false);
  });
});

describe('remembering a hot set for the next one', () => {
  beforeEach(() => resetThermalHistoryForTests());

  it('is false when the phone never struggled', () => {
    run(28, 30, 1_000);
    expect(recentlyStrained(10 * 60_000, 60_000)).toBe(false);
  });

  it('survives the session-start reset, then expires', () => {
    const end = run(70, 40, 1_000);
    resetThermalTelemetry(); // a new set begins
    expect(isDeviceStrained()).toBe(false);
    expect(recentlyStrained(10 * 60_000, end + 60_000)).toBe(true);
    expect(recentlyStrained(10 * 60_000, end + 11 * 60_000)).toBe(false);
  });
});

describe('notice wording', () => {
  it('speaks about the phone, not about the app failing', () => {
    const all = Object.values(PHONE_REST_COPY)
      .flatMap((c) => [c.title, c.body])
      .join(' ')
      .toLowerCase();
    expect(all).toContain('phone');
    for (const word of ['error', 'fail', 'slow', 'lag', 'bug', 'sorry', 'crash', 'broken']) {
      expect(all).not.toContain(word);
    }
  });
});
