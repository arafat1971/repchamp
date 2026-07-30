/**
 * Tests for the auth service — the thin wrapper over React Native Firebase Auth
 * and Google Sign-In.
 *
 * `@react-native-firebase/auth` is faked with a stateful mock: a mutable
 * `currentUser`, an `onAuthStateChanged` that emits and records its listener,
 * and provider-credential factories. Google Sign-In is faked so the id-token
 * handshake and its cancel codes are exercised without native modules. The key
 * behaviours: the unconfigured path always yields the stable LOCAL_USER, and an
 * anonymous account is *linked* (not replaced) when it upgrades, preserving the
 * uid.
 *
 * Jest hoists jest.mock() above imports, so every shared name a factory touches
 * is `mock`-prefixed (the only out-of-scope access the hoist guard allows).
 */

/* ------------------------------------------------------------------ */

import {
  ensureSignedIn,
  isGoogleCancel,
  LOCAL_USER,
  onAuthChange,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
} from '../auth';

const mockState = { configured: true };

/** A mutable Firebase auth user, with the linkWithCredential the upgrade uses. */
function mockUser(over: Partial<Record<string, unknown>> = {}) {
  const u: Record<string, unknown> = {
    uid: 'fb-uid',
    isAnonymous: false,
    email: null,
    displayName: null,
    photoURL: null,
    ...over,
  };
  u.linkWithCredential = jest.fn(async () => ({
    user: { ...u, isAnonymous: false },
  }));
  return u;
}

const mockAuthState = {
  currentUser: null as Record<string, unknown> | null,
  listener: null as ((u: unknown) => void) | null,
  signInAnonymously: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithCredential: jest.fn(),
  signOut: jest.fn(async () => {}),
};

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

jest.mock('@react-native-firebase/auth', () => {
  const fn = () => ({
    get currentUser() {
      return mockAuthState.currentUser;
    },
    onAuthStateChanged(cb: (u: unknown) => void) {
      mockAuthState.listener = cb;
      cb(mockAuthState.currentUser);
      return () => {
        mockAuthState.listener = null;
      };
    },
    signInAnonymously: mockAuthState.signInAnonymously,
    signInWithEmailAndPassword: mockAuthState.signInWithEmailAndPassword,
    createUserWithEmailAndPassword: mockAuthState.createUserWithEmailAndPassword,
    signInWithCredential: mockAuthState.signInWithCredential,
    signOut: mockAuthState.signOut,
  });
  // Provider credential factories. They carry no uid of their own, so a link
  // onto an anonymous account keeps that account's existing uid.
  (fn as unknown as Record<string, unknown>).EmailAuthProvider = {
    credential: (email: string) => ({ provider: 'email', email }),
  };
  (fn as unknown as Record<string, unknown>).GoogleAuthProvider = {
    credential: (idToken: string) => ({ provider: 'google', idToken }),
  };
  return { __esModule: true, default: fn };
});

const mockGoogle = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(),
  signOut: jest.fn(async () => {}),
};

// `GoogleSignin` must be exposed via a getter, not a plain property. The
// real package re-exports it from a submodule, and jest-expo's ESM interop
// rebinds such re-exported names to getters — a plain data property on the
// factory gets shadowed to `undefined` at the named-import site, while a
// getter survives. (`statusCodes` resolves fine either way.)
jest.mock('@react-native-google-signin/google-signin', () => ({
  __esModule: true,
  get GoogleSignin() {
    return mockGoogle;
  },
  statusCodes: { SIGN_IN_CANCELLED: 'CANCELLED', IN_PROGRESS: 'IN_PROGRESS' },
}));

beforeEach(() => {
  mockState.configured = true;
  mockAuthState.currentUser = null;
  mockAuthState.listener = null;
  // Reset only call history — clearAllMocks() would also wipe the default
  // implementations these mocks were created with (e.g. the async no-op
  // signOut / hasPlayServices), breaking every test that relies on them.
  for (const m of [
    mockAuthState.signInAnonymously,
    mockAuthState.signInWithEmailAndPassword,
    mockAuthState.createUserWithEmailAndPassword,
    mockAuthState.signInWithCredential,
    mockAuthState.signOut,
    mockGoogle.configure,
    mockGoogle.hasPlayServices,
    mockGoogle.signIn,
    mockGoogle.signOut,
  ]) {
    m.mockClear();
  }
  // These two carry default resolved values individual tests may override.
  mockGoogle.hasPlayServices.mockResolvedValue(true);
  mockGoogle.signOut.mockResolvedValue(undefined);
});

describe('unconfigured fallback', () => {
  beforeEach(() => {
    mockState.configured = false;
  });

  it('onAuthChange fires once with the local user', () => {
    const seen: unknown[] = [];
    const unsub = onAuthChange((u) => seen.push(u));
    expect(seen).toEqual([LOCAL_USER]);
    expect(typeof unsub).toBe('function');
  });

  it('ensureSignedIn resolves to the local user without touching Firebase', async () => {
    expect(await ensureSignedIn()).toEqual(LOCAL_USER);
    expect(mockAuthState.signInAnonymously).not.toHaveBeenCalled();
  });

  it('email and Google entry points resolve to the local user', async () => {
    expect(await signInWithEmail('a@b.co', 'pw')).toEqual(LOCAL_USER);
    expect(await signUpWithEmail('a@b.co', 'pw')).toEqual(LOCAL_USER);
    expect(await signInWithGoogle('web-client')).toEqual(LOCAL_USER);
  });

  it('signOut is a no-op', async () => {
    await signOut();
    expect(mockGoogle.signOut).not.toHaveBeenCalled();
  });
});

