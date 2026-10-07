import { SOCIAL_PLATFORMS, inviteMessage, shareTarget } from '@/domain/socialShare';

const LINK = 'https://repchamp.web.app/@sam_1';

describe('socialShare', () => {
  it('includes the link in the invite message', () => {
    expect(inviteMessage(LINK)).toContain(LINK);
  });

  it('pre-fills X and Facebook with an encoded link', () => {
    for (const p of ['x', 'facebook'] as const) {
      const t = shareTarget(p, LINK);
      expect(t.kind).toBe('prefilled');
      if (t.kind === 'prefilled') {
        expect(t.url.startsWith('https://')).toBe(true);
        expect(t.url).toContain(encodeURIComponent(LINK));
      }
    }
  });

  it('does not repeat the link in the X text', () => {
    const t = shareTarget('x', LINK);
    if (t.kind !== 'prefilled') throw new Error('expected prefilled');
    const text = new URL(t.url).searchParams.get('text') ?? '';
    expect(text).not.toContain(LINK);
  });

  it('copies the message for Instagram and TikTok', () => {
    for (const p of ['instagram', 'tiktok'] as const) {
      const t = shareTarget(p, LINK);
      expect(t.kind).toBe('paste');
      if (t.kind === 'paste') {
        expect(t.message).toContain(LINK);
        expect(t.appUrl).toMatch(/^[a-z]+:\/\//);
      }
    }
  });

  it('uses custom text when given', () => {
    const t = shareTarget('instagram', LINK, 'I did 20 push-ups!');
    if (t.kind !== 'paste') throw new Error('expected paste');
    expect(t.message).toBe(`I did 20 push-ups! ${LINK}`);
    const x = shareTarget('x', LINK, 'I did 20 push-ups!');
    if (x.kind !== 'prefilled') throw new Error('expected prefilled');
    expect(new URL(x.url).searchParams.get('text')).toBe('I did 20 push-ups!');
  });

  it('covers every platform', () => {
    expect(SOCIAL_PLATFORMS).toHaveLength(4);
    for (const p of SOCIAL_PLATFORMS) expect(shareTarget(p, LINK)).toBeTruthy();
  });
});
