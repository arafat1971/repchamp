import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { FlameIcon } from '@/components/home/Icons';
import { Badge, Card, Chevron, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { reservedControlHeight } from '@/theme/fontScale';
import { font, scaleForRole, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const MOBILITY = [
  { id: 'shoulder', emoji: '🙆', title: 'Shoulder rolls', detail: '2 min · loosen up' },
  { id: 'stretch', emoji: '🤸', title: 'Full-body stretch', detail: '5 min · guided flow' },
  { id: 'walk', emoji: '🚶', title: 'Easy walk', detail: '15 min · active recovery' },
] as const;

export default function RestDayScreen() {
  const { fontScale } = useWindowDimensions();
  const router = useRouter();
  const streak = selectStreak(useProfileStore());

  return (
    <Screen>
      <ModalHeader title="Rest Day" />

      <LinearGradient colors={gradients.info} style={[styles.hero, shadow.info]}>
        <View style={styles.heroChip}>
          <Text style={font('semibold', 12, { color: palette.white })}>
            Streak safe today
          </Text>
        </View>
        <Text style={font('extrabold', 27, { color: palette.white, marginTop: 12 })}>
          Take the day to recover
        </Text>
        <Text style={styles.heroCopy}>
          Rest helps the next session, and a rest day doesn’t break your streak.
        </Text>
      </LinearGradient>

      <Card style={styles.streakCard}>
        <View style={styles.streakIcon}>
          <FlameIcon size={20} color={palette.amber800} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.cardTitle}>
            {streak}-day streak protected
          </Text>
          <Text style={text.caption}>Rest days don&apos;t break your streak</Text>
        </View>
        <Badge label="Active" />
      </Card>

      <Eyebrow style={{ marginBottom: 8 }}>Optional light mobility</Eyebrow>
      <View style={{ gap: 8 }}>
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
        style={[styles.doneButton, { minHeight: reservedControlHeight(54, fontScale) }]}
      >
        <Text style={font('extrabold', 15, { color: palette.blue700 })} {...scaleForRole('control')}>
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
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius['2xl'],
  },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    maxWidth: 250,
    marginTop: 4,
  },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginBottom: 16 },
  streakIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.red100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  mobilityIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: palette.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    ...shadow.card,
  },
});
