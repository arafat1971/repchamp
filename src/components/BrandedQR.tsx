import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'qrcode';
import Svg, { Rect } from 'react-native-svg';

import { palette } from '@/theme/tokens';

/**
 * A QR code for any payload, with the RepChamp icon in the centre.
 *
 * Rendered in pure JS — `qrcode` builds the module matrix, `react-native-svg`
 * draws it — so this adds no native dependency and needs no rebuild. Error
 * correction is forced to level **H** (~30% recoverable), which is what lets
 * the centre logo punch a hole in the code without breaking scannability.
 *
 * Callers pass an app deep link rather than a bare code, so that scanning with
 * *any* phone camera or Google Lens offers "Open in RepChamp" and lands in the
 * right screen — not only the in-app scanner.
 *
 * This was extracted from the couple pairing QR when duels grew one too. The
 * two invites differ only in payload; the matrix maths, the centre reservation
 * and the logo treatment are the same, and duplicating them would have meant
 * two codes that drift apart in look and in scannability.
 */
export function BrandedQR({
  payload,
  size = 232,
  accessibilityLabel,
}: {
  payload: string;
  size?: number;
  accessibilityLabel?: string;
}) {
  const { modules, count } = useMemo(() => {
    // `create` throws only on absurd input; an invite link never will.
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
    return { modules: qr.modules.data, count: qr.modules.size };
  }, [payload]);

  const cell = size / count;

  // Clear a square in the centre for the logo. Roughly a fifth of the code on a
  // side sits well under level-H's recovery budget, so the code still scans.
  const clearCount = Math.floor(count * 0.22);
  const clearStart = Math.floor((count - clearCount) / 2);
  const clearEnd = clearStart + clearCount;

  const rects = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!modules[row * count + col]) continue;
        // Skip the centre reservation — the logo covers it.
        if (row >= clearStart && row < clearEnd && col >= clearStart && col < clearEnd) continue;
        out.push({ x: col * cell, y: row * cell });
      }
    }
    return out;
  }, [modules, count, cell, clearStart, clearEnd]);

  const logoSize = clearCount * cell * 0.86;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {rects.map((r, i) => (
          <Rect
            key={i}
            x={r.x}
            y={r.y}
            // Slight overdraw removes hairline seams between cells on some GPUs.
            width={cell + 0.5}
            height={cell + 0.5}
            fill={palette.ink}
          />
        ))}
      </Svg>

      <View
        style={[styles.logoWrap, { width: logoSize, height: logoSize, borderRadius: logoSize * 0.24 }]}
      >
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel={accessibilityLabel ?? 'RepChamp'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logoWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
    // A little padding ring so the logo reads cleanly against the code.
    padding: 4,
  },
  logo: { width: '100%', height: '100%' },
});
