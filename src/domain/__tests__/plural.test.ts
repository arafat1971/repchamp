import { pluralise, pluralNoun } from '@/domain/plural';

describe('pluralise', () => {
  it('uses the singular at exactly one', () => {
    expect(pluralise(1, 'rep')).toBe('1 rep');
    expect(pluralise(1, 'day')).toBe('1 day');
  });

  it('pluralises everything else, including zero', () => {
    expect(pluralise(0, 'rep')).toBe('0 reps');
    expect(pluralise(2, 'rep')).toBe('2 reps');
    expect(pluralise(247, 'set')).toBe('247 sets');
  });

  /* Irregulars pass their own plural rather than gaining an `s`. */
  it('takes an explicit plural when the noun is not regular', () => {
    expect(pluralise(1, 'entry', 'entries')).toBe('1 entry');
    expect(pluralise(3, 'entry', 'entries')).toBe('3 entries');
  });
});

describe('pluralNoun', () => {
  /* For rows that style the number separately from the word. */
  it('returns the word alone', () => {
    expect(pluralNoun(1, 'rep')).toBe('rep');
    expect(pluralNoun(2, 'rep')).toBe('reps');
    expect(pluralNoun(1, 'entry', 'entries')).toBe('entry');
  });
});

/**
 * The guard that catches what the domain-level copy tests cannot.
 *
 * `countGrammar.test.ts` exercises the pure copy builders at a count of one,
 * which is precise but blind to JSX — and five of the seven "1 reps" bugs on
 * this branch lived in `.tsx`. Reintroducing one of those fixes leaves all 1082
 * tests passing, which is exactly how they shipped.
 *
 * ## Scope, and why it is this narrow
 *
 * A first attempt scanned every counted noun app-wide. It flagged 26 sites, of
 * which 18 were correct code — fractions, rates, thresholds where one cannot
 * occur — and closing that gap meant writing ever-cleverer exemption regexes.
 * Tuning a matcher is not finding bugs, and a guard whose exemption list is
 * longer than its assertion teaches people to extend the list.
 *
 * So this watches the files that have actually gone wrong, and only those. Each
 * has a demonstrated history: every one appears in the eight hand-fixes on this
 * branch. New copy elsewhere is covered by review and by `countGrammar`; when a
 * ninth bug turns up in a new file, add that file here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const NOUNS = ['reps', 'sets', 'days', 'sessions', 'duels', 'badges'];

/** Files where "1 reps" has actually shipped. */
const WATCHED = [
  'app/modal/history.tsx',
  'app/modal/notifications.tsx',
  'app/session/form-report.tsx',
  'app/couple/index.tsx',
  'app/(tabs)/index.tsx',
  'src/domain/formReportTeaser.ts',
  'src/domain/progressProof.ts',
];

/** Cleared when the line already pluralises, uses the helper, or is a fraction. */
const HANDLED = [
  /\?\s*'[a-z]*'\s*:\s*'[a-z]*'/,
  /plural(ise|Noun)\(/,
  /* A fraction or range on either side: "3 of 4 days", "/ {goal} days",
     "of the last {N} days". The plural agrees with the phrase, not one term. */
  /(\{[^}]+\}\s*(of|to|\/)|(of|to|\/)\s*(the\s+\w+\s+)?\{)/,
  /* A threshold on the same line proves one is unreachable — `if (streak >= 3)`
     guards "days in a row", `>= 100` guards "reps banked". Narrow on purpose:
     the guard must be visible right there, not inferred from elsewhere. */
  /(>=|>)\s*([2-9]|\d{2,})/,
  /^\s*\*/,
];

describe('no bare interpolated count in the files this has bitten', () => {
  it.each(WATCHED)('%s pluralises every counted noun', (rel) => {
    const offenders: string[] = [];
    readFileSync(join(ROOT, rel), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (HANDLED.some((re) => re.test(line))) return;
        for (const noun of NOUNS) {
          if (new RegExp(`[$]?\\{[^}]+\\}\\s+${noun}\\b`).test(line)) {
            offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
            break;
          }
        }
      });
    expect(offenders).toEqual([]);
  });
});
