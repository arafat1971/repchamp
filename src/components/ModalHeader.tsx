import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/ui';
import { text } from '@/theme/typography';

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
        <IconButton
          glyph="‹"
          label="Go back"
          onPress={() => (onBack ? onBack() : router.back())}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={text.h1} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={[text.captionMd, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    marginBottom: 18,
  },
});
