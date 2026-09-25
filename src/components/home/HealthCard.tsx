import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/** iOS system tints — one per category, as the Health app assigns them. */
export const IOS = {
  water: '#32ADE6',
  steps: '#FF6B2C',
  duo: '#FF2D55',
  green: '#34C759',
  label: '#1C1C1E',
  secondary: '#8E8E93',
  tertiary: '#C7C7CC',
  fill: '#F2F2F7',
  separator: 'rgba(60,60,67,0.12)',
} as const;

/**
 * The shell every summary card on Home shares, in the Health app's grammar:
 * a tinted category label top-left, quiet status and a chevron top-right, and
 * the content beneath on a plain white card. One shape, three cards — the
 * sameness is what makes it read as a system rather than three designs.
 */
export function HealthCard({
  icon,
  title,
  tint,
  trailing,
  onPress,
  accessibilityLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  tint: string;
  trailing?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  const body = (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.category}>
          {icon}
          <Text style={[styles.title, { color: tint }]}>{title}</Text>
        </View>
        <View style={styles.trailing}>
          {trailing ? (
            <Text style={styles.trailingText} numberOfLines={1}>
              {trailing}
            </Text>
          ) : null}
          {onPress ? <Text style={styles.chevron}>›</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}>
      {body}
    </PressableScale>
  );
}

/** A number the iOS way: large and tight, with a small grey unit after it. */
export function Metric({ value, unit, color = IOS.label }: { value: string; unit?: string; color?: string }) {
  return (
    <Text style={[styles.metric, { color }]} numberOfLines={1}>
      {value}
      {unit ? <Text style={styles.unit}> {unit}</Text> : null}
    </Text>
  );
}

/** A thin capsule progress bar. */
export function Capsule({ fraction, color, track = IOS.fill }: { fraction: number; color: string; track?: string }) {
  const pct = Math.max(0, Math.min(1, fraction));
  return (
    <View style={[styles.capsule, { backgroundColor: track }]}>
      {pct > 0 ? <View style={[styles.capsuleFill, { width: `${Math.max(4, pct * 100)}%`, backgroundColor: color }]} /> : null}
    </View>
  );
}

/**
 * One person's line in a comparison: face, name, a capsule toward the goal,
 * and the value at the end. `leading` swaps the face for any glyph (a bear).
 */
export function PersonRow({
  name,
  avatar,
  color,
  fraction,
  value,
  muted = false,
  leading,
}: {
  name: string;
  avatar?: string | null;
  color: string;
  fraction: number;
  value: string;
  muted?: boolean;
  leading?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      {leading ?? <Face uri={avatar ?? null} name={name} color={color} />}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.rowValue, muted && { color: IOS.tertiary }]} numberOfLines={1}>
            {value}
          </Text>
        </View>
        <Capsule fraction={fraction} color={color} />
      </View>
    </View>
  );
}

export function Face({ uri, name, color, size = 30 }: { uri: string | null; name: string; color: string; size?: number }) {
  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22` }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : (
        <Text style={font('bold', size * 0.42, { color })}>{(name.charAt(0) || '?').toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...font('bold', 14.5), letterSpacing: -0.2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  trailingText: font('medium', 13, { color: IOS.secondary }),
  chevron: { ...font('semibold', 20, { color: IOS.tertiary }), lineHeight: 22, marginTop: -2 },
  metric: { ...font('bold', 30), letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  unit: { ...font('semibold', 15, { color: IOS.secondary }), letterSpacing: 0 },
  capsule: { height: 6, borderRadius: 3, overflow: 'hidden' },
  capsuleFill: { height: '100%', borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowName: { ...font('semibold', 13.5, { color: IOS.label }), flexShrink: 1 },
  rowValue: { ...font('semibold', 13.5, { color: IOS.label }), fontVariant: ['tabular-nums'] },
  face: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
