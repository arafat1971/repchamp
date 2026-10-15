import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn, useReducedMotion } from 'react-native-reanimated';

import { StepsTogether } from '@/components/home/StepsTogether';
import { PressableScale } from '@/components/ui';
import { StepsWidgetPreview } from '@/components/widget/StepsWidgetPreview';
import { track } from '@/lib/analytics';
import { selectionHaptic, successHaptic } from '@/lib/feedback';
import { isWidgetSupported, requestPinWidget } from '@/services/partnerWidget';
import { readStepsToday, requestAndroidStepPermission, setStepServiceEnabled } from '@/services/pedometer';
import { useSettingsStore } from '@/state/settingsStore';
import { useStepsStore } from '@/state/stepsStore';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { Aurora, PrimaryButton, ScreenHead, springIn } from './ios';

const GOALS = [6000, 8000, 10000, 12000] as const;
const DEMO_GOAL = 8000;

/**
 * Onboarding: "Step count, together".
 *
 * The two-ring race plays on its own — a pretend partner and you, steps
 * landing live — so the feature is felt before it is explained. Then the
 * athlete picks a daily goal, turns on step counting (the one real permission
 * here), and can drop the Steps widget on their home screen.
 *
 * Labelled a preview: there is no partner yet and nothing is sent.
 */
