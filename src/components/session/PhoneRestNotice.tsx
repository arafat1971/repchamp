import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { PHONE_REST_COPY, type PhoneRestNoticeKind } from '@/domain/phoneRestCopy';
import { fontFamily } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** A calm heads-up that the *phone* — not the app — has had a long workout.
 * Wording lives in `phoneRestCopy.ts`. It never blocks the camera. */
export function PhoneRestNotice({
  kind,
  top,
  onDismiss,
}: {
  kind: PhoneRestNoticeKind;
  /** Distance from the top of the screen — the caller knows the safe area. */
  top: number;
  onDismiss: () => void;
}) {
  const copy = PHONE_REST_COPY[kind];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.card, { top }]}
    >
      <View style={styles.textCol}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
      <PressableScale
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={10}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>Got it</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(9,14,11,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(253,230,138,0.35)',
  },
  textCol: { flex: 1, gap: 2 },
  title: {
    fontFamily: fontFamily.extrabold,
    fontSize: 14,
    color: palette.white,
  },
  body: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.78)',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  buttonLabel: {
    fontFamily: fontFamily.extrabold,
    fontSize: 12,
    color: palette.white,
  },
});
