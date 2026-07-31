/**
 * Minimal base64 encoder for binary buffers.
 *
 * Hermes ships no `Buffer` and no `btoa`, and the usual
 * `String.fromCharCode(...bytes)` trick blows the call stack on anything
 * photo-sized, so this walks the buffer in 3-byte groups instead of spreading
 * it. Used to hand a captured camera frame to `<Image>` as a data URI, which
 * avoids writing a temp file per rep that nothing would ever reclaim.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      ALPHABET[(n >> 18) & 63]! +
      ALPHABET[(n >> 12) & 63]! +
      ALPHABET[(n >> 6) & 63]! +
      ALPHABET[n & 63]!;
  }

  // 1 or 2 trailing bytes are padded out to a full quartet with '='.
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}${
      ALPHABET[(n >> 6) & 63]
    }=`;
  }

  return out;
}
