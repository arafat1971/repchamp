import { firstNameOf, selectHomeGreeting } from '@/domain/homeGreeting';

describe('selectHomeGreeting', () => {
  it('nudges an unbroken streak before noon', () => {
    const g = selectHomeGreeting({
      hour: 9,
      streak: 4,
      trainedToday: false,
      firstName: 'Arafat',
    });
    expect(g.timeOfDay).toBe('Good morning');
    expect(g.hook).toContain('streak');
    expect(g.bonus).toContain('+5 XP');
  });

  it('skips the deadline bonus after 6 PM', () => {
    const g = selectHomeGreeting({
      hour: 20,
      streak: 1,
      trainedToday: false,
      firstName: 'Arafat',
    });
    expect(g.bonus).toBe('Night set still counts');
  });

  it('celebrates when already trained', () => {
    const g = selectHomeGreeting({
      hour: 14,
      streak: 5,
      trainedToday: true,
      firstName: 'Arafat',
    });
    expect(g.hook).toContain('5-day');
    expect(g.bonus).toBeNull();
  });
});

describe('firstNameOf', () => {
  it('takes the first token', () => {
    expect(firstNameOf('Arafat Hossain')).toBe('Arafat');
  });
});
