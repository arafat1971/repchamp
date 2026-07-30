import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { useDialog, type DialogAction, type DialogTone } from '@/state/useDialog';
import { font } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';
import { PressableScale } from './index';

const TONE: Record<DialogTone, { bg: string; fg: string; glyph: string }> = {
  success: { bg: palette.green50, fg: palette.green600, glyph: '✓' },
  info: { bg: palette.green50, fg: palette.green600, glyph: 'i' },
  danger: { bg: palette.red100, fg: palette.red500, glyph: '!' },
};

/**
 * The app-wide custom dialog surface — a branded, animated replacement for the
 * OS `Alert`. Mounted once at the root; it renders whatever `useDialog` holds.
 */
export function DialogHost() {
  const config = useDialog((s) => s.config);
  const hide = useDialog((s) => s.hide);

  const visible = config !== null;
  const tone = TONE[config?.tone ?? 'info'];

  // Non-cancel actions lead (top), cancel sinks to the bottom — the safe,
  // premium stacked layout with big tap targets.
  const actions = config
    ? [...config.actions].sort((a, b) => rank(a) - rank(b))
    : [];

  const run = (action: DialogAction) => {
    hide();
    action.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={hide} statusBarTranslucent>
      {config ? (
        <Animated.View entering={FadeIn.duration(140)} style={styles.scrim}>
          {/* Scrim tap dismisses via the cancel action when one exists. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={() => {
              const cancel = config.actions.find((a) => a.variant === 'cancel');
              if (cancel) run(cancel);
              else hide();
            }}
          />

          <Animated.View entering={ZoomIn.duration(200)} style={styles.card}>
            <View style={[styles.badge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.badgeGlyph, { color: tone.fg }]}>{tone.glyph}</Text>
            </View>

            <Text style={styles.title}>{config.title}</Text>
            {config.message ? <Text style={styles.message}>{config.message}</Text> : null}

            <View style={styles.actions}>
              {actions.map((action) => (
                <ActionButton key={action.label} action={action} onPress={() => run(action)} />
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

function rank(a: DialogAction): number {
  return a.variant === 'cancel' ? 1 : 0;
}

function ActionButton({ action, onPress }: { action: DialogAction; onPress: () => void }) {
  if (action.variant === 'cancel') {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={styles.cancelBtn}
      >
        <Text style={styles.cancelLabel}>{action.label}</Text>
      </PressableScale>
    );
  }

  const destructive = action.variant === 'destructive';
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={[styles.filledBtn, { backgroundColor: destructive ? palette.red500 : palette.green500 }]}
    >
      <Text style={styles.filledLabel}>{action.label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: palette.white,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: 'center',
    ...shadow.card,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  badgeGlyph: font('extrabold', 26),
  title: {
    ...font('extrabold', 19, { color: palette.ink }),
    textAlign: 'center',
  },
  message: {
    ...font('medium', 14, { color: palette.slate500 }),
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  actions: { alignSelf: 'stretch', marginTop: 22, gap: 10 },
  filledBtn: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filledLabel: font('extrabold', 15, { color: palette.white, letterSpacing: 0.2 }),
  cancelBtn: {
    height: 50,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: font('extrabold', 15, { color: palette.slate500 }),
});
