/**
 * What a drink was, and how it looks in the bear.
 *
 * Every drink still counts toward the day's total — this is about what the
 * athlete sees, not a hydration-factor model. Each kind has a colour, and the
 * bear shows the day as layers in the order they were drunk: a coffee on top
 * of a morning's water is visibly a coffee.
 *
 * A drink logged before kinds existed has none and reads as water.
 */

export const DRINK_KINDS = ['water', 'juice', 'coffee', 'tea', 'milk', 'smoothie', 'lemonade'] as const;
export type DrinkKind = (typeof DRINK_KINDS)[number];

export const DRINK_META: Record<DrinkKind, { label: string; emoji: string; color: string }> = {
  water: { label: 'Water', emoji: '💧', color: '#38bdf8' },
  juice: { label: 'Juice', emoji: '🧃', color: '#fb923c' },
  coffee: { label: 'Coffee', emoji: '☕', color: '#8b5a2b' },
  tea: { label: 'Tea', emoji: '🍵', color: '#d9a441' },
  milk: { label: 'Milk', emoji: '🥛', color: '#f5efe6' },
  smoothie: { label: 'Smoothie', emoji: '🍓', color: '#f472b6' },
  lemonade: { label: 'Lemonade', emoji: '🍋', color: '#fde047' },
};

export function parseDrinkKind(raw: unknown): DrinkKind {
  return typeof raw === 'string' && (DRINK_KINDS as readonly string[]).includes(raw)
    ? (raw as DrinkKind)
    : 'water';
}

export interface DrinkLayer {
  kind: DrinkKind;
  ml: number;
}

/**
 * The day's drinks as bottom-to-top layers.
 *
 * Oldest first, so the first drink of the day sits at the bottom. Consecutive
 * drinks of the same kind merge into one layer — three glasses of water are
 * one band, not three stripes. Beyond `maxLayers`, the oldest layers fold
 * into the bottom one, so the recent story stays readable.
 */
export function drinkLayers(
  drinks: readonly { ml: number; at: string; kind?: string }[],
  maxLayers = 6,
): DrinkLayer[] {
  const ordered = [...drinks].sort((a, b) => a.at.localeCompare(b.at));
  const layers: DrinkLayer[] = [];
  for (const d of ordered) {
    if (!(d.ml > 0)) continue;
    const kind = parseDrinkKind(d.kind);
    const top = layers[layers.length - 1];
    if (top && top.kind === kind) top.ml += d.ml;
    else layers.push({ kind, ml: d.ml });
  }
  while (layers.length > maxLayers) {
    const [first, second] = layers as [DrinkLayer, DrinkLayer];
    layers.splice(0, 2, { kind: second.kind, ml: first.ml + second.ml });
  }
  return layers;
}
