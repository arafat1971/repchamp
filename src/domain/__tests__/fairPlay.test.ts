import {
  clampDuelRepJump,
  clampDuelReps,
  clampFormScore,
  clampWeeklyXp,
  MAX_DUEL_REP_JUMP,
  MAX_DUEL_REPS,
  MAX_WEEKLY_XP,
} from '../fairPlay';
import { suggestedCameraFps, noteInferenceMs, resetThermalTelemetry, shouldRunInference } from '@/vision/thermal';

describe('fairPlay clamps', () => {
  it('clamps weekly XP and duel reps', () => {
    expect(clampWeeklyXp(-1)).toBe(0);
    expect(clampWeeklyXp(MAX_WEEKLY_XP + 10)).toBe(MAX_WEEKLY_XP);
    expect(clampDuelReps(MAX_DUEL_REPS + 1)).toBe(MAX_DUEL_REPS);
    expect(clampFormScore(150)).toBe(100);
    expect(clampFormScore(-5)).toBe(0);
  });

  it('steps live duel reps by at most MAX_DUEL_REP_JUMP', () => {
    expect(clampDuelRepJump(0, 3)).toBe(3);
    expect(clampDuelRepJump(0, 40)).toBe(MAX_DUEL_REP_JUMP);
    expect(clampDuelRepJump(10, 12)).toBe(12);
    expect(clampDuelRepJump(10, 9)).toBe(10);
    expect(clampDuelRepJump(498, 600)).toBe(MAX_DUEL_REPS);
  });
});

describe('thermal throttle', () => {
  beforeEach(() => resetThermalTelemetry());

  it('steps camera FPS down when inference is slow', () => {
    for (let i = 0; i < 20; i++) noteInferenceMs(60);
    expect(suggestedCameraFps(30)).toBeLessThanOrEqual(22);
  });

  it('skips frames when hot', () => {
    for (let i = 0; i < 20; i++) noteInferenceMs(50);
    const runs = Array.from({ length: 6 }, () => shouldRunInference());
    expect(runs.filter(Boolean).length).toBeLessThan(6);
  });
});
