import NetInfo from '@react-native-community/netinfo';

import { startConnectivityWatch, useConnectivityStore } from '../connectivityStore';

type Listener = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;

let push: Listener;
beforeEach(() => {
  useConnectivityStore.setState({ offline: false, reconnects: 0 });
  jest.spyOn(NetInfo, 'addEventListener').mockImplementation(((cb: Listener) => {
    push = cb;
    return () => {};
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('startConnectivityWatch', () => {
  it('marks the device offline and back, bumping reconnects once per recovery', () => {
    const onReconnect = jest.fn();
    startConnectivityWatch(onReconnect);

    push({ isConnected: false, isInternetReachable: false });
    expect(useConnectivityStore.getState().offline).toBe(true);
    expect(onReconnect).not.toHaveBeenCalled();

    push({ isConnected: true, isInternetReachable: true });
    expect(useConnectivityStore.getState()).toMatchObject({ offline: false, reconnects: 1 });
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('does not treat the first online report as a reconnect', () => {
    const onReconnect = jest.fn();
    startConnectivityWatch(onReconnect);
    push({ isConnected: true, isInternetReachable: true });
    push({ isConnected: true, isInternetReachable: true });
    expect(onReconnect).not.toHaveBeenCalled();
    expect(useConnectivityStore.getState().reconnects).toBe(0);
  });

  it('ignores an unknown state rather than flashing offline', () => {
    startConnectivityWatch();
    push({ isConnected: null, isInternetReachable: null });
    expect(useConnectivityStore.getState().offline).toBe(false);
  });
});
