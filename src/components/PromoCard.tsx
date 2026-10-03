import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui';
import { font, scaleForRole } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * The one shape every Pro offer takes: a headline, one honest sentence, a
 * primary action, and a "Not now" of equal size. The dismiss is never smaller or
 * dimmer than the ask — that parity is the point of sharing the component.
 */
export function PromoCard({
  headline,
  body,
  cta,
  busy = false,
  onAccept,
  onDismiss,
  style,
}: {
  headline: string;
  body: string;
  cta: string;
  busy?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      <Text style={font('extrabold', 18, { color: palette.ink })} {...scaleForRole('body')}>
        {headline}
      </Text>
      <Text style={styles.body} {...scaleForRole('body')}>
        {body}
      </Text>
      <View style={styles.row}>
        <PressableScale
          onPress={onAccept}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={cta}
          style={styles.cta}
        >
          <Text style={font('extrabold', 15, { color: palette.white })} {...scaleForRole('control')}>
            {busy ? 'Working…' : cta}
          </Text>
        </PressableScale>
        <PressableScale
          onPress={onDismiss}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          style={styles.later}
        >
          <Text style={font('bold', 15, { color: palette.ink })} {...scaleForRole('control')}>
            Not now
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    padding: 16,
    gap: 8,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  body: { ...font('medium', 14, { color: palette.inkSoft }), lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cta: {
    flex: 1.4,
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  later: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
