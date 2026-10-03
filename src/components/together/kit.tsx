import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { LinkedAvatars } from '@/components/connected/LinkedAvatars';
import { Avatar, PressableScale } from '@/components/ui';
import { font } from '@/theme/typography';
import { gradients, palette, surfaceShadow } from '@/theme/tokens';

/**
 * The shared pieces of every couple screen — Today together, the bond history,
 * the invite flow. They lived as three private copies of `Heading`, a link row
 * and a hero; one set means the screens read as one product.
 */

/** A section title: bold, tight, with one quiet fact on the right. */
export function SectionTitle({ title, aside, first = false }: { title: string; aside?: string; first?: boolean }) {
  return (
    <View style={[styles.sectionRow, first && { marginTop: 4 }]}>
      <Text style={styles.sectionTitle} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {aside ? (
        <Text style={styles.sectionAside} numberOfLines={1}>
          {aside}
        </Text>
      ) : null}
    </View>
  );
}

/** White surface with the app's hairline and long soft shadow. */
export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export type LineIconName = 'today' | 'calendar' | 'share' | 'gift' | 'unpair' | 'target' | 'bell' | 'chevron';

/**
 * The couple screens' line icons: 24-unit grid, 1.8 round strokes, one colour —
 * the same hand as `HabitIcon`, so a row's icon and a habit's icon match.
 */
export function LineIcon({ name, size = 20, color }: { name: LineIconName; size?: number; color: string }) {
  const s = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'today' ? (
        <>
          <Circle cx="12" cy="12" r="3.8" {...s} />
          <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" {...s} />
        </>
      ) : null}
      {name === 'calendar' ? (
        <>
          <Rect x="4" y="5.5" width="16" height="14.5" rx="3" {...s} />
          <Path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4" {...s} />
        </>
      ) : null}
      {name === 'share' ? (
        <Path d="M12 15V4M8 7.5l4-4 4 4M5 12.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5" {...s} />
      ) : null}
      {name === 'gift' ? (
        <>
          <Rect x="4" y="9" width="16" height="4" rx="1" {...s} />
          <Path d="M5.5 13v6.5h13V13M12 9v10.5" {...s} />
          <Path d="M12 9C10.2 9 8 8.2 8 6.3 8 5 9 4.2 10 4.5c1.3.4 2 2.5 2 4.5ZM12 9c1.8 0 4-.8 4-2.7 0-1.3-1-2.1-2-1.8-1.3.4-2 2.5-2 4.5Z" {...s} />
        </>
      ) : null}
      {name === 'unpair' ? (
        <>
          <Circle cx="10" cy="8" r="3.5" {...s} />
          <Path d="M3.5 19.5c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16.5 9.5h5" {...s} />
        </>
      ) : null}
      {name === 'target' ? (
        <>
          <Circle cx="12" cy="12" r="8" {...s} />
          <Circle cx="12" cy="12" r="3.5" {...s} />
        </>
      ) : null}
      {name === 'bell' ? <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2ZM10 20.5a2 2 0 0 0 4 0" {...s} /> : null}
      {name === 'chevron' ? <Path d="M9 5.5l6.5 6.5L9 18.5" {...s} /> : null}
    </Svg>
  );
}

/**
 * A navigation row: a tinted icon tile, a title with one line of context, and
 * a chevron. On its own it is a card; inside an `ActionList` it is a flat row
 * with a hairline above it, so related destinations read as one group.
 */
export function ActionRow({
  icon,
  tint = palette.green600,
  title,
  sub,
  onPress,
  badge,
  flat = false,
  rule = false,
  danger = false,
}: {
  icon: LineIconName;
  tint?: string;
  title: string;
  sub?: string;
  onPress: () => void;
  badge?: string;
  /** Drawn inside an `ActionList`: no card of its own. */
  flat?: boolean;
  /** Hairline above — every flat row but the first. */
  rule?: boolean;
  /** A destructive destination: the title takes the danger colour. */
  danger?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={[styles.actionRow, flat ? styles.actionFlat : [styles.actionCard, surfaceShadow], rule && styles.actionRule]}
    >
      <View style={[styles.actionTile, { backgroundColor: `${tint}1A` }]}>
        <LineIcon name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, danger && { color: palette.red600 }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.actionSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <LineIcon name="chevron" size={16} color={palette.grey450} />
    </PressableScale>
  );
}

