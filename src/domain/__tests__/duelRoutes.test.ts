import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The host opens the waiting room at `/duel/[id]` before a duel exists, passing
 * a sentinel where the id goes. That sentinel used to be `'new'` — and
 * `app/duel/new.tsx` is a real file.
 *
 * Expo Router resolves a static segment ahead of a dynamic one, so
 * `/duel/[id]` with `id: 'new'` built the URL `/duel/new`, which is the setup
 * screen the athlete was already looking at. Send Challenge asked to navigate
 * from Set Up Duel to Set Up Duel; the router did exactly that, which is
 * nothing. It returned without throwing and mounted nothing, so the button
 * read as dead while every piece of it was working.
 *
 * Nothing about that is visible in review: both files are correct on their own,
 * and the collision only exists in the router's resolution order. This pins it
 * so adding, say, `app/duel/pending.tsx` fails here rather than silently
 * breaking the same button again.
 */
const SENTINEL = 'pending';

describe('duel waiting-room sentinel', () => {
  it('does not collide with a static route in app/duel', () => {
    const routes = readdirSync(join(__dirname, '../../../app/duel'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''));

    expect(routes).toContain('[id]');
    expect(routes).not.toContain(SENTINEL);
  });

  it('is the value the setup screen actually sends', () => {
    // Guards against the constant drifting from the literal in the navigation
    // call, which would make the check above pass while the app still breaks.
    const src = readFileSyncSafe('app/duel/new.tsx');
    expect(src).toContain(`id: '${SENTINEL}'`);
  });

  it('is the value the waiting room treats as "no id yet"', () => {
    const src = readFileSyncSafe('app/duel/[id].tsx');
    expect(src).toContain(`'${SENTINEL}'`);
  });
});

function readFileSyncSafe(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  return readFileSync(join(__dirname, '../../../', rel), 'utf8');
}
