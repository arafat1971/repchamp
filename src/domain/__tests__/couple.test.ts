import {
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  calculateCoupleStreak,
  combinedReps,
  coupleBadges,
  coupleBondPresentation,
  coupleLevel,
  couplePoints,
  inviteDeepLink,
  inviteLink,
  parseInviteCode,
  isInSync,
  isPaired,
  lastMilestoneReached,
  makePairCode,
  memberBehindToday,
  nextMilestone,
  normalizePairCode,
  nudgeAt,
  partnerOf,
  streakAtRisk,
  type Couple,
  type CoupleMember,
} from '../couple';

function member(uid: string, trainedDays: string[] = [], totalReps = 0): CoupleMember {
  return { uid, displayName: uid, avatarUrl: null, trainedDays, totalReps };
}

function couple(members: CoupleMember[], pending = false): Couple {
  return {
    id: 'ABC123',
    memberUids: members.map((m) => m.uid),
    members,
    pending,
  };
}

describe('pair code', () => {
  it('generates a code of the right length from the unambiguous alphabet', () => {
    const code = makePairCode(() => 0.5);
    expect(code).toHaveLength(PAIR_CODE_LENGTH);
    for (const ch of code) expect(PAIR_CODE_ALPHABET).toContain(ch);
  });

  it('never emits characters people misread', () => {
    // 0/O and 1/I are the pairs that get mistyped off someone else's screen.
    for (const bad of ['O', '0', 'I', '1']) expect(PAIR_CODE_ALPHABET).not.toContain(bad);
  });

  it('normalises the spacing and case people actually type', () => {
    expect(normalizePairCode('abc-234')).toBe('ABC234');
    expect(normalizePairCode(' ABC 234 ')).toBe('ABC234');
  });

  it('rejects anything that is not a full code', () => {
    expect(normalizePairCode('ABC')).toBe('');
    expect(normalizePairCode('ABC2345678')).toBe('');
    expect(normalizePairCode('')).toBe('');
  });
});

describe('invite links', () => {
  it('builds a shareable web link carrying the code', () => {
    expect(inviteLink('ABC234')).toBe('https://repchamp.web.app/couple/join?code=ABC234');
  });

  it('round-trips: a built link parses back to the code', () => {
    expect(parseInviteCode(inviteLink('ABC234'))).toBe('ABC234');
  });

  it('parses the code from the app scheme too', () => {
    expect(parseInviteCode('repchamp://couple/join?code=abc234')).toBe('ABC234');
  });

  it('builds a custom-scheme deep link for the QR that a camera can open', () => {
    expect(inviteDeepLink('ABC234')).toBe('repchamp://couple/join?code=ABC234');
  });

  it('round-trips: the QR deep link parses back to the code', () => {
    expect(parseInviteCode(inviteDeepLink('ABC234'))).toBe('ABC234');
  });

  it('normalises a lightly-mangled code in the link', () => {
    expect(parseInviteCode('https://repchamp.web.app/couple/join?code=abc-234&x=1')).toBe('ABC234');
    expect(parseInviteCode('https://repchamp.gg/couple/join?code=ABC234')).toBe('ABC234');
  });

  it('returns null when there is no usable code', () => {
    expect(parseInviteCode('https://repchamp.web.app/couple/join')).toBeNull();
    expect(parseInviteCode('https://repchamp.web.app/couple/join?code=ABC')).toBeNull();
  });
});

describe('membership', () => {
  it('finds the partner from either side', () => {
    const c = couple([member('a'), member('b')]);
    expect(partnerOf(c, 'a')?.uid).toBe('b');
    expect(partnerOf(c, 'b')?.uid).toBe('a');
  });

  it('is not paired while the invite is still open', () => {
    expect(isPaired(couple([member('a')], true))).toBe(false);
    expect(isPaired(couple([member('a'), member('b')], true))).toBe(false);
    expect(isPaired(couple([member('a'), member('b')]))).toBe(true);
    expect(isPaired(null)).toBe(false);
  });
});

describe('combinedReps', () => {
  it('adds both partners together', () => {
    expect(combinedReps(couple([member('a', [], 120), member('b', [], 80)]))).toBe(200);
  });
});

