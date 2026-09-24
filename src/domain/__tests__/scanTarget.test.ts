import { classifyScan, friendInviteDeepLink, landingHref } from '../scanTarget';
import { inviteDeepLink, inviteLink } from '../couple';
import { duelInviteDeepLink, duelInviteLink } from '../duelInvite';
import { friendInviteLink } from '../../lib/urls';

const DUEL_ID = 'aB3xY9aB3xY9aB3xY9aB';

describe('classifyScan — every code the app prints', () => {
  it('reads both couple links', () => {
    expect(classifyScan(inviteDeepLink('RLXW3Q'))).toEqual({ kind: 'couple', code: 'RLXW3Q' });
    expect(classifyScan(inviteLink('RLXW3Q'))).toEqual({ kind: 'couple', code: 'RLXW3Q' });
  });

  it('reads both duel links', () => {
    expect(classifyScan(duelInviteDeepLink(DUEL_ID))).toEqual({ kind: 'duel', id: DUEL_ID });
    expect(classifyScan(duelInviteLink(DUEL_ID))).toEqual({ kind: 'duel', id: DUEL_ID });
  });

  it('reads both friend links', () => {
    expect(classifyScan(friendInviteDeepLink('Sam_1'))).toEqual({ kind: 'friend', username: 'sam_1' });
    expect(classifyScan(friendInviteLink('sam_1'))).toEqual({ kind: 'friend', username: 'sam_1' });
  });
});

describe('classifyScan — bare values', () => {
  it('reads a pair code, a duel id and an @handle', () => {
    expect(classifyScan(' rlxw3q ')).toEqual({ kind: 'couple', code: 'RLXW3Q' });
    expect(classifyScan(DUEL_ID)).toEqual({ kind: 'duel', id: DUEL_ID });
    expect(classifyScan('@sam_1')).toEqual({ kind: 'friend', username: 'sam_1' });
  });
});

describe('classifyScan — the path decides, not the first parser that matches', () => {
  /* `parseInviteCode` accepts any `?code=`; a duel link carrying one must
     still be a duel. */
  it('does not read a duel link as a couple invite', () => {
    expect(classifyScan(`repchamp://duel/join?id=${DUEL_ID}&code=RLXW3Q`)).toEqual({
      kind: 'duel',
      id: DUEL_ID,
    });
  });

  it('rejects our link with a broken value rather than guessing', () => {
    expect(classifyScan('repchamp://duel/join?id=short')).toBeNull();
    expect(classifyScan('repchamp://couple/join?code=XX')).toBeNull();
    expect(classifyScan('repchamp://modal/add-friend?u=a')).toBeNull();
    expect(classifyScan('repchamp://modal/add-friend?u=%E0%A4%A')).toBeNull();
  });
});

describe('classifyScan — everything else', () => {
  it('ignores other people’s codes', () => {
    expect(classifyScan('')).toBeNull();
    expect(classifyScan('https://example.com/menu?code=ABC234')).toBeNull();
    expect(classifyScan('WIFI:S:home;T:WPA;P:secret;;')).toBeNull();
    expect(classifyScan('hello world')).toBeNull();
    expect(classifyScan('https://medium.com/@sam_1')).toBeNull();
    expect(classifyScan(`https://evil.example/duel/join?id=${DUEL_ID}`)).toBeNull();
  });

  it('needs an @ to read a bare username', () => {
    expect(classifyScan('sam_12345')).toBeNull();
  });
});

describe('landingHref', () => {
  it('sends each kind to the route that owns its flow', () => {
    expect(landingHref({ kind: 'couple', code: 'RLXW3Q' })).toEqual({
      pathname: '/couple/join',
      params: { code: 'RLXW3Q' },
    });
    expect(landingHref({ kind: 'duel', id: DUEL_ID })).toEqual({
      pathname: '/duel/join',
      params: { id: DUEL_ID },
    });
    expect(landingHref({ kind: 'friend', username: 'sam_1' })).toEqual({
      pathname: '/modal/add-friend',
      params: { u: 'sam_1' },
    });
  });
});
