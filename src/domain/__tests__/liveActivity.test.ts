import { liveActivity } from '@/domain/liveActivity';

describe('liveActivity', () => {
  it('reports AI partners honestly while seeding a fresh community', () => {
    const a = liveActivity(0, 6, true);
    expect(a.count).toBe(6);
    expect(a.label).toBe('training partners ready');
    expect(a.seeded).toBe(true);
  });

  it('singularises the AI label for one partner', () => {
    expect(liveActivity(0, 1, true).label).toBe('training partner ready');
  });

  it('switches to real athletes once a community exists', () => {
    const a = liveActivity(40, 6, false);
    expect(a.count).toBe(40);
    expect(a.label).toBe('athletes active');
    expect(a.seeded).toBe(false);
  });

  it('prefers the real count when real actives already exceed the AI roster, even mid-seed', () => {
    const a = liveActivity(10, 6, true);
    expect(a.count).toBe(10);
    expect(a.seeded).toBe(false);
  });

  it('singularises the real label for one athlete', () => {
    expect(liveActivity(1, 6, false).label).toBe('athlete active');
  });

  it('never returns a negative count', () => {
    expect(liveActivity(-5, 6, false).count).toBe(0);
  });
});
