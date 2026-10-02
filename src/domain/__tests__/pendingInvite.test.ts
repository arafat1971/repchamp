import { parseInvite, serializeInvite } from '../pendingInvite';

const NOW = Date.UTC(2026, 9, 3, 12);

describe('pending invite', () => {
  it('round-trips an allowed route', () => {
    const raw = serializeInvite({ pathname: '/couple/join', params: { code: 'AB12' } }, NOW);
    expect(parseInvite(raw, NOW + 1)).toEqual({ pathname: '/couple/join', params: { code: 'AB12' } });
  });

  it('replays nothing for a route outside the allowlist', () => {
    const raw = JSON.stringify({ pathname: '/modal/settings', params: {}, savedAt: NOW });
    expect(parseInvite(raw, NOW)).toBeNull();
  });

  it('drops params that are not short strings under plain names', () => {
    const raw = JSON.stringify({
      pathname: '/duel/join',
      params: { id: 'abc', bad: 5, 'x y': 'no', long: 'z'.repeat(500) },
      savedAt: NOW,
    });
    expect(parseInvite(raw, NOW)).toEqual({ pathname: '/duel/join', params: { id: 'abc' } });
  });

  it('expires after a week and tolerates garbage', () => {
    const raw = serializeInvite({ pathname: '/duel/join', params: { id: 'x' } }, NOW);
    expect(parseInvite(raw, NOW + 8 * 86_400_000)).toBeNull();
    expect(parseInvite('nope', NOW)).toBeNull();
    expect(parseInvite(null, NOW)).toBeNull();
  });
});
