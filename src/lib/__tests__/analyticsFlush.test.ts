import { flush, identify, track } from '../analytics';
import { useSettingsStore } from '@/state/settingsStore';

/**
 * Flush correctness, with a key configured. Three defects lived here:
 * overlapping flushes sent a batch twice and then dropped unsent events, a
 * permanently rejected batch was retried forever, and events were attributed to
 * whoever was signed in at flush time rather than when they were tracked.
 */
jest.mock('@/lib/config', () => ({ posthogKey: () => 'phc_test' }));

const fetchSpy = jest.spyOn(globalThis, 'fetch');

function sentBatches(): { event: string; distinct_id: string }[][] {
  return fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).batch);
}

beforeEach(async () => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);
  useSettingsStore.setState({ shareAnalytics: true });
  identify('u1');
  await flush();
  fetchSpy.mockClear();
});

describe('flush', () => {
  it('does not send the same batch twice when flushes overlap', async () => {
    let release: (r: Response) => void = () => {};
    fetchSpy.mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
    track('app_opened');
    const first = flush();
    const second = flush(); // fires while the first request is still in flight
    release({ ok: true, status: 200 } as Response);
    await Promise.all([first, second]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps events for a retry after a transient failure', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    track('app_opened');
    await flush();
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentBatches()[1]).toHaveLength(1);
  });

  it('discards a batch the server permanently rejects instead of retrying it forever', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 400 } as Response);
    track('app_opened');
    await flush();
    fetchSpy.mockClear();
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retries after a rate limit', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    track('app_opened');
    await flush();
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('attributes an event to who was signed in when it happened', async () => {
    identify('alice');
    track('app_opened');
    identify('bob'); // account switch before the batch goes out
    await flush();
    expect(sentBatches()[0]![0]!.distinct_id).toBe('alice');
  });

  it('can flush again after a request throws', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    track('app_opened');
    await flush();
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
