import { StyleSheet, Text, View } from 'react-native';

import { ExerciseGlyph } from '@/components/ExerciseGlyph';
import { ModalHeader } from '@/components/ModalHeader';
import { Screen } from '@/components/ui';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { HomeCard as Card } from '@/components/ui/HomeCard';
import { dayKey } from '@/domain/progression';
import {
  groupSessionsByDay,
  labelForDay,
  summariseHistory,
} from '@/domain/sessionHistory';
import { headlineProof } from '@/domain/progressProof';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { getExercise } from '@/vision/exercises';
import { font, text } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

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
  const streak = useProfileStore(selectStreak);

  /* No `useMemo`: `reactCompiler` is on in app.json, and it memoizes these
     itself. Wrapping them by hand makes it bail out of optimising the whole
     component — the lint rule that flagged this says exactly that. */
  const days = groupSessionsByDay(sessions);
  const summary = summariseHistory(sessions);
  /* One true sentence about getting better. The app recorded every set since
     launch and never once said the athlete had improved — and belief comes from
     evidence they can check, not from encouragement. Null until something has
     actually been earned. */
  const proof = headlineProof(sessions, streak);

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

      {proof ? (
        <View style={styles.proofCard}>
          <Text style={styles.proofMark}>↗</Text>
          <Text style={styles.proofText}>{proof}</Text>
        </View>
      ) : null}

      <View style={styles.summaryRow}>
        <Stat label={summary.totalSessions === 1 ? 'SET' : 'SETS'} value={String(summary.totalSessions)} />
        <Stat label={summary.totalReps === 1 ? 'TOTAL REP' : 'TOTAL REPS'} value={String(summary.totalReps)} />
        <Stat label={summary.daysTrained === 1 ? 'DAY' : 'DAYS'} value={String(summary.daysTrained)} />
        <Stat
          label="AVG FORM"
          value={summary.averageForm === null ? '—' : `${summary.averageForm}%`}
        />
      </View>

      {days.map((entry) => (
        <View key={entry.day}>
          <View style={styles.dayHeader}>
            <HomeSectionHeader title={labelForDay(entry.day, today)} />
            <Text style={styles.dayTotal}>
              {entry.totalReps} {entry.totalReps === 1 ? 'rep' : 'reps'} · +{entry.totalXp} XP
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
                  <View style={styles.titleRow}>
                    <Text
                      style={[font('extrabold', 15, { color: palette.ink }), { flexShrink: 1 }]}
                      numberOfLines={1}
                    >
                      {definition.label}
                    </Text>
                    {/* Only a real head-to-head gets an outcome. A solo set has
                        no opponent, and `won: false` on one of those would read
                        as a loss it never was. */}
                    {versus && session.opponentReps !== null ? (
                      <View
                        style={[
                          styles.outcome,
                          session.won && !session.drew ? styles.outcomeWon : styles.outcomeOther,
                        ]}
                      >
                        <Text
                          style={font('extrabold', 10, {
                            color: session.won && !session.drew ? palette.green700 : palette.slate500,
                          })}
                        >
                          {session.drew ? 'Drew' : session.won ? 'Won' : 'Lost'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={font('semibold', 11, { color: palette.slate500 })}>
                    {session.durationSec}s
                    {session.formScore ? ` · ${session.formScore}% form` : ''}
                    {versus && session.opponentReps !== null ? ` · vs ${session.opponentReps}` : ''}
                  </Text>
                </View>

                <View style={styles.repsColumn}>
                  <Text style={font('extrabold', 19, { color: palette.ink })}>{session.reps}</Text>
                  <Text style={font('bold', 10, { color: palette.slate500 })}>
                    {session.reps === 1 ? 'rep' : 'reps'}
                  </Text>
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
    borderRadius: radius['4xl'],
    paddingVertical: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  /* Green and quiet. This is a fact, not a celebration — overselling it would
     make the athlete suspicious of a number that is genuinely theirs. */
  proofCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.green50,
    borderRadius: radius['4xl'],
    padding: 16,
    marginBottom: 12,
  },
  proofMark: font('extrabold', 18, { color: palette.green600 }),
  proofText: {
    ...font('bold', 13.5, { color: palette.green700 }),
    flexShrink: 1,
    lineHeight: 19,
  },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outcome: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  outcomeWon: { backgroundColor: palette.green50 },
  outcomeOther: { backgroundColor: palette.divider },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyMark: { ...font('bold', 40, { color: palette.divider }), marginBottom: 8 },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', marginTop: 8 },
});
