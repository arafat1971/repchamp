import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

// Deliberately does not import from `./index`: that barrel re-exports this
// file, and the cycle would leave `PressableScale` undefined at module-eval
// time on a cold start. `Skeleton.tsx` avoids the same trap the same way.

/**
 * The "there is nothing here" state, shared so every list tells the same story.
 *
 * Screens used to hand-roll this, which is why coverage drifted: some rendered
 * a message, some rendered `null`. A list that vanishes on empty is
 * indistinguishable from one that failed to load, and the athlete is left
 * guessing whether the app is broken or they simply have no friends yet.
 *
 * `tone="error"` is the same layout with a retry affordance — deliberately not
 * a separate component, because the only thing that changes is intent and
 * whether there is something to tap.
 */
export function EmptyState({
  glyph,
  title,
  message,
  actionLabel,
  onAction,
  tone = 'empty',
}: {
  /** A single emoji, sized as the visual anchor. */
  glyph?: string;
  title: string;
  /** One line explaining what to do about it, when there is something to do. */
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'empty' | 'error';
}) {
  const isError = tone === 'error';
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      {glyph ? <Text style={styles.glyph}>{glyph}</Text> : null}
      <Text
        style={font('extrabold', 15, {
          color: isError ? palette.red600 : palette.ink,
          textAlign: 'center',
        })}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={font('medium', 13, {
            color: palette.grey600,
            textAlign: 'center',
            marginTop: 6,
            lineHeight: 19,
          })}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={font('extrabold', 13, { color: palette.green700 })}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Convenience wrapper for the most common case: a failed fetch with a retry. */
export function ErrorState({
  title = 'Could not load',
  message = 'Check your connection and try again.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <EmptyState
      glyph="⚠️"
      title={title}
      message={message}
      tone="error"
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  glyph: { fontSize: 32, marginBottom: 10 },
  action: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.green50,
  },
  actionPressed: { opacity: 0.7 },
});
