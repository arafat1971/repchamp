/**
 * Buying and restoring Pro — the paths that take money.
 *
 * `purchases.test.ts` covers the configure race and the offering fallback but
 * never calls `purchase()` or drives `restore()` past its happy path, which is
 * why the file sat at 45% branch coverage. What is tested here is the part an
 * athlete's money and entitlement actually flow through:
 *
 *  - a cancel must never read as a failure (it is the commonest outcome on a
 *    paywall, and alarming on it is how a store gets a support ticket)
 *  - a purchase must never report Pro unless the entitlement really came back
 *  - restoring with nothing to restore must say so rather than look broken
 *  - neither may proceed without a uid, or the subscription lands on an
 *    anonymous RevenueCat identity the athlete can never recover
 */

import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

const mockConfigure = jest.fn((_opts?: unknown) => undefined);
const mockLogIn = jest.fn(async (_uid?: string) => ({
  customerInfo: { entitlements: { active: {} } },
}));
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn(async () => ({ entitlements: { active: {} } }));
const mockLogOut = jest.fn(async () => ({ entitlements: { active: {} } }));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  LOG_LEVEL: { WARN: 'WARN', ERROR: 'ERROR', DEBUG: 'DEBUG', INFO: 'INFO', VERBOSE: 'VERBOSE' },
  default: {
    configure: (api: unknown) => mockConfigure(api),
    setLogLevel: jest.fn(),
    logIn: (uid: string) => mockLogIn(uid),
    getOfferings: jest.fn(),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    purchasePackage: (pkg: unknown) => mockPurchasePackage(pkg),
    restorePurchases: () => mockRestorePurchases(),
    logOut: () => mockLogOut(),
  },
}));

jest.mock('@/lib/config', () => ({
  revenueCatApiKey: () => 'goog_test_key_for_unit_tests',
}));

import {
  __resetPurchasesForTests,
  isProFromInfo,
  purchase,
  resetPurchases,
  restore,
} from '../purchases';

/** A CustomerInfo with the `pro` entitlement switched on or off. */
function info(pro: boolean): CustomerInfo {
  return {
    entitlements: { active: pro ? { pro: { isActive: true } } : {} },
  } as unknown as CustomerInfo;
}

const PKG = { identifier: 'monthly' } as unknown as PurchasesPackage;

beforeEach(() => {
  __resetPurchasesForTests();
  mockConfigure.mockClear();
  mockLogIn.mockClear();
  mockPurchasePackage.mockReset();
  mockRestorePurchases.mockReset();
  mockLogOut.mockClear();
});

describe('purchase', () => {
  it('reports Pro when the entitlement comes back active', async () => {
    mockPurchasePackage.mockResolvedValue({ customerInfo: info(true) });

    const r = await purchase(PKG, 'uid-1');

    expect(r.ok).toBe(true);
    expect(r.isPro).toBe(true);
    expect(r.cancelled).toBe(false);
    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
  });

  /* The store can return a successful transaction whose entitlement has not
     propagated yet. Trusting `ok` alone would unlock Pro for someone the
     backend does not consider subscribed. */
  it('does not claim Pro when the purchase succeeds but no entitlement is active', async () => {
    mockPurchasePackage.mockResolvedValue({ customerInfo: info(false) });

    const r = await purchase(PKG, 'uid-1');

    expect(r.ok).toBe(true);
    expect(r.isPro).toBe(false);
  });

  it('flags a user cancellation as cancelled, not as a failure to alarm about', async () => {
    mockPurchasePackage.mockRejectedValue({ userCancelled: true, message: 'cancelled' });

    const r = await purchase(PKG, 'uid-1');

    expect(r.cancelled).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.isPro).toBe(false);
  });

  it('treats a real store error as a failure, not a cancellation', async () => {
    mockPurchasePackage.mockRejectedValue(new Error('Network is unreachable'));

    const r = await purchase(PKG, 'uid-1');

    expect(r.ok).toBe(false);
    expect(r.cancelled).toBe(false);
    expect(r.message).toBe('Network is unreachable');
  });

  /* Without a uid the subscription attaches to an anonymous RevenueCat identity
     that the athlete cannot recover on their next sign-in. Refusing up front is
     the only safe answer. */
  it('refuses to buy without a uid, and never reaches the store', async () => {
    const r = await purchase(PKG, null);

    expect(r.ok).toBe(false);
    expect(r.cancelled).toBe(false);
    expect(r.message).toMatch(/sign in/i);
    expect(mockPurchasePackage).not.toHaveBeenCalled();
  });

  it('survives a rejection that is not an Error object', async () => {
    mockPurchasePackage.mockRejectedValue('a bare string');

    const r = await purchase(PKG, 'uid-1');

    expect(r.ok).toBe(false);
    expect(r.message).toBe('Purchase failed.');
  });
});

describe('restore', () => {
  it('reports Pro and no message when a subscription is found', async () => {
    mockRestorePurchases.mockResolvedValue(info(true));

    const r = await restore('uid-1');

    expect(r.ok).toBe(true);
    expect(r.isPro).toBe(true);
    expect(r.message).toBeUndefined();
  });

  /* "Nothing to restore" is a successful call with an unhappy answer — it must
     not read as an error, or an athlete with no subscription sees a crash-like
     message for behaving normally. */
  it('succeeds but explains itself when there is nothing to restore', async () => {
    mockRestorePurchases.mockResolvedValue(info(false));

    const r = await restore('uid-1');

    expect(r.ok).toBe(true);
    expect(r.isPro).toBe(false);
    expect(r.message).toMatch(/no active subscription/i);
  });

  it('reports a failure when the store throws', async () => {
    mockRestorePurchases.mockRejectedValue(new Error('Store unavailable'));

    const r = await restore('uid-1');

    expect(r.ok).toBe(false);
    expect(r.isPro).toBe(false);
    expect(r.message).toBe('Store unavailable');
  });

  it('refuses without a uid, and never reaches the store', async () => {
    const r = await restore(null);

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/sign in/i);
    expect(mockRestorePurchases).not.toHaveBeenCalled();
  });
});

describe('isProFromInfo', () => {
  it('is false for null, so an unknown entitlement never unlocks Pro', () => {
    expect(isProFromInfo(null)).toBe(false);
  });

  it('is true only when the pro entitlement is present', () => {
    expect(isProFromInfo(info(true))).toBe(true);
    expect(isProFromInfo(info(false))).toBe(false);
  });
});

describe('resetPurchases', () => {
  /* Logout has to drop the RevenueCat identity, or the next athlete on this
     device inherits the previous one's entitlement cache and gets Pro free. */
  it('logs out so the next athlete does not inherit Pro', async () => {
    mockPurchasePackage.mockResolvedValue({ customerInfo: info(true) });
    await purchase(PKG, 'uid-1'); // configures the SDK

    await resetPurchases();

    expect(mockLogOut).toHaveBeenCalledTimes(1);
  });

  it('is a no-op before the SDK was ever configured', async () => {
    await resetPurchases();
    expect(mockLogOut).not.toHaveBeenCalled();
  });

  it('does not throw when logOut rejects', async () => {
    mockPurchasePackage.mockResolvedValue({ customerInfo: info(true) });
    await purchase(PKG, 'uid-1');
    mockLogOut.mockRejectedValue(new Error('already anonymous'));

    await expect(resetPurchases()).resolves.toBeUndefined();
  });
});
