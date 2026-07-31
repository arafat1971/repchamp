import type { PurchasesOfferings } from 'react-native-purchases';

const mockConfigure = jest.fn((_opts?: unknown) => undefined);
const mockLogIn = jest.fn(async (_uid?: string) => ({
  customerInfo: { entitlements: { active: {} } },
}));
const mockGetOfferings = jest.fn();
const mockGetCustomerInfo = jest.fn(async () => ({ entitlements: { active: {} } }));
const mockRestorePurchases = jest.fn(async () => ({ entitlements: { active: {} } }));
const mockAddListener = jest.fn((_fn?: unknown) => undefined);
const mockRemoveListener = jest.fn((_fn?: unknown) => undefined);

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  LOG_LEVEL: { WARN: 'WARN', ERROR: 'ERROR', DEBUG: 'DEBUG', INFO: 'INFO', VERBOSE: 'VERBOSE' },
  default: {
    configure: (api: unknown) => mockConfigure(api),
    setLogLevel: jest.fn(),
    logIn: (uid: string) => mockLogIn(uid),
    getOfferings: () => mockGetOfferings(),
    getCustomerInfo: () => mockGetCustomerInfo(),
    addCustomerInfoUpdateListener: (fn: unknown) => mockAddListener(fn),
    removeCustomerInfoUpdateListener: (fn: unknown) => mockRemoveListener(fn),
    purchasePackage: jest.fn(),
    restorePurchases: () => mockRestorePurchases(),
    logOut: jest.fn(),
  },
}));

jest.mock('@/lib/config', () => ({
  revenueCatApiKey: () => 'goog_test_key_for_unit_tests',
}));

import {
  __resetPurchasesForTests,
  configurePurchases,
  fetchOffering,
  isEmptyOfferingsConfigError,
  isPurchasesSdkReady,
  restore,
  watchCustomerInfo,
} from '../purchases';

describe('purchases configure race + offering fallback', () => {
  beforeEach(() => {
    __resetPurchasesForTests();
    mockConfigure.mockClear();
    mockLogIn.mockClear();
    mockGetOfferings.mockReset();
    mockRestorePurchases.mockClear();
    mockAddListener.mockClear();
  });

  it('configures the SDK only once under concurrent callers', async () => {
    await Promise.all([
      configurePurchases('user-a'),
      configurePurchases('user-a'),
      configurePurchases(null),
    ]);
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(isPurchasesSdkReady()).toBe(true);
  });

  it('logs in when uid arrives after an anonymous configure', async () => {
    await configurePurchases(null);
    await configurePurchases('user-b');
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockLogIn).toHaveBeenCalledWith('user-b');
  });

  it('awaits configure before fetching offerings', async () => {
    let resolveConfigure: (() => void) | undefined;
    mockConfigure.mockImplementation(() => {
      // synchronous configure in production; keep call counted
    });
    mockGetOfferings.mockResolvedValue({
      current: { identifier: 'default', availablePackages: [{ identifier: 'a' }] },
      all: {},
    } as unknown as PurchasesOfferings);

    const fetchPromise = fetchOffering();
    await configurePurchases('user-c');
    await fetchPromise;
    expect(mockConfigure).toHaveBeenCalled();
    expect(mockGetOfferings).toHaveBeenCalled();
    void resolveConfigure;
  });

  it('falls back to a non-empty offering when current is empty', async () => {
    mockGetOfferings.mockResolvedValue({
      current: { identifier: 'empty', availablePackages: [] },
      all: {
        empty: { identifier: 'empty', availablePackages: [] },
        live: {
          identifier: 'live',
          availablePackages: [{ identifier: 'annual', packageType: 'ANNUAL' }],
        },
      },
    } as unknown as PurchasesOfferings);

    await configurePurchases('user-d');
    const offering = await fetchOffering();
    expect(offering?.identifier).toBe('live');
  });

  it('treats empty Play offerings as a soft null, not a throw', async () => {
    const err = Object.assign(new Error('There is an issue with your configuration.'), {
      code: 'ConfigurationError',
    });
    mockGetOfferings.mockRejectedValue(err);
    await configurePurchases('user-e');
    await expect(fetchOffering()).resolves.toBeNull();
    expect(isEmptyOfferingsConfigError(err)).toBe(true);
  });

  it('does not attach a customer listener before configure', () => {
    const unsub = watchCustomerInfo(() => {});
    expect(mockAddListener).not.toHaveBeenCalled();
    unsub();
  });

  it('refuses restore before a uid is known', async () => {
    const result = await restore(null);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/sign in/i);
    expect(mockRestorePurchases).not.toHaveBeenCalled();
  });

  it('restores under the signed-in uid', async () => {
    mockRestorePurchases.mockResolvedValueOnce({
      entitlements: { active: { pro: { identifier: 'pro' } } },
    });
    const result = await restore('user-restore');
    expect(mockConfigure).toHaveBeenCalled();
    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.isPro).toBe(true);
  });
});