describe('calculateCoupleStreak', () => {
  it('counts only the days BOTH partners trained', () => {
    const c = couple([
      member('a', ['2026-07-25', '2026-07-24', '2026-07-23']),
      member('b', ['2026-07-25', '2026-07-24', '2026-07-23']),
    ]);
    expect(calculateCoupleStreak(c, '2026-07-25')).toBe(3);
  });

  it('does not advance on a day only one partner trained', () => {
    // 'a' trained all three days; 'b' skipped the 24th AND the 23rd, so the
    // shared streak is just today.
    const c = couple([
      member('a', ['2026-07-25', '2026-07-24', '2026-07-23']),
      member('b', ['2026-07-25']),
    ]);
    expect(calculateCoupleStreak(c, '2026-07-25')).toBe(1);
  });

  it('survives a single shared rest day, like the solo streak', () => {
    // Both missed the 24th, but trained either side of it.
    const days = ['2026-07-25', '2026-07-23', '2026-07-22'];
    const c = couple([member('a', days), member('b', days)]);
    expect(calculateCoupleStreak(c, '2026-07-25')).toBe(3);
  });

  it('is zero for a couple that has not paired yet', () => {
    expect(calculateCoupleStreak(couple([member('a', ['2026-07-25'])]), '2026-07-25')).toBe(0);
  });
});

describe('streakAtRisk', () => {
  it('is true when a live streak has not been kept up today', () => {
    const c = couple([
      member('a', ['2026-07-25', '2026-07-24']),
      member('b', ['2026-07-24']), // partner has not trained today
    ]);
    expect(streakAtRisk(c, '2026-07-25')).toBe(true);
  });

  it('is false once both have trained today', () => {
    const days = ['2026-07-25', '2026-07-24'];
    expect(streakAtRisk(couple([member('a', days), member('b', days)]), '2026-07-25')).toBe(false);
  });

  it('is false when there is no streak to lose', () => {
    expect(streakAtRisk(couple([member('a'), member('b')]), '2026-07-25')).toBe(false);
  });

  it('names the partner who still owes a session', () => {
    const c = couple([member('a', ['2026-07-25']), member('b', [])]);
    expect(memberBehindToday(c, '2026-07-25')?.uid).toBe('b');
  });
});

describe('milestones', () => {
  it('points at the next shareable total', () => {
    expect(nextMilestone(0)).toBe(100);
    expect(nextMilestone(100)).toBe(250);
    expect(nextMilestone(999)).toBe(1_000);
  });

  it('reports the highest one already passed', () => {
    expect(lastMilestoneReached(99)).toBeNull();
    expect(lastMilestoneReached(100)).toBe(100);
    expect(lastMilestoneReached(1_200)).toBe(1_000);
  });

  it('runs out gracefully past the last milestone', () => {
    expect(nextMilestone(50_000)).toBeNull();
  });
});

describe('nudgeAt', () => {
  it('reads a resolved server timestamp', () => {
    const c = { ...couple([member('a'), member('b')]), nudge: { fromUid: 'b', at: { toMillis: () => 1234 } } };
    expect(nudgeAt(c)).toBe(1234);
  });

  it('is null while the server timestamp is still unresolved', () => {
    // A just-written nudge briefly has no usable timestamp; treating that as new
    // would fire the notification on the sender's own device.
    const c = { ...couple([member('a'), member('b')]), nudge: { fromUid: 'b', at: null } };
    expect(nudgeAt(c)).toBeNull();
    expect(nudgeAt({ ...couple([member('a')]), nudge: null })).toBeNull();
    expect(nudgeAt(null)).toBeNull();
  });
});

describe('isInSync', () => {
  const now = 10_000;

  it('is true while both partners are repping', () => {
    expect(isInSync(now, now - 500, now - 1_200)).toBe(true);
  });

  it('is false once one of them stops', () => {
    expect(isInSync(now, now - 500, now - 9_000)).toBe(false);
  });

  it('is false before either has completed a rep', () => {
    expect(isInSync(now, null, now - 500)).toBe(false);
    expect(isInSync(now, now - 500, null)).toBe(false);
  });
});

describe('couplePoints', () => {
  it('is reps plus a bonus per streak day', () => {
    expect(couplePoints(200, 0)).toBe(200);
    expect(couplePoints(200, 3)).toBe(200 + 3 * 50);
  });
});

