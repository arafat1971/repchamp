import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import type { ClipScene } from '@/lib/raceClip/drawFrame';
import { RaceClipCancelled, raceClipSupported, renderRaceClip } from '@/lib/raceClip/renderRaceClip';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

type Status = { kind: 'idle' } | { kind: 'making'; progress: number } | { kind: 'shared' } | { kind: 'failed' };

/**
 * "Share race video": renders the finished race as a 9:16 MP4 and opens the
 * share sheet with it, the caption already on the clipboard.
 *
 * Renders nothing on a binary built before the encoder module, so a JS-only
 * update never shows a button that cannot work.
 */
export function RaceVideoButton({
  buildScene,
  caption,
  onFallback,
}: {
  /** Read at tap time, so it sees the settled score. */
  buildScene: () => ClipScene;
  caption: () => string;
  /** Shares the still image card instead, when the video cannot be made. */
  onFallback: () => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const signal = useRef({ cancelled: false });

  useEffect(() => {
    const current = signal.current;
    return () => {
      current.cancelled = true;
    };
  }, []);

  if (!raceClipSupported()) return null;

  const making = status.kind === 'making';

  const share = async () => {
    if (making) return;
    track('share_opened', { kind: 'race-video' });
    setStatus({ kind: 'making', progress: 0 });
    try {
      const uri = await renderRaceClip(buildScene(), {
        signal: signal.current,
        onProgress: (progress) => setStatus({ kind: 'making', progress }),
      });
      // Share sheets drop text that rides along with a file, so the caption
      // goes on the clipboard, ready to paste into the post.
      await Clipboard.setStringAsync(caption()).catch(() => undefined);
      setStatus({ kind: 'shared' });
      await Sharing.shareAsync(uri, {
        mimeType: 'video/mp4',
        UTI: 'public.mpeg-4',
        dialogTitle: 'Share your race',
      });
    } catch (error) {
      if (error instanceof RaceClipCancelled) return;
      captureError(error);
      setStatus({ kind: 'failed' });
      onFallback();
    }
  };

  const label = making
    ? `Making your video… ${Math.round(status.progress * 100)}%`
    : status.kind === 'failed'
      ? 'Video failed · try again'
      : 'Share race video';

  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={share}
        disabled={making}
        accessibilityRole="button"
        accessibilityLabel="Share race video"
        accessibilityState={{ busy: making }}
        style={styles.button}
      >
        {making ? (
          <View style={[styles.progress, { width: `${Math.round(status.progress * 100)}%` }]} />
        ) : null}
        <Text style={font('extrabold', 16, { color: palette.white })}>{label}</Text>
      </PressableScale>
      <Text style={styles.hint}>
        {status.kind === 'shared'
          ? 'Caption copied. Paste it into your post.'
          : 'A 9:16 replay for TikTok, Reels and Stories'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center', marginTop: 12, marginBottom: 4 },
  button: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 20,
  },
  progress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.green600,
  },
  hint: { ...font('medium', 12.5, { color: palette.slate500 }), marginTop: 6, textAlign: 'center' },
});
