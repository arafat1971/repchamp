import { requireOptionalNativeModule } from 'expo';

/**
 * Encodes JPEG frames into an H.264 MP4, one call per frame, timed at exactly
 * `fps` regardless of how fast the frames arrive.
 *
 * One clip at a time: `start` cancels any clip still open.
 */
export interface RaceClipEncoderModule {
  /** Opens a new MP4 in the cache directory. */
  start(width: number, height: number, fps: number, bitrate: number): Promise<void>;
  /** Appends one frame: a base64 JPEG exactly `width` x `height`. */
  appendFrame(base64Jpeg: string): Promise<void>;
  /** Closes the file and returns its `file://` uri. */
  finish(): Promise<string>;
  /** Drops the open clip, if any, and deletes its file. */
  cancel(): Promise<void>;
}

/** Null on a binary built before this module existed — callers fall back to the image card. */
export const RaceClipEncoder = requireOptionalNativeModule<RaceClipEncoderModule>('RaceClipEncoder');
