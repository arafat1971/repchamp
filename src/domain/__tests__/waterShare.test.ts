import { reminderNotification, parseReminderKind } from '../partnerReminder';
import { drinkMilestone, planDrinkNotice } from '../waterShare';

const base = { paired: true, sharingWater: true, drinkUpdates: true, ml: 250, beforeMl: 0, goalMl: 2000 };

describe('drinkMilestone', () => {
  it('names the half and the goal on the drink that crosses them', () => {
    expect(drinkMilestone(750, 1000, 2000)).toBe('half');
    expect(drinkMilestone(1750, 2000, 2000)).toBe('goal');
    expect(drinkMilestone(900, 2500, 2000)).toBe('goal');
  });

  it('is null between milestones, after the goal, and on an undo', () => {
    expect(drinkMilestone(250, 500, 2000)).toBeNull();
    expect(drinkMilestone(2000, 2250, 2000)).toBeNull();
    expect(drinkMilestone(1000, 750, 2000)).toBeNull();
  });
});

describe('planDrinkNotice', () => {
  it('sends a regular update from the throttled bucket', () => {
    expect(planDrinkNotice(base)).toEqual({ milestone: null, limit: 'waterShare' });
  });

  it('sends milestones from their own bucket', () => {
    expect(planDrinkNotice({ ...base, beforeMl: 1750 })).toEqual({ milestone: 'goal', limit: 'waterMilestone' });
  });

  it('stays quiet when unpaired, not sharing, switched off, or nothing drunk', () => {
    expect(planDrinkNotice({ ...base, paired: false })).toBeNull();
    expect(planDrinkNotice({ ...base, sharingWater: false })).toBeNull();
    expect(planDrinkNotice({ ...base, drinkUpdates: false })).toBeNull();
    expect(planDrinkNotice({ ...base, ml: 0 })).toBeNull();
  });
});

describe('the drank nudge', () => {
  it('parses, and names the drink, the amount or the milestone', () => {
    expect(parseReminderKind('drank')).toBe('drank');
    expect(reminderNotification('drank', 'Bea', 250).title).toBe('Bea just drank 250 ml 💧');
    expect(reminderNotification('drank', 'Bea', 250, { drink: 'coffee' }).title).toBe('Bea had a coffee ☕ · 250 ml');
    expect(reminderNotification('drank', 'Bea', 250, { milestone: 'half' }).title).toBe(
      'Bea is halfway to their water goal 💧',
    );
    expect(reminderNotification('drank', 'Bea', 250, { milestone: 'goal' }).title).toBe(
      'Bea hit their water goal 🎉',
    );
    expect(reminderNotification('drank', 'Bea').title).toBe('Bea just drank some water 💧');
  });
});
