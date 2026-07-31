/**
 * Pro entitlement store — the money path.
 *
 * Two bugs this covers, both of which cost a paying subscriber real access:
 *   - `refresh()` used to call `fetchIsPro()` with no uid, so it fell back to
 *     whatever identity RevenueCat already held. On a cold start that is none,
 *     and a real subscriber was re-checked anonymously and read back as free.
 *   - `initialize()` floated an async IIFE with no catch, so any throw left
 *     `ready` false forever and hung the paywall on its spinner.
 */

const mockState = {
  /** Entitlement the fake RevenueCat reports, keyed by the uid it was asked about. */
  proFor: {} as Record<string, boolean>,
  /** The uid `fetchIsPro` was last called with — null means "asked anonymously". */
  lastAskedUid: null as string | null | undefined,
  /** Make `configurePurchases` reject, standing in for a billing outage. */
  configureThrows: false,
  /** Captured `watchCustomerInfo` listener, so tests can push updates. */
  listener: null as ((isPro: boolean) => void) | null,
};

jest.mock('@/services/purchases', () => ({
  configurePurchases: jest.fn(async () => {
    if (mockState.configureThrows) throw new Error('billing unavailable');
  }),
  fetchIsPro: jest.fn(async (uid?: string | null) => {
    mockState.lastAskedUid = uid;
    // A null/undefined uid is the anonymous path — never Pro.
    return uid ? (mockState.proFor[uid] ?? false) : false;
  }),
  watchCustomerInfo: jest.fn((cb: (isPro: boolean) => void) => {
    mockState.listener = cb;
    return () => {
      mockState.listener = null;
    };
  }),
}));

jest.mock('@/lib/crash', () => ({ captureError: jest.fn() }));

jest.mock('@/state/profileStore', () => ({
  useProfileStore: Object.assign(jest.fn(), { getState: () => ({}) }),
  selectPairingBonusActive: () => false,
}));

import { useProStore } from '../proStore';

/** Let the store's floating async initialise settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockState.proFor = {};
  mockState.lastAskedUid = null;
  mockState.configureThrows = false;
  mockState.listener = null;
  useProStore.setState({ isPro: false, ready: false });
});

describe('proStore.initialize', () => {
  it('reports the entitlement for the signed-in athlete', async () => {
    mockState.proFor['ada'] = true;
    const teardown = useProStore.getState().initialize('ada');
    await flush();

    expect(useProStore.getState().isPro).toBe(true);
    expect(useProStore.getState().ready).toBe(true);
    teardown();
  });

  it('becomes ready even when billing configuration throws', async () => {
    // Regression: the paywall blocks on `ready`, so a transient billing error
    // used to strand that screen on its spinner for the rest of the session.
    mockState.configureThrows = true;
    const teardown = useProStore.getState().initialize('ada');
    await flush();

    expect(useProStore.getState().ready).toBe(true);
    expect(useProStore.getState().isPro).toBe(false);
    teardown();
  });

  it('drops the previous account entitlement immediately on a uid switch', () => {
    useProStore.setState({ isPro: true, ready: true });
    const teardown = useProStore.getState().initialize('bob');

    // Synchronously, before any await resolves.
    expect(useProStore.getState().isPro).toBe(false);
    expect(useProStore.getState().ready).toBe(false);
    teardown();
  });

  it('tracks live entitlement changes from the billing listener', async () => {
    const teardown = useProStore.getState().initialize('ada');
    await flush();
    expect(useProStore.getState().isPro).toBe(false);

    mockState.listener?.(true);
    expect(useProStore.getState().isPro).toBe(true);
    teardown();
  });

  it('ignores a late listener update after teardown', async () => {
    const teardown = useProStore.getState().initialize('ada');
    await flush();
    const push = mockState.listener;
    teardown();

    push?.(true);
    expect(useProStore.getState().isPro).toBe(false);
  });
});

describe('proStore.refresh', () => {
  it('re-checks against the signed-in uid, not anonymously', async () => {
    // Regression: this used to ask with no uid, so a paying subscriber was
    // re-checked as an anonymous user and silently downgraded to free.
    mockState.proFor['ada'] = true;
    const teardown = useProStore.getState().initialize('ada');
    await flush();

    useProStore.setState({ isPro: false });
    await useProStore.getState().refresh();

    expect(mockState.lastAskedUid).toBe('ada');
    expect(useProStore.getState().isPro).toBe(true);
    teardown();
  });
});
