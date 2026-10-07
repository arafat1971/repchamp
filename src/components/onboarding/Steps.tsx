import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { PurchasesPackage } from 'react-native-purchases';

import { PressableScale, Avatar } from '@/components/ui';
import { YogaGlyph } from '@/components/YogaGlyph';
import { captureError } from '@/lib/crash';
import { selectionHaptic } from '@/lib/feedback';
import { fetchOffering, isPurchasesConfigured, sortPackagesForPaywall } from '@/services/purchases';
import { formatMoney, perSession, yearlySavingPercent } from '@/domain/priceMath';
import type { Circle } from '@/domain/onboardingNav';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import {
  Aurora,
  ChoiceRow,
  ChoiceTile,
  InsetGroup,
  InsetRow,
  PrimaryButton,
  ScreenHead,
  SpringCheck,
  StepScroll,
  springIn,
  useCommitChoice,
} from './ios';

/**
 * The screens that ask what the athlete wants, and show them what answers it.
 *
 * Each question is one tap, and each answer is used: it is shown back later
 * ("you said you want a partner"), and the ones about company and training
 * style decide which pitch screens appear at all. They are short on purpose —
 * a headline, at most one line, then the choices — because a question that
 * needs reading is a question people skip.
 */

/* ------------------------------------------------------------------------- */
/* Questions                                                                  */
/* ------------------------------------------------------------------------- */

export const FEELINGS = [
  { id: 'stuck', emoji: '😩', label: 'Stuck', sub: 'I keep starting over' },
  { id: 'meh', emoji: '😐', label: 'Not great', sub: 'I do some, never enough' },
  { id: 'ok', emoji: '🙂', label: 'Decent', sub: 'I want more from it' },
  { id: 'strong', emoji: '💪', label: 'Strong', sub: 'I want to level up' },
] as const;

