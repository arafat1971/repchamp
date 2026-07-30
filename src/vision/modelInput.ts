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
 * Allocates a fresh widen buffer each call. The frame processor inlines this
 * inside `onFrame` (see `usePoseSession`) rather than capturing it as a nested
 * worklet — keeps Hermes unpack simple on the camera thread.
 */
export function toModelInput(rgb: Uint8Array, dataType: TensorDataType): ArrayBuffer {
  if (dataType === 'uint8' || dataType === 'int8') {
    return rgb.buffer as ArrayBuffer;
  }
  if (dataType === 'int32') {
    const out = new Int32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) {
      out[i] = rgb[i]!;
    }
    return out.buffer as ArrayBuffer;
  }
  if (dataType === 'float32') {
    const out = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) {
      out[i] = rgb[i]!;
    }
    return out.buffer as ArrayBuffer;
  }
  return rgb.buffer as ArrayBuffer;
}
