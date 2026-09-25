import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Card, PressableScale } from '@/components/ui';
import { HabitIcon } from '@/components/together/HabitIcon';
import { ritualLine, type HabitId, type HabitState } from '@/domain/ritual';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

export const ME = palette.purple500;
export const THEM = palette.amber500;

/**
 * Today's ritual as a small table: the habit, then a column for me (tap the
 * ones only I can vouch for) and one for them. Counted habits show a ring
 * filling toward the tick. Quiet on purpose — the ticks are the colour.
 */
export function RitualCard({
  mine,
  theirs,
  name,
  onToggle,
  onEdit,
}: {
  mine: readonly HabitState[];
  theirs: readonly HabitState[];
  name: string;
  onToggle: (id: HabitId) => void;
  /** Open the plan: choose the three ticked habits and the walk goal. */
  onEdit?: () => void;
}) {
  const total = mine.length;
  const myScore = mine.filter((s) => s.done).length;
  const theirScore = theirs.filter((s) => s.done).length;

  return (
    <Card style={styles.card}>
      <Text style={styles.line}>{ritualLine(myScore, theirScore, name, total)}</Text>
      <Progress label="You" value={myScore} total={total} color={ME} />
      <Progress label={name} value={theirScore} total={total} color={THEM} />

      <View style={styles.tableHead}>
        <Text style={styles.colHead}>You</Text>
        <Text style={styles.colHead} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {mine.map((m, i) => {
        const t = theirs[i]!;
        const both = m.done && t.done;
        return (
          <View key={m.habit.id} style={[styles.row, i > 0 && styles.rowRule]}>
            <View style={[styles.icon, both && styles.iconBoth]}>
              <HabitIcon id={m.habit.id} color={both ? palette.green700 : palette.ink} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.label}>{m.habit.label}</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {m.habit.hint}
              </Text>
            </View>
            <PressableScale
              onPress={() => m.tickable && onToggle(m.habit.id)}
              disabled={!m.tickable}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: m.done, disabled: !m.tickable }}
              accessibilityLabel={`${m.habit.label}, ${m.habit.hint}`}
              style={styles.cell}
            >
              <Check state={m} color={ME} tickable={m.tickable} />
            </PressableScale>
            <View style={styles.cell}>
              <Check state={t} color={THEM} />
            </View>
          </View>
        );
      })}
      {onEdit ? (
        <PressableScale onPress={onEdit} accessibilityRole="button" style={styles.edit}>
          <Text style={styles.editText}>Choose your habits</Text>
        </PressableScale>
      ) : null}
    </Card>
  );
}

function Progress({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <View style={styles.progress}>
      <Text style={styles.progressLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.segment, { backgroundColor: i < value ? color : palette.track }]} />
        ))}
      </View>
      <Text style={styles.progressValue}>
        {value}/{total}
      </Text>
    </View>
  );
}

/** A tick, a ring filling toward one, a dashed circle to tap, or a dash when unknown. */
function Check({ state, color, tickable }: { state: HabitState; color: string; tickable?: boolean }) {
  const size = 26;
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  if (state.unknown) return <Text style={styles.unknown}>–</Text>;
  if (state.done) {
    return (
      <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.done, { backgroundColor: color }]}>
        <Text style={styles.tick}>✓</Text>
      </Animated.View>
    );
  }
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={tickable ? color : palette.track}
        strokeOpacity={tickable ? 0.45 : 1}
        strokeWidth={2}
        strokeDasharray={tickable && state.progress === 0 ? '3 3' : undefined}
        fill="none"
      />
      {state.progress > 0 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray={`${c * state.progress} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18 },
  line: { ...font('semibold', 15, { color: palette.ink }), marginBottom: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  progressLabel: { width: 64, ...font('semibold', 12, { color: palette.slate500 }) },
  segments: { flex: 1, flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  progressValue: { width: 28, textAlign: 'right', ...font('semibold', 12, { color: palette.slate500 }) },
  tableHead: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, marginBottom: 2 },
  colHead: { width: 52, textAlign: 'center', ...font('semibold', 11, { color: palette.grey500 }) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.track,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBoth: { backgroundColor: palette.green50 },
  copy: { flex: 1 },
  label: font('semibold', 15, { color: palette.ink }),
  hint: { ...font('regular', 12, { color: palette.slate500 }), marginTop: 1 },
  cell: { width: 52, alignItems: 'center', justifyContent: 'center' },
  done: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tick: font('bold', 14, { color: palette.white }),
  unknown: font('semibold', 16, { color: palette.grey500 }),
  edit: { marginTop: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider, alignItems: 'center' },
  editText: font('semibold', 14, { color: palette.slate500 }),
});
