import { reminderNotification, parseReminderKind } from '../partnerReminder';
import { shouldShareDrink } from '../waterShare';

const base = { paired: true, sharingWater: true, drinkUpdates: true, ml: 250, partnerMet: false };

describe('shouldShareDrink', () => {
  it('shares a real drink with a partner who is still going', () => {
    expect(shouldShareDrink(base)).toBe(true);
  });

  it('stays quiet when unpaired, not sharing, switched off, or nothing drunk', () => {
    expect(shouldShareDrink({ ...base, paired: false })).toBe(false);
    expect(shouldShareDrink({ ...base, sharingWater: false })).toBe(false);
    expect(shouldShareDrink({ ...base, drinkUpdates: false })).toBe(false);
    expect(shouldShareDrink({ ...base, ml: 0 })).toBe(false);
  });

  /* Their goal is met: "your turn" would be noise. */
  it('does not nag a partner who has already met their goal', () => {
    expect(shouldShareDrink({ ...base, partnerMet: true })).toBe(false);
  });
});

describe('the drank nudge', () => {
  it('parses and names the amount', () => {
    expect(parseReminderKind('drank')).toBe('drank');
    expect(reminderNotification('drank', 'Bea', 250).title).toBe('Bea just drank 250 ml 💧');
    expect(reminderNotification('drank', 'Bea').title).toBe('Bea just drank some water 💧');
  });
});
