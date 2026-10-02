import { lastSeenLabel } from '../lastSeen';

const NOW = 1_700_000_000_000;
const ago = (ms: number) => NOW - ms;

describe('lastSeenLabel', () => {
  it('lets the presence flag win over the timestamp', () => {
    expect(lastSeenLabel(true, ago(3 * 3_600_000), NOW)).toBe('Active now');
  });

  it('reads recent activity in minutes, hours and days', () => {
    expect(lastSeenLabel(false, ago(20_000), NOW)).toBe('Active just now');
    expect(lastSeenLabel(false, ago(5 * 60_000), NOW)).toBe('Active 5m ago');
    expect(lastSeenLabel(false, ago(3 * 3_600_000), NOW)).toBe('Active 3h ago');
    expect(lastSeenLabel(false, ago(30 * 3_600_000), NOW)).toBe('Active yesterday');
    expect(lastSeenLabel(false, ago(3 * 86_400_000), NOW)).toBe('Active 3d ago');
  });

  it('says only Offline when there is nothing recent or trustworthy', () => {
    expect(lastSeenLabel(false, null, NOW)).toBe('Offline');
    expect(lastSeenLabel(false, ago(9 * 86_400_000), NOW)).toBe('Offline');
    expect(lastSeenLabel(false, NOW + 60_000, NOW)).toBe('Offline');
  });
});
