import { buildDailyReminder } from '@/domain/reminderCopy';
import { pitchDate, shouldPitchUpgrade, upgradePitchSequence } from '@/domain/upgradeReminder';

const walled = {
  proReady: true,
  isPro: false,
  bonusActive: false,
  paired: false,
  repsSoFar: 0,
  billingReady: true,
  remindersEnabled: true,
};

describe('shouldPitchUpgrade', () => {
  it('pitches a walled, unpaid, solo athlete', () => {
    expect(shouldPitchUpgrade(walled)).toBe(true);
  });
  it.each([
    ['Pro', { isPro: true }],
    ['pairing bonus', { bonusActive: true }],
    ['paired (couple mode is never walled)', { paired: true }],
    ['entitlement unresolved', { proReady: false }],
    ['no billing', { billingReady: false }],
    ['reminders off', { remindersEnabled: false }],
  ])('stays silent for %s', (_name, patch) => {
    expect(shouldPitchUpgrade({ ...walled, ...patch })).toBe(false);
  });
});

describe('upgradePitchSequence', () => {
  it('is three bounded steps with distinct, non-empty copy', () => {
    const seq = upgradePitchSequence();
    expect(seq.map((s) => s.days)).toEqual([1, 3, 7]);
    expect(new Set(seq.map((s) => s.copy.title)).size).toBe(3);
    for (const s of seq) {
      expect(s.copy.title.length).toBeGreaterThan(0);
      expect(s.copy.body.length).toBeGreaterThan(0);
    }
  });
  it('invents no urgency, discount or scarcity', () => {
    const text = upgradePitchSequence().map((s) => `${s.copy.title} ${s.copy.body}`).join(' ');
    expect(text).not.toMatch(/%|off|last chance|expires|hurry|only \d|limited/i);
  });
  it('dates each step from the last open at the reminder hour', () => {
    const from = new Date(2026, 9, 9, 15, 42);
    const at = pitchDate(from, upgradePitchSequence()[1]!, 19);
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 9, 12, 19, 0]);
  });
});

describe('buildDailyReminder seed', () => {
  it('is the original copy with no seed', () => {
    expect(buildDailyReminder({ streak: 0 }).title).toBe('Time for a quick set');
    expect(buildDailyReminder({ streak: 5 }).title).toBe('Day 5 — keep it going');
  });
  it('rotates phrasings but always names the streak when it is worth naming', () => {
    const titles = [0, 1, 2].map((seed) => buildDailyReminder({ streak: 5, seed }).title);
    expect(new Set(titles).size).toBe(3);
    for (const t of titles) expect(t).toContain('5');
  });
  it('never changes the last-night warning', () => {
    for (const seed of [0, 1, 2]) {
      expect(buildDailyReminder({ streak: 5, daysAway: 2, seed }).title).toBe('Day 5 ends today');
    }
  });
});
