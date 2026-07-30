import { toModelInput } from '../modelInput';

describe('toModelInput', () => {
  it('passes uint8 through', () => {
    const rgb = new Uint8Array([1, 2, 3]);
    expect(toModelInput(rgb, 'uint8')).toBe(rgb.buffer);
  });

  it('widens to a fresh int32 buffer each call', () => {
    const a = new Uint8Array([10, 20, 30]);
    const b = new Uint8Array([11, 22, 33]);
    const first = toModelInput(a, 'int32');
    const second = toModelInput(b, 'int32');
    expect(first).not.toBe(second);
    expect(new Int32Array(first)[0]).toBe(10);
    expect(new Int32Array(second)[0]).toBe(11);
    expect(new Int32Array(second)[2]).toBe(33);
  });

  it('widens to float32', () => {
    const rgb = new Uint8Array([1, 2, 3]);
    const buf = toModelInput(rgb, 'float32');
    expect(new Float32Array(buf)[1]).toBe(2);
  });
});