/** One tap, a feeling. The answer is quoted back on the plan and the price screens. */
export function FeelStep({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { picked, choose } = useCommitChoice<string>(onSelect, selected);
  return (
    <View style={styles.step}>
      <Aurora tint={palette.amber300} second={palette.green400} />
      <StepScroll>
        <ScreenHead
          eyebrow="BE HONEST"
          tint={palette.amber500}
          title={'How do you feel about\nyour fitness?'}
          body="No wrong answer. It shapes your plan."
        />
        <View style={styles.rows}>
          {FEELINGS.map((f, i) => (
            <ChoiceRow
              key={f.id}
              emoji={f.emoji}
              label={f.label}
              sub={f.sub}
              selected={picked === f.id}
              dimmed={picked !== null && picked !== f.id}
              index={i}
              onPress={() => choose(f.id)}
            />
          ))}
        </View>
      </StepScroll>
    </View>
  );
}

export const CIRCLES = [
  { id: 'solo', emoji: '🎯', label: 'Just me', hint: 'Quiet focus', tint: palette.green50 },
  { id: 'partner', emoji: '👥', label: 'My partner', hint: 'One shared streak', tint: palette.amber50 },
  { id: 'friends', emoji: '🤝', label: 'Friends', hint: 'Friendly rivalry', tint: palette.blue50 },
  { id: 'coach', emoji: '🤖', label: 'AI coach', hint: 'Live form tips', tint: palette.purple100 },
] as const satisfies readonly { id: Circle; emoji: string; label: string; hint: string; tint: string }[];

/** Who they want with them. Decides which pitch follows. */
export function TrainWithStep({
  selected,
  onSelect,
}: {
  selected: Circle | null;
  onSelect: (id: Circle) => void;
}) {
  const { picked, choose } = useCommitChoice<Circle>(onSelect, selected);
  return (
    <View style={styles.step}>
      <Aurora tint={palette.purple400} second={palette.green400} />
      <StepScroll>
        <ScreenHead
          title={"Who's in your corner?"}
          body="Training with someone makes skipping harder."
        />
        <View style={styles.grid}>
          {CIRCLES.map((c, i) => (
            <ChoiceTile
              key={c.id}
              emoji={c.emoji}
              label={c.label}
              hint={c.hint}
              tint={c.tint}
              selected={picked === c.id}
              dimmed={picked !== null && picked !== c.id}
              index={i}
              onPress={() => choose(c.id)}
            />
          ))}
        </View>
      </StepScroll>
    </View>
  );
}

export const STYLES = [
  { id: 'strength', emoji: '💪', label: 'Strength', hint: 'Push-ups, squats', tint: palette.green50 },
  { id: 'yoga', emoji: '🧘', label: 'Yoga', hint: 'Guided flows', tint: palette.purple100 },
  { id: 'mind', emoji: '🧠', label: 'Mind', hint: 'Breathing, calm', tint: palette.blue50 },
  { id: 'mobility', emoji: '🤸', label: 'Mobility', hint: 'Loosen up', tint: palette.amber50 },
] as const;

/** Pick any. Unlike the single-choice screens this one waits for a button. */
export function StylesStep({
  selected,
  onChange,
  onNext,
}: {
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  onNext: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    selectionHaptic();
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <View style={styles.step}>
      <Aurora tint={palette.green400} second={palette.purple400} />
      <StepScroll>
        <ScreenHead title="What do you want to train?" body="Pick any. You can change it later." />
        <View style={styles.grid}>
          {STYLES.map((o, i) => {
            const on = selected.includes(o.id);
            return (
              <Animated.View key={o.id} entering={springIn(i + 2, 80)} style={styles.tileWrap}>
                <PressableScale
                  onPress={() => toggle(o.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={o.label}
                  style={{ flex: 1 }}
                >
                  <View style={[styles.tile, on && styles.tileOn]}>
                    <View style={[styles.bubble, { backgroundColor: on ? palette.green100 : o.tint }]}>
                      <Text style={{ fontSize: 34 }} allowFontScaling={false}>
                        {o.emoji}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.tileLabel}>{o.label}</Text>
                      <Text style={styles.tileHint}>{o.hint}</Text>
                    </View>
                    {on ? (
                      <View style={styles.tileCheck}>
                        <SpringCheck size={22} />
                      </View>
                    ) : null}
                  </View>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      </StepScroll>
      <PrimaryButton
        label={selected.length === 0 ? 'Pick at least one' : 'Continue'}
        onPress={() => onNext([...selected])}
        disabled={selected.length === 0}
      />
    </View>
  );
}

export const WHENS = [
  { id: 'morning', emoji: '☀️', label: 'Morning', sub: 'Before the day takes over' },
  { id: 'afternoon', emoji: '🌤️', label: 'Afternoon', sub: 'A midday reset' },
  { id: 'evening', emoji: '🌙', label: 'Evening', sub: 'To close the day' },
  { id: 'varies', emoji: '🔀', label: 'It varies', sub: 'Just nudge me once' },
] as const;

/** When they train, so the one reminder lands when they will act on it. */
export function WhenStep({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { picked, choose } = useCommitChoice<string>(onSelect, selected);
  return (
    <View style={styles.step}>
      <Aurora tint={palette.amber300} second={palette.blue400} />
      <StepScroll>
        <ScreenHead
          title={'When do you\ntrain best?'}
          body="One nudge a day, then. Never more."
        />
        <View style={styles.rows}>
          {WHENS.map((w, i) => (
            <ChoiceRow
              key={w.id}
              emoji={w.emoji}
              label={w.label}
              sub={w.sub}
              selected={picked === w.id}
              dimmed={picked !== null && picked !== w.id}
              index={i}
              onPress={() => choose(w.id)}
            />
          ))}
        </View>
      </StepScroll>
    </View>
  );
}

/* ------------------------------------------------------------------------- */
/* Pitches                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * The board, for someone who wants friends. Ada and Zara are the app's AI
 * rivals and are labelled as such — they are what fills the board before real
 * friends have joined, never passed off as people.
 */
export function FriendsPitch({ username, onNext }: { username: string; onNext: () => void }) {
  const you = username || 'You';
  const rows = [
    { name: 'Zara', ai: 'zheng', xp: 1240, tag: 'AI' },
    { name: you, ai: undefined, xp: 1180, tag: 'YOU' },
    { name: 'Ada', ai: 'adrian', xp: 960, tag: 'AI' },
  ] as const;
  const top = 1240;
  return (
    <View style={styles.step}>
      <Aurora tint={palette.blue400} second={palette.green400} />
      <StepScroll>
        <ScreenHead
          eyebrow="FRIENDS"
          tint={palette.blue500}
          title={'Friends make\nit stick'}
          body="Race them live. See who showed up."
        />
        <Animated.View entering={springIn(3)} style={styles.board}>
          <Text style={styles.boardCaption}>THIS WEEK · EXAMPLE</Text>
          {rows.map((r, i) => (
            <View key={r.name} style={[styles.boardRow, r.tag === 'YOU' && styles.boardRowYou]}>
              <Text style={styles.boardRank}>{i + 1}</Text>
              <Avatar
                initial={r.name.charAt(0).toUpperCase()}
                ai={r.ai}
                size={40}
                background={r.tag === 'YOU' ? palette.green50 : palette.purple100}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.boardNameRow}>
                  <Text style={styles.boardName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <View style={[styles.tag, r.tag === 'YOU' && styles.tagYou]}>
                    <Text style={[styles.tagText, r.tag === 'YOU' && styles.tagTextYou]}>{r.tag}</Text>
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.round((r.xp / top) * 100)}%` },
                      r.tag === 'YOU' && { backgroundColor: palette.green600 },
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.boardXp}>{r.xp.toLocaleString()}</Text>
            </View>
          ))}
        </Animated.View>
        <InsetGroup style={{ marginTop: 16 }}>
          <InsetRow glyph="⚔️" tile={palette.blue50} title="Live duels" sub="Rep for rep, in real time" index={0} />
          <InsetRow glyph="👋" tile={palette.amber50} title="One-tap nudges" sub="Pull a friend back in" index={1} last />
        </InsetGroup>
      </StepScroll>
      <PrimaryButton label="Continue" onPress={onNext} />
    </View>
  );
}

/** A slow pulse, so the yoga screen feels like breathing before it says a word about it. */
function BreathRing({ children }: { children: ReactNode }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [t]);
  const outer = useAnimatedStyle(() => ({
    opacity: 0.35 - t.value * 0.2,
    transform: [{ scale: 1 + t.value * 0.18 }],
  }));
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 0.06 }] }));
  return (
    <View style={styles.breathStage}>
      <Animated.View style={[styles.breathOuter, outer]} />
      <Animated.View style={[styles.breathInner, inner]}>{children}</Animated.View>
    </View>
  );
}

/** For someone who picked yoga. Honest about how it works: timed and guided, not camera-counted. */
export function YogaPitch({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.step}>
      <Aurora tint={palette.purple400} second={palette.green400} />
      <StepScroll>
        <ScreenHead
          eyebrow="YOGA"
          tint={palette.purple500}
          title={'Slow down.\nCome back stronger.'}
          body="Guided flows for the days in between."
        />
        <Animated.View entering={FadeInDown.delay(200).duration(420)}>
          <BreathRing>
            <YogaGlyph pose="warrior-2" size={96} color={palette.purple600} />
          </BreathRing>
        </Animated.View>
        <InsetGroup style={{ marginTop: 8 }}>
          <InsetRow glyph="⏱️" tile={palette.purple100} title="We keep the clock" sub="You just move and breathe" index={0} />
          <InsetRow glyph="🌬️" tile={palette.blue50} title="Guided breathing" sub="Two minutes to reset" index={1} last />
        </InsetGroup>
      </StepScroll>
      <PrimaryButton label="Continue" onPress={onNext} />
    </View>
  );
}

/* ------------------------------------------------------------------------- */
/* Recap                                                                      */
/* ------------------------------------------------------------------------- */

const CIRCLE_LINE: Record<Circle, string> = {
  solo: 'On your own',
  partner: 'With your partner',
  friends: 'With friends',
  coach: 'With an AI coach',
};
const WHEN_LINE: Record<string, string> = {
  morning: 'Mornings',
  afternoon: 'Afternoons',
  evening: 'Evenings',
};

/**
 * Their own answers, handed back as the shape of the plan.
 *
 * Seeing "built from what you told us" is what turns a questionnaire into a
 * plan made for them — and a person is far more likely to follow through on a
 * plan they can see they wrote. Only answers actually given are shown.
 */
export function AnswerChips({
  feel,
  circle,
  styleIds,
  when,
}: {
  feel: string | null;
  circle: Circle | null;
  styleIds: readonly string[];
  when: string | null;
}) {
  const chips: string[] = [];
  const f = FEELINGS.find((x) => x.id === feel);
  if (f) chips.push(`${f.emoji} Starting ${f.label.toLowerCase()}`);
  if (circle) chips.push(`${CIRCLES.find((c) => c.id === circle)?.emoji ?? ''} ${CIRCLE_LINE[circle]}`.trim());
  const picked = STYLES.filter((o) => styleIds.includes(o.id));
  if (picked.length > 0) chips.push(picked.map((o) => o.label).join(' · '));
  if (when && WHEN_LINE[when]) chips.push(`🕒 ${WHEN_LINE[when]}`);
  if (chips.length === 0) return null;
  return (
    <Animated.View entering={springIn(2)} style={styles.recap}>
      <Text style={styles.recapCaption}>BUILT FROM WHAT YOU TOLD US</Text>
      <View style={styles.recapChips}>
        {chips.map((c) => (
          <View key={c} style={styles.recapChip}>
            <Text style={styles.recapChipText}>{c}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------------- */
/* Price                                                                      */
/* ------------------------------------------------------------------------- */

/** The store's yearly and monthly plans, or nulls while loading / when billing is unavailable. */
export function useOnboardingPrices(): {
  loaded: boolean;
  yearly: { amount: number; currency: string } | null;
  monthly: { amount: number; currency: string } | null;
} {
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  useEffect(() => {
    if (!isPurchasesConfigured()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPackages([]);
      return;
    }
    let cancelled = false;
    fetchOffering()
      .then((offering) => {
        if (!cancelled) setPackages(sortPackagesForPaywall(offering?.availablePackages ?? []));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          captureError(error);
          setPackages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const point = (type: string) => {
    const p = packages?.find((x) => x.packageType === type);
    return p ? { amount: p.product.price, currency: p.product.currencyCode } : null;
  };
  return { loaded: packages !== null, yearly: point('ANNUAL'), monthly: point('MONTHLY') };
}

/**
 * Why Pro costs what it costs, in the athlete's own terms.
 *
 * The one number it leads with is the yearly price divided by the sessions
 * *they said* they would train — their commitment, divided into the bill they
 * are about to see. Nothing is invented: no struck-through "normal price", no
 * countdown, no made-up comparison. If the store cannot be reached the number
 * is simply left out and the reasons stand alone.
 */
export function PriceWhyStep({
  username,
  weeklyGoal,
  circle,
  onNext,
}: {
  username: string;
  weeklyGoal: number;
  circle: Circle | null;
  onNext: () => void;
}) {
  const { yearly, monthly } = useOnboardingPrices();
  const session = yearly ? perSession(yearly.amount, weeklyGoal) : null;
  const saving = yearly && monthly ? yearlySavingPercent(monthly.amount, yearly.amount) : 0;
  const days = `${weeklyGoal} day${weeklyGoal === 1 ? '' : 's'} a week`;
  const together =
    circle === 'partner'
      ? { title: 'Your partner is counting on you', sub: 'A shared streak only works with both of you' }
      : circle === 'friends'
        ? { title: 'Train with your friends', sub: 'Live duels, boards and nudges' }
        : { title: 'Train together', sub: 'Shared streaks, live duels, nudges' };
  return (
    <View style={styles.step}>
      <Aurora tint={palette.green400} second={palette.amber300} />
      <StepScroll>
        <ScreenHead
          eyebrow="WHY PRO"
          tint={palette.green500}
          title={username ? `${username}, here's\nwhat it costs` : "Here's what\nit costs"}
        />
        {session !== null && yearly ? (
          <Animated.View entering={springIn(2)} style={styles.priceCard}>
            <Text style={styles.priceBig}>{formatMoney(session, yearly.currency)}</Text>
            <Text style={styles.priceUnit}>a session</Text>
            <Text style={styles.priceSub}>
              at {days}, billed yearly
              {saving > 0 ? ` · ${saving}% less than monthly` : ''}
            </Text>
          </Animated.View>
        ) : null}
        <InsetGroup style={{ marginTop: 16 }}>
          <InsetRow glyph="🔓" tile={palette.green100} title="Everything unlocked" sub="Every exercise, programme and flow" index={0} />
          <InsetRow glyph="👥" tile={palette.amber50} title={together.title} sub={together.sub} index={1} />
          <InsetRow glyph="🛡️" tile={palette.amber50} title="Keep what you build" sub="Streak, league and records on every phone" index={2} last />
        </InsetGroup>
        <Animated.View entering={springIn(6)} style={styles.note}>
          <Text style={styles.noteText}>
            🔥 Miss a week and your league resets to Bronze. Pro is how you keep the streak.
          </Text>
        </Animated.View>
      </StepScroll>
      <PrimaryButton label="See plans" onPress={onNext} />
      <Text style={styles.fine}>Cancel anytime in Google Play settings.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flex: 1, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 40 },
  rows: { gap: 12, marginTop: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 26 },
  tileWrap: { width: '48%', flexGrow: 1, minHeight: 188 },
  tile: {
    flex: 1,
    padding: 16,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'space-between',
  },
  tileOn: { borderColor: palette.green600, backgroundColor: palette.green50 },
  bubble: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { ...font('extrabold', 17, { color: palette.ink }), letterSpacing: -0.4, marginTop: 10 },
  tileHint: { ...font('medium', 12, { color: palette.grey600 }), lineHeight: 16 },
  tileCheck: { position: 'absolute', top: 12, right: 12 },

  board: {
    marginTop: 22,
    padding: 16,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#ffffff',
    gap: 6,
  },
  boardCaption: { ...font('bold', 11, { color: palette.grey600 }), letterSpacing: 1.4, marginBottom: 4 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 16 },
  boardRowYou: { backgroundColor: palette.green50 },
  boardRank: { ...font('extrabold', 15, { color: palette.grey600 }), width: 16, textAlign: 'center' },
  boardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boardName: { ...font('extrabold', 15, { color: palette.ink }), flexShrink: 1 },
  boardXp: { ...font('extrabold', 14, { color: palette.ink }) },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: palette.purple100 },
  tagYou: { backgroundColor: palette.green100 },
  tagText: { ...font('extrabold', 9, { color: palette.purple600 }), letterSpacing: 0.6 },
  tagTextYou: { color: palette.green700 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(60,60,67,0.1)', marginTop: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: palette.purple400 },

  breathStage: { height: 230, alignItems: 'center', justifyContent: 'center' },
  breathOuter: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: palette.purple100,
  },
  breathInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  priceCard: {
    marginTop: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  priceBig: { ...font('extrabold', 44, { color: palette.green700 }), letterSpacing: -1.4, lineHeight: 50 },
  priceUnit: { ...font('bold', 15, { color: palette.ink }), marginTop: 2 },
  priceSub: { ...font('regular', 14, { color: palette.grey600 }), marginTop: 8, textAlign: 'center' },
  note: { marginTop: 14, padding: 14, borderRadius: 18, borderCurve: 'continuous', backgroundColor: palette.amber50 },
  noteText: { ...font('medium', 14, { color: palette.ink }), lineHeight: 20 },
  recap: { marginTop: 18, alignItems: 'center' },
  recapCaption: { ...font('bold', 11, { color: palette.grey600 }), letterSpacing: 1.3 },
  recapChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  recapChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  recapChipText: font('semibold', 13, { color: palette.ink }),
  fine: { ...font('regular', 12.5, { color: palette.grey600 }), textAlign: 'center', marginTop: 10 },
});
