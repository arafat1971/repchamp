import { calculateCoupleStreak, type Couple, type CoupleFreezeBank } from '../couple';
import {
  COUPLE_FREEZE_CAP,
  coupleFreezeBank,
  planCoupleFreeze,
} from '../coupleFreeze';
import { shiftDay } from '../streakFreeze';

/** `n` consecutive days ending on `last`. */
function run(last: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(last, i - n + 1));
}

function couple(a: string[], b: string[], freeze?: CoupleFreezeBank | null): Couple {
  return {
    id: 'ABC123',
    memberUids: ['a', 'b'],
    pending: false,
    members: [
      { uid: 'a', displayName: 'a', avatarUrl: null, trainedDays: a, totalReps: 0 },
      { uid: 'b', displayName: 'b', avatarUrl: null, trainedDays: b, totalReps: 0 },
    ],
    ...(freeze !== undefined ? { freeze } : {}),
  };
}

const bank = (banked: number, frozenDays: string[] = [], lastEarnedDay: string | null = null) => ({
  banked,
  frozenDays,
  lastEarnedDay,
});

describe('coupleFreezeBank', () => {
  it('reads a missing bank as the starter freeze', () => {
    expect(coupleFreezeBank(couple([], [])).banked).toBe(1);
  });

  it('clamps a tampered count to the cap', () => {
    expect(coupleFreezeBank(couple([], [], bank(99))).banked).toBe(COUPLE_FREEZE_CAP);
  });
});

describe('planCoupleFreeze', () => {
  it('spends a freeze when one partner missed two days in a row', () => {
    // Both trained 5 days to Oct 20; B missed the 21st and 22nd. Today is the 23rd.
    const days = run('2026-10-20', 5);
    const c = couple([...days, '2026-10-21', '2026-10-22'], days, bank(1));
    expect(calculateCoupleStreak(c, '2026-10-23')).toBe(0);

    const next = planCoupleFreeze(c, '2026-10-23');
    expect(next).toEqual(bank(0, ['2026-10-22']));
    expect(calculateCoupleStreak({ ...c, freeze: next }, '2026-10-23')).toBe(5);
  });

  it('spends nothing when the gap is too long to save', () => {
    const days = run('2026-10-20', 5);
    const c = couple(days, days, bank(1));
    expect(planCoupleFreeze(c, '2026-10-25')).toBeNull();
  });

  it('is idempotent, so both phones applying it cannot spend twice', () => {
    const days = run('2026-10-20', 5);
    const c = couple(days, days, bank(2));
    const once = planCoupleFreeze(c, '2026-10-23');
    expect(once?.banked).toBe(1);
    expect(planCoupleFreeze({ ...c, freeze: once }, '2026-10-23')).toBeNull();
  });

  it('earns one freeze on a 7-day milestone, once', () => {
    const days = run('2026-10-20', 7);
    const c = couple(days, days, bank(0));
    const next = planCoupleFreeze(c, '2026-10-20');
    expect(next).toEqual(bank(1, [], '2026-10-20'));
    expect(planCoupleFreeze({ ...c, freeze: next }, '2026-10-21')).toBeNull();
  });

  it('earns a milestone reached while neither phone was open', () => {
    const days = run('2026-10-20', 7);
    const next = planCoupleFreeze(couple(days, days, bank(0)), '2026-10-21');
    expect(next?.banked).toBe(1);
  });

  it('stops earning at the cap but still marks the milestone paid', () => {
    const days = run('2026-10-20', 7);
    const next = planCoupleFreeze(couple(days, days, bank(COUPLE_FREEZE_CAP)), '2026-10-20');
    expect(next).toEqual(bank(COUPLE_FREEZE_CAP, [], '2026-10-20'));
  });

  it('writes the starter bank the first time a paired couple is seen', () => {
    expect(planCoupleFreeze(couple(['2026-10-20'], ['2026-10-20']), '2026-10-20')).toEqual(bank(1));
  });

  it('does nothing for an unpaired invite', () => {
    const c: Couple = { ...couple([], []), pending: true, members: [couple([], []).members[0]!] };
    expect(planCoupleFreeze(c, '2026-10-20')).toBeNull();
  });
});
