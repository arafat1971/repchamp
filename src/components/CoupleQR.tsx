import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'qrcode';
import Svg, { Rect } from 'react-native-svg';

import { inviteDeepLink } from '@/domain/couple';
import { palette } from '@/theme/tokens';

/**
 * A QR code for a couple pair code, with the RepChamp logo in the centre.
 *
 * Rendered in pure JS — `qrcode` builds the module matrix, `react-native-svg`
 * draws it — so this adds no native dependency and needs no rebuild. Error
 * correction is forced to level **H** (~30% recoverable), which is what lets the
 * centre logo punch a hole in the code without breaking scannability.
 *
 * The payload is the app's own deep link (`repchamp://couple/join?code=…`), so a
 * partner scanning it with *any* phone camera / Google Lens is offered "Open in
 * RepChamp" and lands straight in pairing — not only via the in-app scanner. The
 * web `inviteLink` needs universal links configured to do the same, so it is
 * reserved for the shared text message instead. Either form is understood by the
 * in-app scanner, which parses the code back out with `parseInviteCode`.
 */
export function CoupleQR({ code, size = 232 }: { code: string; size?: number }) {
  const { modules, count } = useMemo(() => {
    // `create` throws only on absurd input; an invite link never will.
    const qr = QRCode.create(inviteDeepLink(code), { errorCorrectionLevel: 'H' });
    return { modules: qr.modules.data, count: qr.modules.size };
  }, [code]);

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

      <View style={[styles.logoWrap, { width: logoSize, height: logoSize, borderRadius: logoSize * 0.24 }]}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="RepChamp"
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