export function StepsTogetherStep({ onNext }: { onNext: () => void }) {
  const reduced = useReducedMotion();
  const goal = useStepsStore((s) => s.goal);
  const setGoal = useStepsStore((s) => s.setGoal);
  const serviceOn = useSettingsStore((s) => s.stepCounting);
  const [counting, setCounting] = useState<'idle' | 'asking' | 'on' | 'denied'>('idle');
  const [widgetAsked, setWidgetAsked] = useState(false);

  /* The demo race: steps land on one side or the other every beat. */
  const [demo, setDemo] = useState({ me: 3120, them: 3480 });
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setDemo((d) => {
        if (d.me >= DEMO_GOAL && d.them >= DEMO_GOAL) return { me: 3120, them: 3480 };
        const who = Math.random() < 0.5 ? 'me' : 'them';
        const add = 120 + Math.round(Math.random() * 260);
        return { ...d, [who]: Math.min(DEMO_GOAL + 400, d[who] + add) };
      });
    }, 1500);
    return () => clearInterval(id);
  }, [reduced]);

  const pickGoal = (g: number) => {
    selectionHaptic();
    setGoal(g);
    track('steps_goal_changed', { goal: g, source: 'onboarding' });
  };

  const turnOn = async () => {
    setCounting('asking');
    let granted = false;
    if (Platform.OS === 'android') {
      granted = await requestAndroidStepPermission();
      if (granted && serviceOn) void setStepServiceEnabled(true);
    } else {
      /* iOS asks for motion access on the first read. */
      const read = await readStepsToday(goal);
      granted = read.status === 'ready';
    }
    if (granted) successHaptic();
    setCounting(granted ? 'on' : 'denied');
  };

  const addWidget = async () => {
    selectionHaptic();
    await requestPinWidget('steps');
    setWidgetAsked(true);
  };

  return (
    <View style={styles.step}>
      <Aurora tint={palette.amber400} second={palette.purple400} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenHead
          eyebrow="STEP TOGETHER"
          tint={palette.amber50}
          title={'Every step,\nside by side'}
          body="Your steps and your partner’s race live. One team goal, a nudge when they fall behind, and a cheer when they move."
        />

        <Animated.View entering={springIn(3)} style={styles.demo}>
          <View style={styles.previewTag}>
            <Text style={styles.previewTagText}>PREVIEW</Text>
          </View>
          <StepsTogether
            mine={demo.me}
            myGoal={DEMO_GOAL}
            me={{ name: 'You' }}
            partner={{ name: 'Partner', steps: demo.them }}
            theirGoal={DEMO_GOAL}
            onCheer={() => true}
          />
        </Animated.View>

        <Animated.View entering={springIn(4)}>
          <Text style={styles.label}>YOUR DAILY GOAL</Text>
          <View style={styles.goals}>
            {GOALS.map((g) => (
              <PressableScale
                key={g}
                onPress={() => pickGoal(g)}
                accessibilityRole="radio"
                accessibilityState={{ selected: goal === g }}
                style={[styles.goal, goal === g && styles.goalOn]}
              >
                <Text style={[styles.goalText, goal === g && styles.goalTextOn]}>{(g / 1000).toFixed(0)}k</Text>
              </PressableScale>
            ))}
          </View>
          <Text style={styles.hint}>
            {goal <= 6000 ? 'A gentle start' : goal <= 8000 ? 'The sweet spot for most people' : goal <= 10000 ? 'The classic 10k' : 'Serious walker'}
          </Text>
        </Animated.View>

        {isWidgetSupported() ? (
          <Animated.View entering={springIn(5)} style={styles.widget}>
            <StepsWidgetPreview width={300} />
            <PressableScale onPress={() => void addWidget()} accessibilityRole="button" style={styles.widgetBtn}>
              <Text style={styles.widgetBtnText}>{widgetAsked ? '✓ Widget offered — check your home screen' : '＋ Add the Steps widget'}</Text>
            </PressableScale>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {counting === 'on' ? (
          <Animated.View entering={ZoomIn.duration(300)} style={styles.done}>
            <Text style={styles.doneText}>✓ Step counting is on</Text>
          </Animated.View>
        ) : counting === 'denied' ? (
          <Animated.View entering={FadeIn.duration(240)} style={styles.denied}>
            <Text style={styles.deniedText}>No problem — you can turn it on later from the Steps card on Home.</Text>
          </Animated.View>
        ) : null}
        {counting === 'on' || counting === 'denied' ? (
          <PrimaryButton label="Continue" onPress={onNext} />
        ) : (
          <PrimaryButton
            label={counting === 'asking' ? 'Asking…' : 'Turn on step counting'}
            disabled={counting === 'asking'}
            onPress={() => void turnOn()}
          />
        )}
        {counting === 'idle' ? (
          <PressableScale onPress={onNext} accessibilityRole="button" style={styles.later}>
            <Text style={styles.laterText}>Maybe later</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 16 },
  demo: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    shadowColor: '#C2410C',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  previewTag: {
    position: 'absolute',
    top: 10,
    right: 12,
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 2,
  },
  previewTagText: { ...font('bold', 9.5, { color: '#6C6C70' }), letterSpacing: 1.2 },
  label: { ...font('bold', 11, { color: '#6C6C70', marginTop: 20 }), letterSpacing: 1.6, textAlign: 'center' },
  goals: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  goal: { minWidth: 64, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(118,118,128,0.12)', alignItems: 'center' },
  goalOn: { backgroundColor: '#FF6B2C' },
  goalText: font('extrabold', 15, { color: '#1C1C1E' }),
  goalTextOn: { color: '#FFFFFF' },
  hint: { ...font('medium', 12.5, { color: '#6C6C70', marginTop: 8 }), textAlign: 'center' },
  widget: { alignItems: 'center', marginTop: 20, gap: 10 },
  widgetBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,107,44,0.12)' },
  widgetBtnText: font('bold', 13, { color: '#C2410C' }),
  footer: { paddingHorizontal: 20, paddingBottom: 24, gap: 6 },
  done: { alignSelf: 'center', backgroundColor: palette.green50, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 6 },
  doneText: font('extrabold', 13, { color: palette.green700 }),
  denied: { backgroundColor: '#f1f5f9', borderRadius: 14, padding: 12, marginBottom: 6 },
  deniedText: { ...font('semibold', 12.5, { color: palette.ink }), textAlign: 'center' },
  later: { alignItems: 'center', paddingVertical: 10 },
  laterText: font('bold', 13, { color: palette.grey600 }),
});
