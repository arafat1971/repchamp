import { previewCta, previewLine } from '../togetherPreview';

describe('togetherPreview', () => {
  it('invites a first tap, then reacts to progress, then celebrates a full day', () => {
    expect(previewLine(0, 6)).toMatch(/Tap a habit/);
    expect(previewLine(1, 6)).toMatch(/seconds/);
    expect(previewLine(2, 6)).toMatch(/add up/);
    expect(previewLine(4, 6)).toMatch(/halfway/);
    expect(previewLine(6, 6)).toMatch(/perfect day/);
  });

  it('never claims a partner already saw anything', () => {
    for (let n = 0; n <= 6; n += 1) expect(previewLine(n, 6)).not.toMatch(/ just /i);
  });

  it('asks for the commitment only after a first tick', () => {
    expect(previewCta(0)).toBe('Try one first');
    expect(previewCta(2)).toBe('Start our streak');
  });
});
