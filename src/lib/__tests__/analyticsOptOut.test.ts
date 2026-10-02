import { flush, identify, track } from '../analytics';
import { useSettingsStore } from '@/state/settingsStore';

/**
 * The "Share usage analytics" switch. These run with a key configured, which
 * the no-op suite in `analytics.test.ts` deliberately does not, so the guarantee
 * that matters here — an athlete who turns it off sends nothing — is exercised
 * on the path that would actually send.
 */
jest.mock('@/lib/config', () => ({ posthogKey: () => 'phc_test' }));

const fetchSpy = jest.spyOn(globalThis, 'fetch');

beforeEach(async () => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue({ ok: true } as Response);
  useSettingsStore.setState({ shareAnalytics: true });
  identify('u1');
  await flush(); // empty any events left by an earlier test
  fetchSpy.mockClear();
});

describe('Share usage analytics', () => {
  it('sends events when on (the default)', async () => {
    track('app_opened');
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('queues and sends nothing when off', async () => {
    useSettingsStore.setState({ shareAnalytics: false });
    track('app_opened');
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('discards events already waiting when it is switched off', async () => {
    track('app_opened');
    useSettingsStore.setState({ shareAnalytics: false });
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Back on: the discarded event must not reappear.
    useSettingsStore.setState({ shareAnalytics: true });
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
