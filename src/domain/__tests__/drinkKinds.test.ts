import { drinkLayers, parseDrinkKind } from '../drinkKinds';

const d = (ml: number, minute: number, kind?: string) => ({
  ml,
  kind,
  at: new Date(Date.UTC(2026, 8, 24, 8, minute)).toISOString(),
});

describe('drinkLayers', () => {
  it('stacks oldest at the bottom, whatever order the log is in', () => {
    expect(drinkLayers([d(250, 30, 'coffee'), d(500, 10, 'water')])).toEqual([
      { kind: 'water', ml: 500 },
      { kind: 'coffee', ml: 250 },
    ]);
  });

  it('merges consecutive drinks of one kind into one band', () => {
    expect(drinkLayers([d(250, 1), d(250, 2), d(250, 3, 'juice'), d(250, 4)])).toEqual([
      { kind: 'water', ml: 500 },
      { kind: 'juice', ml: 250 },
      { kind: 'water', ml: 250 },
    ]);
  });

  /* Drinks logged before kinds existed are water. */
  it('reads a missing or unknown kind as water', () => {
    expect(parseDrinkKind(undefined)).toBe('water');
    expect(parseDrinkKind('beer')).toBe('water');
    expect(drinkLayers([d(250, 1, 'beer')])).toEqual([{ kind: 'water', ml: 250 }]);
  });

  it('folds the oldest layers together beyond the cap', () => {
    const many = ['water', 'juice', 'coffee', 'tea', 'milk'].map((k, i) => d(100, i, k));
    const layers = drinkLayers(many, 3);
    expect(layers).toHaveLength(3);
    expect(layers.reduce((s, l) => s + l.ml, 0)).toBe(500);
    expect(layers.map((l) => l.kind)).toEqual(['coffee', 'tea', 'milk']);
  });
});
