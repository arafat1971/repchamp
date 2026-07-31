/**
 * Base64 encoder — verified against Node's own Buffer implementation.
 *
 * The padding branches are the easy ones to get subtly wrong (an transposed
 * shift produces output that still *looks* like base64), so they are checked
 * against a known-good encoder rather than hand-written expectations.
 */

import { arrayBufferToBase64 } from '../base64';

function bufferOf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/** Node's reference encoding for the same bytes. */
function reference(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64');
}

describe('arrayBufferToBase64', () => {
  it('encodes an empty buffer as an empty string', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('encodes an exact multiple of three with no padding', () => {
    const bytes = [0x4d, 0x61, 0x6e]; // "Man"
    expect(arrayBufferToBase64(bufferOf(...bytes))).toBe('TWFu');
    expect(arrayBufferToBase64(bufferOf(...bytes))).toBe(reference(bytes));
  });

  it('pads a single trailing byte with two = signs', () => {
    const bytes = [0x4d];
    expect(arrayBufferToBase64(bufferOf(...bytes))).toBe(reference(bytes));
    expect(arrayBufferToBase64(bufferOf(...bytes))).toMatch(/==$/);
  });

  it('pads two trailing bytes with one = sign', () => {
    const bytes = [0x4d, 0x61];
    expect(arrayBufferToBase64(bufferOf(...bytes))).toBe(reference(bytes));
    expect(arrayBufferToBase64(bufferOf(...bytes))).toMatch(/[^=]=$/);
  });

  it('round-trips every byte value', () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    expect(arrayBufferToBase64(bufferOf(...bytes))).toBe(reference(bytes));
  });

  it('matches the reference at every length across a padding cycle', () => {
    // Covers all three remainders (0, 1, 2) repeatedly.
    for (let len = 0; len <= 32; len++) {
      const bytes = Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff);
      expect(arrayBufferToBase64(bufferOf(...bytes))).toBe(reference(bytes));
    }
  });

  it('handles a photo-sized buffer without blowing the call stack', () => {
    // The reason this encoder exists: String.fromCharCode(...bytes) throws
    // RangeError well below this size. Note the buffer is built directly
    // rather than spread through a helper — spreading 300k arguments would
    // overflow the stack in the *test* before reaching the encoder.
    const big = new Uint8Array(300_000);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    expect(arrayBufferToBase64(big.buffer)).toBe(Buffer.from(big).toString('base64'));
  });
});
