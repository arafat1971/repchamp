import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Card, PressableScale } from '@/components/ui';
import { ritualLine, type HabitId, type HabitState } from '@/domain/ritual';
import { font, text } from '@/theme/typography';
import { palette } from '@/theme/tokens';

const ME = palette.purple500;
const THEM = palette.amber500;

/**
 * Our daily ritual, side by side: each healthy habit with my state on the
 * left (tap to tick the ones only I can vouch for) and theirs on the right.
 * The counted habits fill as a ring before they tick, so the next glass or
 * the next thousand steps is visibly *almost*.
 */
export function RitualCard({
  mine,
  theirs,
  name,
  onToggle,
}: {
  mine: readonly HabitState[];
  theirs: readonly HabitState[];
  name: string;
  onToggle: (id: HabitId) => void;
}) {
  const total = mine.length;
  const myScore = mine.filter((s) => s.done).length;
  const theirScore = theirs.filter((s) => s.done).length;
  const perfect = myScore === total && theirScore === total;

  return (
    <Card style={[styles.card, perfect && styles.perfect]}>
      <View style={styles.head}>
        <Score label="You" value={myScore} total={total} color={ME} />
        <View style={styles.headMid}>
          <Text style={styles.title}>{perfect ? '🏆' : '✦'}</Text>
        </View>
        <Score label={name} value={theirScore} total={total} color={THEM} right />
      </View>
      <View style={styles.bars}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${(myScore / total) * 100}%`, backgroundColor: ME }]} />
        </View>
        <View style={[styles.barTrack, styles.barRight]}>
          <View style={[styles.barFill, { width: `${(theirScore / total) * 100}%`, backgroundColor: THEM }]} />
        </View>
      </View>
      <Text style={styles.line}>{ritualLine(myScore, theirScore, name, total)}</Text>

      <View style={styles.rows}>
        {mine.map((m, i) => {
          const t = theirs[i]!;
          return (
            <View key={m.habit.id} style={styles.row}>
              <PressableScale
                onPress={() => m.tickable && onToggle(m.habit.id)}
                disabled={!m.tickable}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: m.done, disabled: !m.tickable }}
                accessibilityLabel={`${m.habit.label}: ${m.habit.hint}`}
              >
                <Check state={m} color={ME} />
              </PressableScale>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowLabel, m.done && t.done && styles.rowBoth]}>
                  {m.habit.emoji} {m.habit.label}
                  {m.done && t.done ? '  ✨' : ''}
                </Text>
                <Text style={[text.caption, styles.rowHint]} numberOfLines={1}>
                  {m.tickable && !m.done ? `Tap when done · ${m.habit.hint}` : m.habit.hint}
                </Text>
              </View>
              <Check state={t} color={THEM} small />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Score({ label, value, total, color, right }: { label: string; value: number; total: number; color: string; right?: boolean }) {
  return (
    <View style={[styles.score, right && styles.scoreRight]}>
      <Text style={styles.scoreLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.scoreValue, { color }]}>
        {value}
        <Text style={styles.scoreTotal}>/{total}</Text>
      </Text>
    </View>
  );
}

/** A tick, or a ring filling toward one; a question mark when not shared. */
function Check({ state, color, small }: { state: HabitState; color: string; small?: boolean }) {
  const size = small ? 28 : 36;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  if (state.unknown) {
    return (
      <View style={[styles.check, { width: size, height: size, borderRadius: size / 2 }, styles.checkUnknown]}>
        <Text style={styles.unknown}>?</Text>
      </View>
    );
  }
  if (state.done) {
    return (
      <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.check, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Text style={[styles.tick, small && { fontSize: 13 }]}>✓</Text>
      </Animated.View>
    );
  }
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.track} strokeWidth={3} fill="none" />
        {state.progress > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeDasharray={`${c * state.progress} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {state.progress > 0 && !small ? (
        <Text style={[styles.pct, { color }]}>{Math.round(state.progress * 100)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  perfect: { borderWidth: 2, borderColor: palette.amber400 },
  head: { flexDirection: 'row', alignItems: 'center' },
  headMid: { paddingHorizontal: 8 },
  title: { fontSize: 22, color: palette.amber500 },
  score: { flex: 1 },
  scoreRight: { alignItems: 'flex-end' },
  scoreLabel: { ...font('bold', 12, { color: palette.slate500 }), maxWidth: 140 },
  scoreValue: { ...font('extrabold', 30), lineHeight: 34 },
  scoreTotal: { ...font('bold', 16, { color: palette.grey500 }) },
  bars: { flexDirection: 'row', gap: 8, marginTop: 8 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: palette.track, overflow: 'hidden' },
  barRight: { transform: [{ scaleX: -1 }] },
  barFill: { height: 8, borderRadius: 4 },
  line: { marginTop: 10, textAlign: 'center', ...font('bold', 14, { color: palette.ink }) },
  rows: { marginTop: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1 },
  rowLabel: { ...font('bold', 15, { color: palette.ink }) },
  rowBoth: { color: palette.green700 },
  rowHint: { color: palette.slate500, marginTop: 1 },
  check: { alignItems: 'center', justifyContent: 'center' },
  checkUnknown: { backgroundColor: palette.track },
  unknown: { ...font('bold', 13, { color: palette.grey500 }) },
  tick: { ...font('extrabold', 17, { color: palette.white }) },
  pct: { position: 'absolute', width: 36, top: 11, textAlign: 'center', ...font('bold', 10) },
});
