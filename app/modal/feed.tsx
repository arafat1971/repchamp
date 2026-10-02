import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dailyChallengeProgress } from '@/domain/dailyChallenge';
import { dailyTip, dayFeed, type FeedAction, type FeedCard } from '@/domain/dayFeed';
import { firstNameOf } from '@/domain/homeGreeting';
import { dayKey } from '@/domain/progression';
import { partnerRepsToday } from '@/domain/couple';
import { lightImpactHaptic, selectionHaptic } from '@/lib/feedback';
import { track } from '@/lib/analytics';
import { selectDaysTrainedThisWeek, selectStreak, selectTotalReps, useProfileStore } from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';

/**
 * Your day, as a feed: one full-screen idea at a time, swipe up for the next.
 * Built from the athlete's own numbers only (see `domain/dayFeed`), so the
 * format borrows from short-video feeds — low friction, one thing per screen,
 * a progress rail — without borrowing the filler.
 */
export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  const profile = useProfileStore();
  const couple = useCouple();
  const today = dayKey();

  const cards = useMemo(() => {
    const daily = dailyChallengeProgress(profile.sessions, today);
    const partner = couple.paired && couple.partner ? couple.partner : null;
    const repsToday = profile.sessions.filter((s) => s.day === today).reduce((n, s) => n + s.reps, 0);
    return dayFeed({
      firstName: firstNameOf(profile.displayName || profile.username),
      streak: selectStreak(profile),
      trainedToday: repsToday > 0,
      repsToday,
      totalReps: selectTotalReps(profile),
      daysThisWeek: selectDaysTrainedThisWeek(profile),
      weeklyGoal: profile.weeklyGoal,
      challenge: {
        name: daily.name,
        label: getExercise(daily.exercise).label,
        target: daily.target,
        best: daily.best,
        cleared: daily.cleared,
      },
      tip: dailyTip(
        today,
        (['push', 'squat', 'lunge', 'shoulder', 'stretch'] as const).map((id) => {
          const d = getExercise(id);
          return { label: d.label, tips: [d.coachingTip] };
        }),
      ),
      partner: partner
        ? { name: partner.displayName ?? 'Your partner', trainedToday: partnerRepsToday(partner, today).reps > 0 }
        : null,
    });
  }, [profile, couple.paired, couple.partner, today]);

  const act = (action: FeedAction, card: FeedCard) => {
    track('feed_cta', { card: card.id });
    switch (action) {
      case 'challenge':
        return router.replace('/modal/daily');
      case 'train':
        return router.replace({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
      case 'invite':
        return router.replace('/modal/couple-invite');
      case 'partner':
        return router.replace('/couple');
      default:
        return undefined;
    }
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.y / height);
          if (next !== index) {
            setIndex(next);
            selectionHaptic();
            track('feed_card_viewed', { card: cards[next]?.id ?? 'unknown', position: next });
          }
        }}
        renderItem={({ item, index: i }) => (
          <LinearGradient colors={item.colors} style={{ height, width }}>
            <View style={[styles.card, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 40 }]}>
              {i === index ? (
                <Animated.View entering={FadeInDown.duration(450)} style={styles.center}>
                  <Text style={styles.emoji}>{item.emoji}</Text>
                  <Text style={styles.kicker}>{item.kicker}</Text>
                  <Text style={styles.headline} adjustsFontSizeToFit numberOfLines={2}>
                    {item.headline}
                  </Text>
                  <Text style={styles.body}>{item.body}</Text>
                </Animated.View>
              ) : (
                <View style={styles.center} />
              )}
              <View style={styles.footer}>
                {item.cta ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      lightImpactHaptic();
                      act(item.action, item);
                    }}
                    style={styles.cta}
                  >
                    <Text style={styles.ctaText}>{item.cta}</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.hint}>{i < cards.length - 1 ? 'Swipe up ↑' : 'That’s your day'}</Text>
              </View>
            </View>
          </LinearGradient>
        )}
      />

      <View style={[styles.rail, { top: insets.top + 14 }]} pointerEvents="none">
        {cards.map((c, i) => (
          <View key={c.id} style={[styles.seg, i <= index && styles.segOn]} />
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        style={[styles.close, { top: insets.top + 30 }]}
        hitSlop={12}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  card: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center' },
  emoji: { fontSize: 64, marginBottom: 12 },
  kicker: font('extrabold', 13, { color: 'rgba(255,255,255,0.75)', letterSpacing: 1.4 }),
  headline: font('extrabold', 52, { color: '#fff', marginTop: 8, lineHeight: 58 }),
  body: font('semibold', 18, { color: 'rgba(255,255,255,0.9)', marginTop: 14, lineHeight: 26 }),
  footer: { alignItems: 'center', gap: 14 },
  cta: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  ctaText: font('extrabold', 17, { color: '#0B3D2A' }),
  hint: font('bold', 13, { color: 'rgba(255,255,255,0.7)' }),
  rail: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  segOn: { backgroundColor: '#fff' },
  close: { position: 'absolute', right: 18, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  closeText: font('bold', 16, { color: '#fff' }),
});