/** One surface holding several flat `ActionRow`s. */
export function ActionList({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Surface style={[styles.actionList, style]}>{children}</Surface>;
}

/**
 * The pair of buttons under a hero: one quiet, one filled, always equal width.
 */
export function ButtonPair({
  secondary,
  primary,
}: {
  secondary: { label: string; icon?: LineIconName; onPress: () => void; a11y?: string; disabled?: boolean };
  primary: { label: string; icon?: LineIconName; onPress: () => void; a11y?: string };
}) {
  return (
    <View style={styles.pair}>
      <PressableScale
        onPress={secondary.onPress}
        disabled={secondary.disabled}
        accessibilityRole="button"
        accessibilityLabel={secondary.a11y ?? secondary.label}
        style={[styles.pairBtn, styles.pairQuiet]}
      >
        {secondary.icon ? <LineIcon name={secondary.icon} size={18} color={palette.ink} /> : null}
        <Text style={styles.pairQuietText} numberOfLines={1}>
          {secondary.label}
        </Text>
      </PressableScale>
      <PressableScale
        onPress={primary.onPress}
        accessibilityRole="button"
        accessibilityLabel={primary.a11y ?? primary.label}
        style={[styles.pairBtn, styles.pairSolid]}
      >
        {primary.icon ? <LineIcon name={primary.icon} size={18} color={palette.white} /> : null}
        <Text style={styles.pairSolidText} numberOfLines={1}>
          {primary.label}
        </Text>
      </PressableScale>
    </View>
  );
}

export interface HeroStat {
  value: string;
  label: string;
}

/**
 * The couple's header: both faces joined by the link, the shared streak large,
 * and a strip of figures. `lit` is true on a day you both trained.
 */
export function TogetherHero({
  me,
  them,
  streak,
  caption,
  stats,
  lit,
  level,
  footer,
}: {
  me: { name: string; uri?: string | null; color: string };
  them: { name: string; uri?: string | null; color: string };
  streak: number;
  caption: string;
  stats: readonly HeroStat[];
  lit: boolean;
  /** The bond's level, drawn as a labelled bar: name left, points right. */
  level?: { label: string; detail: string; progress: number };
  footer?: ReactNode;
}) {
  return (
    <LinearGradient colors={gradients.heroEmerald} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroGlow} pointerEvents="none" />
      <View style={styles.heroGlowInner} pointerEvents="none" />
      <LinkedAvatars
        lit={lit}
        size={52}
        me={{ initial: (me.name.charAt(0) || 'Y').toUpperCase(), uri: me.uri, color: me.color }}
        them={{ initial: (them.name.charAt(0) || 'P').toUpperCase(), uri: them.uri, color: them.color }}
      />
      <Text style={styles.heroNames} numberOfLines={1}>
        {me.name} & {them.name}
      </Text>
      <View style={styles.streakRow}>
        <Text style={styles.streakNum}>{streak}</Text>
        <Text style={styles.streakUnit}>day streak</Text>
      </View>
      <Text style={styles.heroCaption}>{caption}</Text>
      <View style={styles.statStrip}>
        {stats.map((s, i) => (
          <View key={s.label} style={[styles.stat, i > 0 && styles.statRule]}>
            <Text style={styles.statValue} numberOfLines={1}>
              {s.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      {level ? (
        <View style={styles.level} accessibilityLabel={`${level.label}, ${level.detail}`}>
          <View style={styles.levelHead}>
            <Text style={styles.levelLabel} numberOfLines={1}>
              {level.label}
            </Text>
            <Text style={styles.levelDetail} numberOfLines={1}>
              {level.detail}
            </Text>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.max(3, Math.round(Math.min(1, level.progress) * 100))}%` }]} />
          </View>
        </View>
      ) : null}
      {footer}
    </LinearGradient>
  );
}

/**
 * The unpaired pitch: my face beside an empty seat, then what pairing unlocks.
 * Used wherever a couple screen is opened before anyone is paired, so the
 * empty state shows the thing rather than apologising for it.
 */
export function PairPitch({
  name,
  uri,
  onInvite,
  onScan,
  title = 'Better with someone',
  body = 'Pair up and your streak, your water and your sets all count for two.',
}: {
  name: string;
  uri?: string | null;
  onInvite: () => void;
  onScan?: () => void;
  title?: string;
  body?: string;
}) {
  const perks: { glyph: string; text: string }[] = [
    { glyph: '🔥', text: 'A streak that only grows when you both show up' },
    { glyph: '🐼', text: 'Two pandas, one jar to fill together' },
    { glyph: '⚡', text: 'Live races and shared sets, one tap away' },
  ];
  return (
    <View>
      <LinearGradient colors={gradients.heroEmerald} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroGlow} pointerEvents="none" />
        <View style={styles.seats}>
          <View style={styles.seatMe}>
            <Avatar initial={(name.charAt(0) || 'Y').toUpperCase()} uri={uri} size={64} background={palette.green700} color={palette.white} />
          </View>
          <View style={styles.seatLink}>
            <Text style={styles.seatPlus}>+</Text>
          </View>
          <View style={styles.seatEmpty}>
            <Text style={styles.seatEmptyGlyph}>🐼</Text>
          </View>
        </View>
        <Text style={styles.pitchTitle}>{title}</Text>
        <Text style={styles.pitchBody}>{body}</Text>
      </LinearGradient>

      <Surface style={styles.perks}>
        {perks.map((p) => (
          <View key={p.text} style={styles.perk}>
            <View style={styles.perkTile}>
              <Text style={{ fontSize: 16 }}>{p.glyph}</Text>
            </View>
            <Text style={styles.perkText}>{p.text}</Text>
          </View>
        ))}
      </Surface>

      <PressableScale onPress={onInvite} accessibilityRole="button" accessibilityLabel="Invite a partner" style={styles.cta}>
        <Text style={styles.ctaText}>Invite a partner</Text>
      </PressableScale>
      {onScan ? (
        <PressableScale onPress={onScan} accessibilityRole="button" accessibilityLabel="Scan a partner's QR code" style={styles.ctaGhost}>
          <Text style={styles.ctaGhostText}>Scan their QR code</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 26, marginBottom: 10, paddingHorizontal: 2, gap: 8 },
  sectionTitle: { flex: 1, ...font('extrabold', 19, { color: palette.ink }), letterSpacing: -0.4 },
  sectionAside: font('semibold', 12.5, { color: palette.grey600 }),

  surface: {
    backgroundColor: palette.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  actionCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
  },
  actionFlat: { paddingVertical: 12, paddingHorizontal: 16 },
  actionRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  actionList: { marginTop: 12, overflow: 'hidden' },
  actionTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { ...font('bold', 15.5, { color: palette.ink }), letterSpacing: -0.2 },
  actionSub: { ...font('medium', 12.5, { color: palette.grey700 }), marginTop: 1, lineHeight: 17 },
  badge: { backgroundColor: palette.green50, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: font('bold', 11.5, { color: palette.green700 }),

  pair: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pairBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  pairQuiet: { backgroundColor: palette.white, borderWidth: 1, borderColor: palette.border },
  pairQuietText: { ...font('bold', 15, { color: palette.ink }), flexShrink: 1 },
  pairSolid: { backgroundColor: palette.ink },
  pairSolidText: { ...font('bold', 15, { color: palette.white }), flexShrink: 1 },

  hero: { borderRadius: 28, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, alignItems: 'center', overflow: 'hidden' },
  heroGlow: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(134,239,172,0.10)',
  },
  heroGlowInner: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(134,239,172,0.08)',
  },
  level: { alignSelf: 'stretch', marginTop: 16 },
  levelHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 },
  levelLabel: { flexShrink: 1, ...font('bold', 12.5, { color: palette.white }) },
  levelDetail: { ...font('semibold', 12, { color: 'rgba(255,255,255,0.72)' }), fontVariant: ['tabular-nums'] },
  levelTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  levelFill: { height: 6, borderRadius: 3, backgroundColor: palette.green400 },
  heroNames: { ...font('bold', 14, { color: 'rgba(255,255,255,0.78)' }), marginTop: 12, maxWidth: '90%' },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  streakNum: { ...font('extrabold', 52, { color: palette.white }), letterSpacing: -2, fontVariant: ['tabular-nums'] },
  streakUnit: font('semibold', 16, { color: 'rgba(255,255,255,0.78)' }),
  heroCaption: { ...font('medium', 13, { color: 'rgba(255,255,255,0.72)' }), textAlign: 'center', marginTop: -2 },
  statStrip: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  statRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.25)' },
  statValue: { ...font('extrabold', 19, { color: palette.white }), fontVariant: ['tabular-nums'] },
  statLabel: { ...font('medium', 11.5, { color: 'rgba(255,255,255,0.68)' }), marginTop: 1 },

  seats: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  seatMe: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 40 },
  seatLink: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -8,
    zIndex: 1,
  },
  seatPlus: { ...font('extrabold', 18, { color: palette.green700 }), lineHeight: 21 },
  seatEmpty: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatEmptyGlyph: { fontSize: 30, opacity: 0.35 },
  pitchTitle: { ...font('extrabold', 24, { color: palette.white }), letterSpacing: -0.6 },
  pitchBody: { ...font('medium', 14, { color: 'rgba(255,255,255,0.82)' }), textAlign: 'center', marginTop: 4, lineHeight: 20 },
  perks: { marginTop: 14, padding: 16, gap: 12 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkTile: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.green50, alignItems: 'center', justifyContent: 'center' },
  perkText: { flex: 1, ...font('semibold', 14, { color: palette.ink }), lineHeight: 19 },
  cta: {
    marginTop: 16,
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: palette.green600,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  ctaText: font('extrabold', 16, { color: palette.white }),
  ctaGhost: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: palette.green300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaGhostText: font('bold', 15, { color: palette.green700 }),
});