describe('coupleLevel', () => {
  it('a brand-new couple is level 1', () => {
    const l = coupleLevel(0, 0);
    expect(l.level).toBe(1);
    expect(l.name).toBe('New Duo');
    expect(l.progress).toBe(0);
  });

  it('climbs tiers as combined points grow', () => {
    // 2000 reps + 0 streak = 2000 pts → Power Couple (level 4, min 2000).
    expect(coupleLevel(2_000, 0).level).toBe(4);
    // Streak days push a modest total over the next threshold.
    expect(coupleLevel(700, 1).points).toBe(750);
    expect(coupleLevel(700, 1).level).toBe(3); // In Step, min 750
  });

  it('reports progress toward the next tier', () => {
    // Level 1 spans 0..250; 125 pts is halfway.
    const l = coupleLevel(125, 0);
    expect(l.level).toBe(1);
    expect(l.nextAt).toBe(250);
    expect(l.progress).toBeCloseTo(0.5);
  });

  it('caps at the top tier with full progress', () => {
    const l = coupleLevel(50_000, 100);
    expect(l.name).toBe('Legends');
    expect(l.nextAt).toBeNull();
    expect(l.progress).toBe(1);
  });
});

describe('coupleBadges', () => {
  it('nothing earned for a fresh couple', () => {
    expect(coupleBadges(0, 0).every((b) => !b.earned)).toBe(true);
  });

  it('unlocks the right badges as milestones are hit', () => {
    const badges = coupleBadges(1_200, 7);
    const earned = new Set(badges.filter((b) => b.earned).map((b) => b.id));
    expect(earned).toContain('first-together');
    expect(earned).toContain('week-streak');
    expect(earned).toContain('thousand');
    // Not yet: 30-day streak, 5k reps.
    expect(earned).not.toContain('month-streak');
    expect(earned).not.toContain('five-thousand');
  });

  it('the power-couple badge tracks the level, not a raw count', () => {
    // 2000 pts reaches level 4 → power-couple earned.
    const earned = coupleBadges(2_000, 0).find((b) => b.id === 'power-couple')?.earned;
    expect(earned).toBe(true);
  });
});

describe('coupleBondPresentation', () => {
  const today = '2026-07-30';

  it('invites the first set when the bond is empty', () => {
    const p = coupleBondPresentation({
      me: member('a'),
      partner: member('b', [], 0),
      streak: 0,
      combined: 0,
      atRisk: false,
      today,
      levelName: 'New Duo',
    });
    expect(p.tone).toBe('fresh');
    expect(p.cta).toBe('Train together');
    expect(p.action).toBe('train');
    expect(p.headline.toLowerCase()).toContain('first');
  });

  it('nudges when the partner already trained', () => {
    const p = coupleBondPresentation({
      me: member('a'),
      partner: member('b', [today]),
      streak: 3,
      combined: 120,
      atRisk: true,
      today,
      levelName: 'Training Partners',
    });
    expect(p.tone).toBe('risk');
    expect(p.cta).toBe('Train now');
    expect(p.action).toBe('train');
    expect(p.headline).toMatch(/your (set|move)/i);
  });

  it('waits on the partner after you train', () => {
    const p = coupleBondPresentation({
      me: member('a', [today]),
      partner: member('knbkhk'),
      streak: 0,
      combined: 40,
      atRisk: false,
      today,
      levelName: 'New Duo',
    });
    expect(p.tone).toBe('waiting');
    expect(p.headline).toContain('knbkhk');
    expect(p.cta).toContain('Nudge');
    expect(p.action).toBe('nudge');
  });

  it('celebrates when both locked the day', () => {
    const p = coupleBondPresentation({
      me: member('a', [today]),
      partner: member('b', [today]),
      streak: 5,
      combined: 400,
      atRisk: false,
      today,
      levelName: 'In Step',
    });
    expect(p.tone).toBe('locked');
    expect(p.cta).toBeNull();
    expect(p.action).toBe('open');
    expect(p.headline).toMatch(/locked/i);
  });

  it('tracks progress toward the next milestone', () => {
    const p = coupleBondPresentation({
      me: member('a'),
      partner: member('b'),
      streak: 1,
      combined: 50,
      atRisk: false,
      today,
      levelName: 'New Duo',
    });
    expect(p.milestoneLabel).toBe('50 / 100 reps');
    expect(p.milestoneProgress).toBeCloseTo(0.5);
  });
});
