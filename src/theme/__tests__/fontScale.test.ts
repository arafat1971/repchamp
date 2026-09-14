import {
  MAX_FONT_SCALE,
  MIN_ALLOWED_CAP,
  maxFontScale,
  reservedControlHeight,
  type TextRole,
} from '../fontScale';

const ROLES: readonly TextRole[] = ['body', 'heading', 'control', 'display'];

describe('MAX_FONT_SCALE', () => {
  /* The whole point of a cap is to stop the far tail, not to refuse the
     ordinary large-text settings people actually use. A cap under 1.3 would
     start denying those, which would make this module the accessibility
     problem rather than the fix. */
  it('never caps below the ordinary large-text range', () => {
    for (const role of ROLES) {
      expect(MAX_FONT_SCALE[role]).toBeGreaterThanOrEqual(MIN_ALLOWED_CAP);
    }
  });

  /* Graded by failure mode: text that reflows and scrolls can afford to grow;
     a label across a fixed-width control cannot. If this ordering is ever
     inverted, control labels get the most room to wrap and clip — exactly the
     bug this module exists to prevent. */
  it('lets text that reflows grow further than text trapped in a shape', () => {
    expect(MAX_FONT_SCALE.body).toBeGreaterThan(MAX_FONT_SCALE.heading);
    expect(MAX_FONT_SCALE.heading).toBeGreaterThan(MAX_FONT_SCALE.control);
    expect(MAX_FONT_SCALE.control).toBeGreaterThan(MAX_FONT_SCALE.display);
  });

  it('caps every role it defines', () => {
    for (const role of ROLES) {
      expect(Number.isFinite(maxFontScale(role))).toBe(true);
    }
  });
});

describe('reservedControlHeight', () => {
  /* The adoption guarantee. Today every athlete is at scale 1, so shipping
     this must not move a single pixel — if it did, "no visual change" would be
     a claim the diff contradicts. */
  it('leaves the designed height untouched at normal text size', () => {
    expect(reservedControlHeight(60, 1)).toBe(60);
    expect(reservedControlHeight(52, 1)).toBe(52);
    expect(reservedControlHeight(44, 1)).toBe(44);
  });

  /* A control shrinking below its design height would break the 44pt minimum
     touch target, so scales under 1 are ignored rather than applied. */
  it('never shrinks a control below its designed height', () => {
    expect(reservedControlHeight(60, 0.85)).toBe(60);
    expect(reservedControlHeight(44, 0.5)).toBe(44);
  });

  it('grows the box once the label needs the room', () => {
    expect(reservedControlHeight(60, 1.2)).toBe(72);
    expect(reservedControlHeight(50, 1.2)).toBe(60);
  });

  /* The box and the text must stop growing together. If the box kept growing
     past the text's cap, large-text users would get a very tall button
     wrapped around text that had already stopped scaling — space taken from
     the rest of the screen for nothing. */
  it('stops growing exactly where the text it wraps stops', () => {
    const beyondCap = 3.1; // iOS's largest accessibility size.
    expect(reservedControlHeight(60, beyondCap)).toBe(
      Math.round(60 * MAX_FONT_SCALE.control),
    );
    // Past the cap, more system scale buys no more height.
    expect(reservedControlHeight(60, beyondCap)).toBe(reservedControlHeight(60, 10));
  });

  it('honours the role it is asked to reserve for', () => {
    expect(reservedControlHeight(100, 3, 'body')).toBe(100 * MAX_FONT_SCALE.body);
    expect(reservedControlHeight(100, 3, 'display')).toBe(100 * MAX_FONT_SCALE.display);
  });

  /* `useWindowDimensions().fontScale` is a native-reported value. A missing or
     malformed reading must leave the control at its designed size rather than
     collapsing it to NaN — a NaN height silently drops the control's box. */
  it('falls back to the designed height on a nonsense reading', () => {
    expect(reservedControlHeight(60, Number.NaN)).toBe(60);
    expect(reservedControlHeight(60, Number.POSITIVE_INFINITY)).toBe(60);
  });

  it('returns a whole number of pixels', () => {
    for (const scale of [1.1, 1.25, 1.37, 1.9]) {
      expect(Number.isInteger(reservedControlHeight(58, scale))).toBe(true);
    }
  });
});
