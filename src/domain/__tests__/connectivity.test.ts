import { isOffline, loadFailureMessage } from '../connectivity';

describe('isOffline', () => {
  it('is offline when the radio is down', () => {
    expect(isOffline({ isConnected: false, isInternetReachable: false })).toBe(true);
    expect(isOffline({ isConnected: false })).toBe(true);
  });

  it('is offline on wifi with no uplink', () => {
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('is online when connected and reachable', () => {
    expect(isOffline({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('does not call an unknown state offline — cold start must not flash a banner', () => {
    expect(isOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(isOffline({ isConnected: true, isInternetReachable: null })).toBe(false);
    expect(isOffline({ isConnected: true })).toBe(false);
  });
});

describe('loadFailureMessage', () => {
  it('names the cause while offline', () => {
    expect(loadFailureMessage(true, 'generic')).toMatch(/offline/i);
  });

  it('keeps the screen’s own wording when online', () => {
    expect(loadFailureMessage(false, 'generic')).toBe('generic');
  });
});