describe('onAuthChange (live)', () => {
  it('maps the Firebase user through toAuthUser', () => {
    mockAuthState.currentUser = mockUser({ uid: 'x', email: 'x@y.z', isAnonymous: false });
    const seen: unknown[] = [];
    onAuthChange((u) => seen.push(u));
    expect(seen[0]).toEqual({
      uid: 'x',
      isAnonymous: false,
      email: 'x@y.z',
      displayName: null,
      photoURL: null,
    });
  });

  it('emits null when signed out', () => {
    mockAuthState.currentUser = null;
    const seen: unknown[] = [];
    onAuthChange((u) => seen.push(u));
    expect(seen[0]).toBeNull();
  });
});

describe('ensureSignedIn (live)', () => {
  it('returns the existing user without creating a new one', async () => {
    mockAuthState.currentUser = mockUser({ uid: 'have', isAnonymous: true });
    const u = await ensureSignedIn();
    expect(u.uid).toBe('have');
    expect(mockAuthState.signInAnonymously).not.toHaveBeenCalled();
  });

  it('creates an anonymous account when nobody is signed in', async () => {
    mockAuthState.signInAnonymously.mockResolvedValue({
      user: mockUser({ uid: 'anon', isAnonymous: true }),
    });
    const u = await ensureSignedIn();
    expect(mockAuthState.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(u).toEqual({
      uid: 'anon',
      isAnonymous: true,
      email: null,
      displayName: null,
      photoURL: null,
    });
  });
});

describe('signInWithEmail', () => {
  it('trims the email and returns the mapped user', async () => {
    mockAuthState.signInWithEmailAndPassword.mockResolvedValue({
      user: mockUser({ uid: 'e', email: 'a@b.co' }),
    });
    const u = await signInWithEmail('  a@b.co  ', 'pw');
    expect(mockAuthState.signInWithEmailAndPassword).toHaveBeenCalledWith('a@b.co', 'pw');
    expect(u.email).toBe('a@b.co');
  });
});

describe('signUpWithEmail', () => {
  it('links onto an anonymous account, preserving the uid', async () => {
    const anon = mockUser({ uid: 'keep-uid', isAnonymous: true });
    mockAuthState.currentUser = anon;
    const u = await signUpWithEmail('a@b.co', 'pw');
    expect(anon.linkWithCredential).toHaveBeenCalledTimes(1);
    expect(mockAuthState.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(u.uid).toBe('keep-uid');
    expect(u.isAnonymous).toBe(false);
  });

  it('creates a fresh account when not anonymous', async () => {
    mockAuthState.currentUser = null;
    mockAuthState.createUserWithEmailAndPassword.mockResolvedValue({
      user: mockUser({ uid: 'new', email: 'a@b.co' }),
    });
    const u = await signUpWithEmail('a@b.co', 'pw');
    expect(mockAuthState.createUserWithEmailAndPassword).toHaveBeenCalledWith('a@b.co', 'pw');
    expect(u.uid).toBe('new');
  });
});

describe('signInWithGoogle', () => {
  it('runs the play-services + id-token handshake and links when anonymous', async () => {
    const anon = mockUser({ uid: 'keep-uid', isAnonymous: true });
    mockAuthState.currentUser = anon;
    mockGoogle.signIn.mockResolvedValue({ data: { idToken: 'tok' } });
    const u = await signInWithGoogle('web-client');
    expect(mockGoogle.configure).toHaveBeenCalledWith({ webClientId: 'web-client' });
    expect(mockGoogle.hasPlayServices).toHaveBeenCalled();
    expect(anon.linkWithCredential).toHaveBeenCalledTimes(1);
    expect(mockAuthState.signInWithCredential).not.toHaveBeenCalled();
    expect(u.uid).toBe('keep-uid');
  });

  it('signs in with the credential when not anonymous', async () => {
    mockAuthState.currentUser = null;
    mockGoogle.signIn.mockResolvedValue({ data: { idToken: 'tok' } });
    mockAuthState.signInWithCredential.mockResolvedValue({
      user: mockUser({ uid: 'g', email: 'g@x.co' }),
    });
    const u = await signInWithGoogle('web-client');
    expect(mockAuthState.signInWithCredential).toHaveBeenCalledTimes(1);
    expect(u.uid).toBe('g');
  });

  it('throws when Google returns no id token', async () => {
    mockGoogle.signIn.mockResolvedValue({ data: {} });
    await expect(signInWithGoogle('web-client')).rejects.toThrow(/no ID token/i);
  });
});

describe('signOut', () => {
  it('signs out of Google and Firebase', async () => {
    await signOut();
    expect(mockGoogle.signOut).toHaveBeenCalledTimes(1);
    expect(mockAuthState.signOut).toHaveBeenCalledTimes(1);
  });

  it('still signs out of Firebase when Google sign-out throws', async () => {
    mockGoogle.signOut.mockRejectedValue(new Error('not signed in with google'));
    await signOut();
    expect(mockAuthState.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('isGoogleCancel', () => {
  it('recognises the cancel and in-progress codes', () => {
    expect(isGoogleCancel({ code: 'CANCELLED' })).toBe(true);
    expect(isGoogleCancel({ code: 'IN_PROGRESS' })).toBe(true);
  });

  it('is false for other errors and non-error values', () => {
    expect(isGoogleCancel({ code: 'NETWORK_ERROR' })).toBe(false);
    expect(isGoogleCancel(new Error('boom'))).toBe(false);
    expect(isGoogleCancel(null)).toBe(false);
  });
});
