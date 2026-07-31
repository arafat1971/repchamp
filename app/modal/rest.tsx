import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Badge, Card, Chevron, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const MOBILITY = [
  { id: 'shoulder', emoji: '🙆', title: 'Shoulder rolls', detail: '2 min · loosen up' },
  { id: 'stretch', emoji: '🤸', title: 'Full-body stretch', detail: '5 min · guided flow' },
  { id: 'walk', emoji: '🚶', title: 'Easy walk', detail: '15 min · active recovery' },
] as const;

export default function RestDayScreen() {
  const router = useRouter();
  const streak = selectStreak(useProfileStore());

  return (
    <Screen>
      <ModalHeader title="Rest Day" />

      <LinearGradient colors={gradients.info} style={[styles.hero, shadow.info]}>
        <Text style={styles.heroWatermark}>🧘</Text>
        <View style={styles.heroChip}>
          <Text style={font('extrabold', 10, { color: palette.white })}>
            🔥 STREAK SAFE TODAY
          </Text>
        </View>
        <Text style={font('extrabold', 27, { color: palette.white, marginTop: 14 })}>
          Take the day to recover
        </Text>
        <Text style={styles.heroCopy}>
          A light day now means bigger gains next session — and your streak stays alive.
        </Text>
      </LinearGradient>

      <Card style={styles.streakCard}>
        <View style={styles.streakIcon}>
          <Text style={{ fontSize: 22 }}>🔥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.cardTitle}>
            {streak}-day streak protected
          </Text>
          <Text style={text.caption}>Rest days don&apos;t break your streak</Text>
        </View>
        <Badge label="Active" />
      </Card>

      <Eyebrow style={{ marginBottom: 10 }}>OPTIONAL LIGHT MOBILITY</Eyebrow>
      <View style={{ gap: 10 }}>
        {MOBILITY.map((item) => (
          <PressableScale
            key={item.id}
            onPress={() => router.push({ pathname: '/modal/mobility', params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <Card style={styles.mobilityRow}>
              <View style={styles.mobilityIcon}>
                <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={text.cardTitle}>{item.title}</Text>
                <Text style={text.caption}>{item.detail}</Text>
              </View>
              <Chevron />
            </Card>
          </PressableScale>
        ))}
      </View>

      <PressableScale
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Got it, resting today"
        style={styles.doneButton}
      >
        <Text style={font('extrabold', 15, { color: palette.blue700 })}>
          Got it — resting today
        </Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius['6xl'], padding: 24, overflow: 'hidden', marginBottom: 16 },
  heroWatermark: { position: 'absolute', right: -14, top: -12, fontSize: 118, opacity: 0.16 },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    maxWidth: 250,
    marginTop: 4,
  },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, marginBottom: 16 },
  streakIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.red100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobilityRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  mobilityIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: palette.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    height: 54,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    ...shadow.card,
  },
});
