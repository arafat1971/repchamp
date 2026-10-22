import type { PurchasesOffering, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

import { currencySymbol, pickCurrentOffering, sortPackagesForPaywall } from '@/domain/subscriptionOffering';

function pkg(type: string, id: string): PurchasesPackage {
  return { identifier: id, packageType: type } as PurchasesPackage;
}

function offering(id: string, packages: PurchasesPackage[]): PurchasesOffering {
  return { identifier: id, availablePackages: packages } as PurchasesOffering;
}

describe('pickCurrentOffering', () => {
  it('uses current when it has packages', () => {
    const current = offering('default', [pkg('ANNUAL', 'a')]);
    const all = { default: current, alt: offering('alt', [pkg('MONTHLY', 'm')]) };
    const result = pickCurrentOffering({ current, all } as PurchasesOfferings);
    expect(result?.identifier).toBe('default');
  });

  it('falls back to another offering when current is empty', () => {
    const current = offering('default', []);
    const alt = offering('alt', [pkg('MONTHLY', 'm')]);
    const result = pickCurrentOffering({
      current,
      all: { default: current, alt },
    } as PurchasesOfferings);
    expect(result?.identifier).toBe('alt');
  });

  it('falls back when current is null', () => {
    const alt = offering('alt', [pkg('ANNUAL', 'a')]);
    const result = pickCurrentOffering({
      current: null,
      all: { alt },
    } as PurchasesOfferings);
    expect(result?.identifier).toBe('alt');
  });
});

describe('sortPackagesForPaywall', () => {
  it('puts annual before monthly', () => {
    const sorted = sortPackagesForPaywall([pkg('MONTHLY', 'm'), pkg('ANNUAL', 'a')]);
    expect(sorted.map((p) => p.identifier)).toEqual(['a', 'm']);
  });
});

describe('currencySymbol', () => {
  it('keeps a symbol tight and a letter code spaced', () => {
    expect(currencySymbol('$4.99')).toBe('$');
    expect(currencySymbol('£24.99')).toBe('£');
    expect(currencySymbol('BDT 700.00')).toBe('BDT ');
    expect(currencySymbol('7,100.00 BDT')).toBe('BDT ');
  });
});
