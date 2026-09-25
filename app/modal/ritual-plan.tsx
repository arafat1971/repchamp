import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { HabitIcon } from '@/components/together/HabitIcon';
import { Card, PressableScale, PrimaryButton, Screen } from '@/components/ui';
import { CATALOG, PICKS, WALK_GOALS, effectivePlan, type HabitId } from '@/domain/ritual';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { selectionHaptic, successHaptic } from '@/lib/feedback';
import { setCoupleRitualPlan } from '@/services/coupleService';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * Choose your ritual: the three habits you tick and the walk goal. Water,
 * walking and exercise stay — the app counts those itself. One plan for the
 * couple: saving it here changes it for both of you, so the table always
 * compares the same six habits.
 */
export default function RitualPlanScreen() {
  const router = useRouter();
  const { couple, partner, me } = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const current = effectivePlan(me?.ritualPlan, partner?.ritualPlan);
  const [picks, setPicks] = useState<HabitId[]>(current.picks);
  const [walkGoal, setWalkGoal] = useState<number>(current.walkGoal);
  const [saving, setSaving] = useState(false);
  const partnerName = partner?.displayName?.trim() || 'your partner';

  const toggle = (id: HabitId) => {
    selectionHaptic();
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < PICKS ? [...p, id] : [...p.slice(1), id]));
  };

  const changed = walkGoal !== current.walkGoal || [...picks].sort().join() !== [...current.picks].sort().join();
  const ready = picks.length === PICKS;

  const save = async () => {
    if (!couple || !uid || !ready || saving) return;
    setSaving(true);
    try {
      await setCoupleRitualPlan(couple.id, uid, { picks, walkGoal });
      track('ritual_plan_saved', { picks: picks.join(','), walkGoal });
      successHaptic();
      router.back();
    } catch (error) {
      captureError(error);
      showDialog({
        title: 'Not saved',
        message: error instanceof Error ? error.message : 'Check your connection and try again.',
        tone: 'danger',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ModalHeader title="Your ritual" subtitle={`Shared with ${partnerName}`} />

      <Text style={styles.lead}>Water, walking and exercise count themselves. Pick the three you tick each day.</Text>

      <Card style={styles.card}>
        {CATALOG.map((h, i) => {
          const on = picks.includes(h.id);
          return (
            <PressableScale
              key={h.id}
              onPress={() => toggle(h.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${h.label}, ${h.hint}`}
              style={[styles.row, i > 0 && styles.rule]}
            >
              <View style={[styles.icon, on && styles.iconOn]}>
                <HabitIcon id={h.id} color={on ? palette.white : palette.ink} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.label}>{h.label}</Text>
                <Text style={styles.hint}>{h.hint}</Text>
              </View>
              <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
            </PressableScale>
          );
        })}
      </Card>
      <Text style={styles.count}>
        {picks.length} of {PICKS} chosen
      </Text>

      <Text style={styles.section}>Walk goal</Text>
      <View style={styles.goals}>
        {WALK_GOALS.map((g) => (
          <PressableScale
            key={g}
            onPress={() => {
              selectionHaptic();
              setWalkGoal(g);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: walkGoal === g }}
            style={[styles.goal, walkGoal === g && styles.goalOn]}
          >
            <Text style={[styles.goalText, walkGoal === g && styles.goalTextOn]}>{g.toLocaleString('en-US')} steps</Text>
          </PressableScale>
        ))}
      </View>

      <PrimaryButton
        label={saving ? 'Saving…' : `Save for both of us`}
        onPress={() => void save()}
        disabled={!ready || !changed || saving}
        style={styles.save}
      />
      <Text style={styles.note}>
        {partnerName === 'your partner' ? 'Your partner' : partnerName} sees the new list straight away. Ticks already made today stay.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...font('medium', 15, { color: palette.slate500 }), marginBottom: 14 },
  card: { paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.track, alignItems: 'center', justifyContent: 'center' },
  iconOn: { backgroundColor: palette.ink },
  copy: { flex: 1 },
  label: font('semibold', 15, { color: palette.ink }),
  hint: { ...font('regular', 12, { color: palette.slate500 }), marginTop: 1 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: palette.track, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: palette.ink, borderColor: palette.ink },
  tick: font('bold', 13, { color: palette.white }),
  count: { marginTop: 8, textAlign: 'right', ...font('medium', 13, { color: palette.slate500 }) },
  section: { marginTop: 22, marginBottom: 10, ...font('extrabold', 18, { color: palette.ink }) },
  goals: { flexDirection: 'row', gap: 8 },
  goal: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.divider,
  },
  goalOn: { backgroundColor: palette.ink, borderColor: palette.ink },
  goalText: font('semibold', 14, { color: palette.ink }),
  goalTextOn: { color: palette.white },
  save: { marginTop: 24 },
  note: { marginTop: 10, textAlign: 'center', ...font('regular', 12.5, { color: palette.slate500 }) },
});
