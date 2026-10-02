import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { font } from '@/theme/typography';
import { palette, surfaceShadow } from '@/theme/tokens';

/** Back chevron + title, shared by every screen in the modal group. */
export function ModalHeader({
  title,
  subtitle,
  hideBack = false,
  onBack,
}: {
  title: string;
  subtitle?: string;
  /** Hide the back chevron — used by the hard paywall so it can't be dismissed. */
  hideBack?: boolean;
  /** Override the default `router.back()` — e.g. cancel a pending duel first. */
  onBack?: () => void;
}) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      {hideBack ? null : (
        <PressableScale
          onPress={() => (onBack ? onBack() : router.back())}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </PressableScale>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  backGlyph: { fontSize: 26, color: palette.ink, lineHeight: 28, marginTop: -2 },
  title: { ...font('extrabold', 28, { color: palette.ink }), letterSpacing: -0.8 },
  subtitle: { ...font('semibold', 13, { color: palette.grey600 }), marginTop: 2 },
});
