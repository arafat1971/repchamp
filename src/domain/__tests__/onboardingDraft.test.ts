import { parseDraft, serializeDraft, type OnboardingDraft } from '../onboardingDraft';

const NOW = Date.UTC(2026, 9, 3, 12);
const DRAFT: OnboardingDraft = {
  step: 9,
  username: 'hana_fit',
  avatarUri: 'file:///cache/a.jpg',
  goal: 'strength',
  level: 'new',
  blocker: null,
  weeklyGoal: 5,
  plan: 'month',
  feel: 'stuck',
  circle: 'partner',
  styles: ['strength', 'yoga'],
  when: 'morning',
};

describe('onboarding draft', () => {
  it('round-trips', () => {
    expect(parseDraft(serializeDraft(DRAFT, NOW), NOW + 1000)).toEqual(DRAFT);
  });

  it('is no draft for missing, malformed or wrong-version data', () => {
    expect(parseDraft(null, NOW)).toBeNull();
    expect(parseDraft('', NOW)).toBeNull();
    expect(parseDraft('{not json', NOW)).toBeNull();
    expect(parseDraft('[]', NOW)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...DRAFT, v: 99, savedAt: NOW }), NOW)).toBeNull();
  });

  /* The step list changed, so a draft written against the old one would resume
     on the wrong screen. It must read as no draft. */
  it('discards a draft saved against the previous step list', () => {
    expect(parseDraft(JSON.stringify({ ...DRAFT, v: 1, savedAt: NOW }), NOW)).toBeNull();
  });

  it('expires after two weeks, so a stale half-finished flow does not resurrect', () => {
    const raw = serializeDraft(DRAFT, NOW);
    expect(parseDraft(raw, NOW + 13 * 86_400_000)).not.toBeNull();
    expect(parseDraft(raw, NOW + 15 * 86_400_000)).toBeNull();
  });

  it('sanitises what it reads from disk', () => {
    const raw = JSON.stringify({
      ...DRAFT,
      v: 2,
      savedAt: NOW,
      username: 'ha na!!',
      weeklyGoal: 99,
      plan: 'weird',
      circle: 'everyone',
      styles: ['yoga', 7, null, 'mind'],
    });
    const d = parseDraft(raw, NOW)!;
    expect(d.username).toBe('hana');
    expect(d.weeklyGoal).toBe(4);
    expect(d.plan).toBe('year');
    expect(d.circle).toBeNull();
    expect(d.styles).toEqual(['yoga', 'mind']);
  });
});
