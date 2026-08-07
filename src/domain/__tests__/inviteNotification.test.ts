import { buildInviteNotification } from '@/domain/inviteNotification';

describe('buildInviteNotification', () => {
  it('puts the movement and duration in the title', () => {
    const c = buildInviteNotification({
      fromName: 'Ana',
      exercise: 'push',
      duration: 20,
      kind: 'duel',
    });
    expect(c.title).toBe('Duel · Push-Ups · 20s');
    expect(c.body).toContain('Ana');
  });

  it('formats a whole minute as "1 min" and a remainder as m:ss', () => {
    expect(
      buildInviteNotification({ fromName: 'A', exercise: 'squat', duration: 60, kind: 'duel' }).title,
    ).toBe('Duel · Squats · 1 min');
    expect(
      buildInviteNotification({ fromName: 'A', exercise: 'squat', duration: 90, kind: 'duel' }).title,
    ).toBe('Duel · Squats · 1:30');
  });

  it('names the stakes when both levels are known', () => {
    expect(
      buildInviteNotification({
        fromName: 'Ana',
        exercise: 'push',
        duration: 20,
        kind: 'duel',
        hostLevel: 5,
        myLevel: 3,
      }).body,
    ).toBe("Ana challenged you. They're 2 levels up — beat them and it counts double.");

    expect(
      buildInviteNotification({
        fromName: 'Ana',
        kind: 'duel',
        hostLevel: 4,
        myLevel: 4,
      }).body,
    ).toBe("Ana challenged you. You're dead level.");
  });

  it('never invents a level gap when either level is missing', () => {
    const c = buildInviteNotification({
      fromName: 'Ana',
      kind: 'duel',
      hostLevel: 9,
    });
    expect(c.body).toBe('Ana challenged you to a duel.');
  });

  it('stays silent about a gap when the host is below the reader', () => {
    const c = buildInviteNotification({
      fromName: 'Ana',
      kind: 'duel',
      hostLevel: 2,
      myLevel: 7,
    });
    expect(c.body).toBe('Ana challenged you to a duel.');
  });

  it('drops an unrecognised exercise id rather than printing it raw', () => {
    const c = buildInviteNotification({
      fromName: 'Ana',
      exercise: 'moon-jump',
      duration: 30,
      kind: 'duel',
    });
    expect(c.title).toBe('Duel · 30s');
    expect(c.title).not.toContain('moon-jump');
  });

  it('ignores a nonsense duration', () => {
    for (const duration of [0, -5, Number.NaN]) {
      expect(
        buildInviteNotification({ fromName: 'A', exercise: 'push', duration, kind: 'duel' }).title,
      ).toBe('Duel · Push-Ups');
    }
  });

  it('falls back to a bare title when nothing is known', () => {
    expect(buildInviteNotification({ fromName: 'A', kind: 'duel' }).title).toBe('Duel challenge');
  });

  it('uses cooperative wording for train, and never the duel stakes line', () => {
    const c = buildInviteNotification({
      fromName: 'Sam',
      exercise: 'squat',
      duration: 45,
      kind: 'train',
      hostLevel: 9,
      myLevel: 1,
    });
    expect(c.title).toBe('Train together · Squats · 45s');
    expect(c.body).toBe('Sam wants to train with you.');
    expect(c.body).not.toContain('levels up');
  });

  it('uses weekly wording for compete', () => {
    const c = buildInviteNotification({ fromName: 'Sam', exercise: 'push', duration: 20, kind: 'compete' });
    expect(c.title).toBe('Weekly challenge · Push-Ups · 20s');
    expect(c.body).toBe('Sam challenged you this week.');
  });
});
