import { StyleSheet, Text, View } from 'react-native';

import { ExerciseGlyph } from '@/components/ExerciseGlyph';
import { ModalHeader } from '@/components/ModalHeader';
import { Card, Eyebrow, Screen } from '@/components/ui';
import { dayKey } from '@/domain/progression';
import {
  groupSessionsByDay,
  labelForDay,
  summariseHistory,
} from '@/domain/sessionHistory';
import { useProfileStore } from '@/state/profileStore';
import { getExercise } from '@/vision/exercises';
import { font, text } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';

/**
 * Every set, newest first.
 *
 * The store has recorded date, exercise, reps, form score and outcome since the
 * app shipped, and nothing ever showed it back — the one thing every app in this
 * category has that this one did not. All the grouping and arithmetic lives in
 * `domain/sessionHistory`, so this file only lays it out.
 */
export default function HistoryScreen() {
  const sessions = useProfileStore((s) => s.sessions);
  const today = dayKey();

  /* No `useMemo`: `reactCompiler` is on in app.json, and it memoizes these
     itself. Wrapping them by hand makes it bail out of optimising the whole
     component — the lint rule that flagged this says exactly that. */
  const days = groupSessionsByDay(sessions);
  const summary = summariseHistory(sessions);

  if (sessions.length === 0) {
    return (
      <Screen>
        <ModalHeader title="History" />
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>—</Text>
          <Text style={[text.h2, styles.emptyTitle]}>No sets yet</Text>
          <Text style={[text.captionMd, styles.emptyBody]}>
            Every set you finish lands here, with the reps and the form score
            behind them.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader title="History" />

      <View style={styles.summaryRow}>
        <Stat label="SETS" value={String(summary.totalSessions)} />
        <Stat label="TOTAL REPS" value={String(summary.totalReps)} />
        <Stat label="DAYS" value={String(summary.daysTrained)} />
        <Stat
          label="AVG FORM"
          value={summary.averageForm === null ? '—' : `${summary.averageForm}%`}
        />
      </View>

      {days.map((entry) => (
        <View key={entry.day}>
          <View style={styles.dayHeader}>
            <Eyebrow>{labelForDay(entry.day, today).toUpperCase()}</Eyebrow>
            <Text style={styles.dayTotal}>
              {entry.totalReps} reps · +{entry.totalXp} XP
            </Text>
          </View>

          {entry.sessions.map((session) => {
            const definition = getExercise(session.exercise);
            const versus = session.mode === 'versus' || session.mode === 'together';
            return (
              <Card key={session.id} style={styles.row}>
                <View style={styles.glyphChip}>
                  <ExerciseGlyph exercise={session.exercise} size={24} color={palette.green600} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={font('extrabold', 15, { color: palette.ink })} numberOfLines={1}>
                    {definition.label}
                  </Text>
                  <Text style={font('semibold', 11, { color: palette.slate500 })}>
                    {session.durationSec}s
                    {session.formScore ? ` · ${session.formScore}% form` : ''}
                    {/* Only a real head-to-head gets an outcome. A solo set has
                        no opponent, and `won: false` on one of those would read
                        as a loss it never was. */}
                    {versus && session.opponentReps !== null
                      ? session.drew
                        ? ' · drew'
                        : session.won
                          ? ' · won'
                          : ' · lost'
                      : ''}
                  </Text>
                </View>

                <View style={styles.repsColumn}>
                  <Text style={font('extrabold', 19, { color: palette.ink })}>{session.reps}</Text>
                  <Text style={font('bold', 10, { color: palette.slate500 })}>reps</Text>
                </View>
              </Card>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={font('extrabold', 17, { color: palette.ink })}>{value}</Text>
      <Text style={font('bold', 9, { color: palette.slate500, letterSpacing: 0.4 })}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: palette.white,
    borderRadius: radius['2xl'],
    paddingVertical: 14,
    marginBottom: 20,
    ...shadow.card,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  dayTotal: font('bold', 11, { color: palette.green600 }),
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 8,
  },
  glyphChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.tintGreenTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repsColumn: { alignItems: 'flex-end' },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyMark: { ...font('bold', 40, { color: palette.divider }), marginBottom: 8 },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', marginTop: 8 },
});
