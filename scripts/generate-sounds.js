#!/usr/bin/env node
/**
 * Generates the short UI sounds used during a set.
 *
 * These are synthesised rather than sourced so the repo stays free of binary
 * audio assets with unclear licensing, and so the tones can be re-tuned by
 * editing numbers here instead of opening an audio editor.
 *
 *   node scripts/generate-sounds.js
 */
const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 44_100;

/**
 * Renders a mono 16-bit PCM WAV from a list of tone segments.
 * Each segment is `{ frequency, durationMs, gain }`.
 */
function renderWav(segments) {
  const totalSamples = segments.reduce(
    (acc, s) => acc + Math.round((s.durationMs / 1000) * SAMPLE_RATE),
    0,
  );
  const data = Buffer.alloc(totalSamples * 2);

  let offset = 0;
  for (const segment of segments) {
    const sampleCount = Math.round((segment.durationMs / 1000) * SAMPLE_RATE);
    for (let i = 0; i < sampleCount; i++) {
      const t = i / SAMPLE_RATE;
      // Exponential decay envelope, plus a 3ms fade-in to avoid a click.
      const attack = Math.min(1, i / (0.003 * SAMPLE_RATE));
      const decay = Math.exp(-t * segment.decay);
      const value =
        Math.sin(2 * Math.PI * segment.frequency * t) * segment.gain * attack * decay;
      data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), offset);
      offset += 2;
    }
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

const SOUNDS = {
  // Counted rep: a single bright blip, short enough to keep up with fast sets.
  'rep.wav': [{ frequency: 880, durationMs: 130, gain: 0.35, decay: 22 }],
  // Countdown tick, then a higher "GO".
  'count.wav': [{ frequency: 660, durationMs: 140, gain: 0.32, decay: 18 }],
  'go.wav': [{ frequency: 1046, durationMs: 260, gain: 0.38, decay: 9 }],
  // Rising third on a win, falling third on a loss.
  'win.wav': [
    { frequency: 784, durationMs: 130, gain: 0.34, decay: 12 },
    { frequency: 988, durationMs: 130, gain: 0.34, decay: 12 },
    { frequency: 1319, durationMs: 320, gain: 0.36, decay: 7 },
  ],
  'lose.wav': [
    { frequency: 494, durationMs: 160, gain: 0.3, decay: 10 },
    { frequency: 392, durationMs: 340, gain: 0.3, decay: 7 },
  ],
};

const outDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });

for (const [name, segments] of Object.entries(SOUNDS)) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, renderWav(segments));
  console.log(`✓ ${name} (${fs.statSync(file).size} bytes)`);
}
