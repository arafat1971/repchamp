import { INVITE_CARD_SNOOZE_DAYS, showInvitePartnerCard, type InviteCardInput } from '../invitePartnerCard';

const NOW = Date.UTC(2026, 9, 3, 12);
const base: InviteCardInput = {
  paired: false,
  coupleLoading: false,
  hasTrained: true,
  focusKind: 'daily-challenge',
  dismissedAt: null,
  now: NOW,
};
const show = (over: Partial<InviteCardInput> = {}) => showInvitePartnerCard({ ...base, ...over });

describe('showInvitePartnerCard', () => {
  it('shows for a solo athlete who has trained, under any non-invite hero', () => {
    expect(show()).toBe(true);
    expect(show({ focusKind: 'goal-met' })).toBe(true);
    expect(show({ focusKind: 'recovery' })).toBe(true);
  });

  it('never shows to someone paired', () => {
    expect(show({ paired: true })).toBe(false);
  });

  it('waits for the couple document, so a paired athlete never flashes an invite', () => {
    expect(show({ coupleLoading: true })).toBe(false);
  });

  it('does not ask a brand-new athlete for a partner before their first rep', () => {
    expect(show({ hasTrained: false, focusKind: 'first-session' })).toBe(false);
  });

  it('stays out of the way when the hero is already the invite', () => {
    expect(show({ focusKind: 'invite-partner' })).toBe(false);
  });

  it('is hidden for a week after Not now, then returns', () => {
    const day = 86_400_000;
    expect(show({ dismissedAt: NOW - day })).toBe(false);
    expect(show({ dismissedAt: NOW - (INVITE_CARD_SNOOZE_DAYS - 1) * day })).toBe(false);
    expect(show({ dismissedAt: NOW - INVITE_CARD_SNOOZE_DAYS * day })).toBe(true);
  });
});
