import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import type { StepsWidgetSnapshot } from '@/domain/stepsWidget';
import { formatSteps } from '@/domain/steps';
import { font } from '@/theme/typography';

/** A believable pair for previews before there is real data. */
export const SAMPLE_STEPS_WIDGET: StepsWidgetSnapshot = {
  day: '',
  mine: 6240,
  myGoal: 8000,
  name: 'Alex',
  theirs: 7180,
  theirGoal: 8000,
  badge: 'Alex leads',
  line: '940 behind Alex — a 10-min walk takes the lead · 2,580 left as a team',
  updatedAt: 0,
};

/**
 * The Steps widget, drawn in React to match `steps_widget.xml` — for the
 * widget gallery and onboarding, so what you add is what you saw.
 */
export function StepsWidgetPreview({ snap = SAMPLE_STEPS_WIDGET, width = 300 }: { snap?: StepsWidgetSnapshot; width?: number }) {
  const duo = snap.name.length > 0;
  return (
    <View style={[styles.card, { width }]}>
      <LinearGradient
        colors={['#FF9F43', '#FF6B2C', '#E11D48']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.head}>
        <Text style={styles.title}>{duo ? 'STEPS TOGETHER' : 'STEPS TODAY'}</Text>
        {snap.badge ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{snap.badge}</Text>
          </View>
        ) : null}
      </View>
      <Row name="You" value={snap.mine} goal={snap.myGoal} color="#FFFFFF" top={6} />
      {duo ? <Row name={snap.name} value={snap.theirs} goal={snap.theirGoal} color="#E9D5FF" top={8} /> : null}
      <Text style={styles.line} numberOfLines={2}>
        {snap.line}
      </Text>
    </View>
  );
}

function Row({ name, value, goal, color, top }: { name: string; value: number; goal: number; color: string; top: number }) {
  /* A plain percentage width, like the native ProgressBar it mirrors — an
     animated percentage string does not paint on Android. */
  const frac = value < 0 ? 0 : Math.min(1, value / Math.max(1, goal));
  return (
    <View style={{ marginTop: top }}>
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.count}>{value < 0 ? '—' : formatSteps(value)}</Text>
        <Text style={styles.goal}> / {formatSteps(goal)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: color, width: `${frac * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { ...font('bold', 11, { color: '#FFFFFF' }), letterSpacing: 1.3, flex: 1 },
  pill: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: font('bold', 10.5, { color: '#FFFFFF' }),
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  name: { ...font('medium', 12, { color: 'rgba(255,255,255,0.9)' }), flex: 1 },
  count: { ...font('extrabold', 20, { color: '#FFFFFF' }), fontVariant: ['tabular-nums'] },
  goal: font('medium', 11, { color: 'rgba(255,255,255,0.8)', marginBottom: 3 }),
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  line: font('medium', 11.5, { color: 'rgba(255,255,255,0.95)', marginTop: 8 }),
});
