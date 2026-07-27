import type { Tensor } from 'react-native-fast-tflite';

/** The element type of a model input/output tensor (not re-exported by name). */
export type TensorDataType = Tensor['dataType'];

/**
 * Repacks the tightly-packed uint8 RGB buffer into whatever numeric type the
 * loaded model's input tensor declares.
 *
 * MoveNet SinglePose int8 took the bytes as-is (uint8). MoveNet MultiPose
 * Lightning is published only as float16/float, and its input tensor is `int32`
 * — the model does the 0..1 normalisation internally, so the pixel values still
 * range 0..255, they just have to arrive four bytes wide. Feeding uint8 to an
 * int32 input silently reads a quarter of the image as garbage rather than
 * erroring, so the width must match exactly.
 *
 * Returns the ArrayBuffer to hand to `runSync`. Runs in the frame worklet, so it
 * is a worklet and allocates the typed array inline rather than importing one.
 */
export function toModelInput(rgb: Uint8Array, dataType: TensorDataType): ArrayBuffer {
  'worklet';
  switch (dataType) {
    case 'uint8':
    case 'int8':
      // Same width — hand the packed bytes straight through.
      return rgb.buffer as ArrayBuffer;
    case 'int32': {
      const out = new Int32Array(rgb.length);
      for (let i = 0; i < rgb.length; i++) out[i] = rgb[i] as number;
      return out.buffer;
    }
    case 'float32': {
      // A float input still expects raw 0..255 unless the graph lacks its own
      // normalisation; MoveNet normalises internally, so pass the pixel value.
      const out = new Float32Array(rgb.length);
      for (let i = 0; i < rgb.length; i++) out[i] = rgb[i] as number;
      return out.buffer;
    }
    default:
      // Unknown input type — fall back to the raw bytes rather than crash; the
      // caller's output-size check will catch a genuine mismatch.
      return rgb.buffer as ArrayBuffer;
  }
}
