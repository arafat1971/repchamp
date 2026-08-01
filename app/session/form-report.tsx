import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ProgressRing } from '@/components/session/ProgressRing';
import { Card, IconButton, PrimaryButton, Screen, SectionLabel } from '@/components/ui';
import { canUse } from '@/domain/pro';
import { useIsPro } from '@/state/proStore';
import { useSessionStore } from '@/state/sessionStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

export default function FormReportScreen() {
  const router = useRouter();
  const report = useSessionStore((s) => s.formReport);
  const reps = useSessionStore((s) => s.reps);
  const isPro = useIsPro();

  if (!canUse(isPro, 'advanced-stats')) {
    return <Redirect href={{ pathname: '/modal/paywall', params: { source: 'form-report' } }} />;
  }

  if (!report) {
    return (
      <Screen>
        <Text style={text.h2}>No report available</Text>
        <PrimaryButton label="Back" onPress={() => router.back()} style={{ marginTop: 20 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton glyph="‹" label="Back to results" onPress={() => router.back()} />
        <Text style={[text.h2, { flex: 1 }]}>Form report</Text>
      </View>

      <LinearGradient colors={gradients.brandDeep} style={[styles.scoreCard, shadow.brand]}>
        <ProgressRing
          percent={report.score}
          size={88}
          strokeWidth={7}
          color={palette.white}
          trackColor="rgba(255,255,255,0.25)"
        >
          <Text style={font('extrabold', 26, { color: palette.white })}>{report.score}</Text>
          <Text style={font('bold', 9, { color: 'rgba(255,255,255,0.8)' })}>/100</Text>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Text style={font('extrabold', 18, { color: palette.white })}>{report.grade}</Text>
          <Text style={styles.scoreSummary}>{report.summary}</Text>
        </View>
      </LinearGradient>

      <Card style={styles.section}>
        <SectionLabel>Movement quality</SectionLabel>
        <View style={{ gap: 16, marginTop: 16 }}>
          {report.metrics.map((metric) => {
            // A negative pct means the joints were never visible enough to
            // judge — show that honestly instead of implying a zero score.
            const measured = metric.pct >= 0;
            return (
              <View key={metric.label}>
                <View style={styles.metricHeader}>
                  <Text style={font('bold', 12, { color: palette.ink })}>{metric.label}</Text>
                  <Text
                    style={font('extrabold', 12, {
                      color: measured ? metricColor(metric.pct) : palette.grey450,
                    })}
                  >
                    {measured ? `${metric.pct}%` : 'not measured'}
                  </Text>
                </View>
                <View style={styles.metricTrack}>
                  {measured ? (
                    <View
                      style={[
                        styles.metricFill,
                        { width: `${metric.pct}%`, backgroundColor: metricColor(metric.pct) },
                      ]}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.metricHeader}>
          <SectionLabel>Per-rep depth</SectionLabel>
          <Text style={font('bold', 10, { color: palette.grey600 })}>{reps} reps tracked</Text>
        </View>

        {report.bars.length > 0 ? (
          <View style={styles.chart}>
            {report.bars.map((bar, i) => (
              <View key={i} style={styles.barColumn}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${bar.height}%`,
                      backgroundColor: bar.fullDepth ? palette.green500 : palette.amber300,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        ) : (
          <Text style={[text.caption, { marginTop: 12 }]}>No reps were tracked this session.</Text>
        )}

        <View style={styles.legend}>
          <LegendDot color={palette.green500} label={`Full depth (${report.fullDepthReps})`} />
          <LegendDot color={palette.amber300} label={`Partial (${report.partialReps})`} />
        </View>
      </Card>

      <Card style={styles.tipCard}>
        <Text style={{ fontSize: 22 }}>💡</Text>
        <View style={{ flex: 1 }}>
          <Text style={font('extrabold', 13, { color: palette.ink })}>Coaching tip</Text>
          <Text style={font('semibold', 12, { color: '#476b56', marginTop: 4 })}>
            {report.tip}
          </Text>
        </View>
      </Card>

      <PrimaryButton
        label="Back to results"
        onPress={() => router.back()}
        colors={[palette.ink, palette.inkSoft]}
        style={{ marginTop: 20 }}
      />
    </Screen>
  );
}

function metricColor(pct: number): string {
  if (pct >= 80) return palette.green600;
  if (pct >= 60) return palette.amber500;
  return palette.red500;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={font('bold', 10, { color: palette.grey600 })}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, marginTop: 4 },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderRadius: radius['5xl'],
  },
  scoreSummary: {
    ...font('semibold', 12, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: 4,
    maxWidth: 150,
  },
  section: { padding: 16, marginTop: 16 },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricTrack: {
    height: 8,
    borderRadius: 5,
    backgroundColor: palette.dividerSoft,
    overflow: 'hidden',
  },
  metricFill: { height: '100%', borderRadius: 5 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 96, marginTop: 12 },
  barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 16,
    backgroundColor: palette.green50,
  },
});
