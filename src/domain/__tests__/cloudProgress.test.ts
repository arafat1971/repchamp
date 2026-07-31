import {
  buildCloudProgressSlice,
  compactTrainedDays,
  hydrateSessionsFromCloudProgress,
  mergeCloudProgressSlice,
  mergeProgrammeProgress,
} from '../cloudProgress';

describe('compactTrainedDays', () => {
  it('dedupes, sorts, and caps', () => {
    expect(compactTrainedDays(['2026-07-02', 'bad', '2026-07-01', '2026-07-02'])).toEqual([
      '2026-07-01',
      '2026-07-02',
    ]);
  });
});

describe('buildCloudProgressSlice', () => {
  it('rolls up week XP and per-exercise reps', () => {
    const now = new Date(2026, 6, 30); // Thursday in ISO week
    const slice = buildCloudProgressSlice({
      now,
      programme: { programmeId: 'pushup-ladder', completedDays: 3 },
      sessions: [
        {
          id: '1',
          exercise: 'push',
          mode: 'practice',
          reps: 10,
          opponentReps: null,
          opponentId: null,
          target: null,
          won: true,
          xp: 40,
          formScore: 80,
          durationSec: 20,
          completedAt: '2026-07-30T12:00:00.000Z',
          day: '2026-07-30',
        },
        {
          id: '2',
          exercise: 'squat',
          mode: 'solo',
          reps: 20,
          opponentReps: null,
          opponentId: null,
          target: 25,
          won: false,
          xp: 80,
          formScore: 70,
          durationSec: 30,
          completedAt: '2026-07-29T12:00:00.000Z',
          day: '2026-07-29',
        },
      ],
    });
    expect(slice.trainedDays).toEqual(['2026-07-29', '2026-07-30']);
    expect(slice.weekXp).toBe(120);
    expect(slice.weekExerciseReps.push).toBe(10);
    expect(slice.weekExerciseReps.squat).toBe(20);
    expect(slice.programme?.completedDays).toBe(3);
  });
});

describe('mergeCloudProgressSlice', () => {
  it('takes max weekXp within the same week', () => {
    const merged = mergeCloudProgressSlice(
      {
        trainedDays: ['2026-07-30'],
        weekKey: '2026-W31',
        weekXp: 40,
        weekExerciseReps: { push: 10 },
        programme: null,
      },
      {
        trainedDays: ['2026-07-29'],
        weekKey: '2026-W31',
        weekXp: 100,
        weekExerciseReps: { push: 5, squat: 20 },
        programme: { programmeId: 'pushup-ladder', completedDays: 2 },
      },
    );
    expect(merged.trainedDays).toEqual(['2026-07-29', '2026-07-30']);
    expect(merged.weekXp).toBe(100);
    expect(merged.weekExerciseReps.push).toBe(10);
    expect(merged.weekExerciseReps.squat).toBe(20);
    expect(merged.programme).toEqual({ programmeId: 'pushup-ladder', completedDays: 2 });
  });
});

describe('mergeProgrammeProgress', () => {
  it('advances completedDays for the same programme', () => {
    expect(
      mergeProgrammeProgress(
        { programmeId: 'pushup-ladder', completedDays: 2 },
        { programmeId: 'pushup-ladder', completedDays: 5 },
      ),
    ).toEqual({ programmeId: 'pushup-ladder', completedDays: 5 });
  });
});

describe('hydrateSessionsFromCloudProgress', () => {
  it('fills missing trained days and week XP delta', () => {
    const now = new Date(2026, 6, 30);
    const hydrated = hydrateSessionsFromCloudProgress(
      [],
      {
        trainedDays: ['2026-07-28', '2026-07-29'],
        weekKey: '2026-W31',
        weekXp: 200,
        weekExerciseReps: { push: 40 },
        programme: null,
      },
      now,
    );
    expect(hydrated.some((s) => s.day === '2026-07-28')).toBe(true);
    expect(hydrated.some((s) => s.day === '2026-07-29')).toBe(true);
    expect(hydrated.reduce((a, s) => a + s.xp, 0)).toBe(200);
    expect(hydrated.filter((s) => s.exercise === 'push').reduce((a, s) => a + s.reps, 0)).toBeGreaterThanOrEqual(
      40,
    );
    // Week stubs must not invent "trained today" when cloud only has earlier days.
    expect(hydrated.some((s) => s.id.startsWith('cloud-week') && s.day === '2026-07-30')).toBe(
      false,
    );
    expect(hydrated.some((s) => s.id.startsWith('cloud-week') && s.day === '2026-07-29')).toBe(true);
  });

  it('does not double-count when local already has the week', () => {
    const now = new Date(2026, 6, 30);
    const local = [
      {
        id: 'local',
        exercise: 'push' as const,
        mode: 'practice' as const,
        reps: 40,
        opponentReps: null,
        opponentId: null,
        target: null,
        won: true,
        xp: 200,
        formScore: 80,
        durationSec: 20,
        completedAt: '2026-07-30T12:00:00.000Z',
        day: '2026-07-30',
      },
    ];
    const hydrated = hydrateSessionsFromCloudProgress(
      local,
      {
        trainedDays: ['2026-07-30'],
        weekKey: '2026-W31',
        weekXp: 200,
        weekExerciseReps: { push: 40 },
        programme: null,
      },
      now,
    );
    expect(hydrated).toHaveLength(1);
  });
});
