import {
  REMINDER_KINDS,
  parseReminderKind,
  reminderButton,
  reminderNotification,
  reminderSentLine,
} from '../partnerReminder';

describe('parseReminderKind', () => {
  it('reads every known kind', () => {
    for (const k of REMINDER_KINDS) expect(parseReminderKind(k)).toBe(k);
  });

  /* A nudge from an older app has no kind; it meant "train". */
  it('treats missing or unknown kinds as the original train nudge', () => {
    expect(parseReminderKind(undefined)).toBe('train');
    expect(parseReminderKind('dance')).toBe('train');
    expect(parseReminderKind(7)).toBe('train');
  });
});

describe('reminder copy', () => {
  it('names the sender in the notification', () => {
    expect(reminderNotification('water', 'Bea').title).toBe('Bea says: drink some water 💧');
    expect(reminderNotification('walk', 'Bea').title).toContain('walk');
  });

  /* The train nudge keeps its exact old wording, so both app versions agree. */
  it('keeps the original train wording', () => {
    expect(reminderNotification('train', 'Bea')).toEqual({
      title: 'Bea is training',
      body: 'Jump in and keep your streak alive.',
    });
  });

  it('never shows an empty name', () => {
    expect(reminderNotification('run', '  ').title).toContain('Your partner');
  });

  it('gives each kind a button and a sent line', () => {
    expect(reminderButton('stretch')).toEqual({ emoji: '🧘', label: 'Stretch' });
    expect(reminderSentLine('water', 'Bea')).toBe('💧 Bea will get your water reminder.');
    expect(reminderSentLine('train', 'Bea')).toBe('Bea will get a push to come train.');
  });
});
