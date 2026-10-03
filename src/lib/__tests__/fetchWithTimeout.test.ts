import { fetchWithTimeout } from '../fetchWithTimeout';

describe('fetchWithTimeout', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('passes the response through when the request settles in time', async () => {
    const res = { ok: true } as Response;
    global.fetch = jest.fn(async () => res) as never;
    await expect(fetchWithTimeout('https://x.test', {}, 1000)).resolves.toBe(res);
  });

  it('rejects when the request never settles', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as never;
    const pending = fetchWithTimeout('https://x.test', {}, 500);
    const assertion = expect(pending).rejects.toThrow('aborted');
    jest.advanceTimersByTime(500);
    await assertion;
  });
});
