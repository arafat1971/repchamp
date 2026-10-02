import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { ProgressSection } from '@/components/ProgressSection';
import { PressableScale, ProgressBar, Screen } from '@/components/ui';
import { HomeSectionHeader, homeSectionLink } from '@/components/home/HomeSectionHeader';
import { StaggerIn } from '@/components/motion';
import { ACHIEVEMENTS, evaluateAchievements } from '@/domain/achievements';
import {
  selectBestStreak,
  selectDuelsWon,
  selectLevel,
  selectTotalReps,
  selectWeeklyXp,
  selectWinRate,
  useProfileStore,
} from '@/state/profileStore';
import { useTabView } from '@/lib/useTabView';
import { useIsPro } from '@/state/proStore';
import { useAuthStore } from '@/state/authStore';
import { showDialog } from '@/state/useDialog';
import { deleteAvatar } from '@/services/userService';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow, surfaceShadow } from '@/theme/tokens';

/**
 * The stats strip's icons: line glyphs in the same weight as History and
 * Badges, each on its own tint so the four numbers are told apart at a glance.
 */
const STAT_ICONS = {
  // Reps: a dumbbell.
  reps: {
    color: palette.green700,
    tint: palette.green50,
    paths: ['M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11'],
  },
  // Duels won: a trophy.
  duels: {
    color: palette.amber800,
    tint: palette.amber50,
    paths: ['M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z'],
  },
  // Win rate: a target.
  rate: {
    color: palette.blue600,
    tint: palette.blue150,
    paths: ['M12 3a9 9 0 1 0 9 9', 'M12 7.5a4.5 4.5 0 1 0 4.5 4.5', 'M12 12l7-7M16 5h3v3'],
  },
  // Best streak: a flame.
  streak: {
    color: palette.amber600,
    tint: '#FFF1E6',
    paths: ['M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5.5-3.5-8.5C13 8 12.5 9.5 11 10c-.5-2-1.5-3.5-3-5 .3 3.5-2 5.5-2 10a6 6 0 0 0 6 6z', 'M12 21a2.5 2.5 0 0 0 2.5-2.5c0-1.6-1.2-2.4-1.8-3.8-.6 1-1.4 1.3-2.2 1.6-.6.6-1 1.3-1 2.2A2.5 2.5 0 0 0 12 21z'],
  },
} as const;

/* ── Line icons (single accent, no emoji) ── */
function GearIcon({ size = 19, color = palette.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} fill="none" />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function CameraIcon({ size = 13, color = palette.green700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={12} cy={13} r={3.5} stroke={color} strokeWidth={2.2} fill="none" />
    </Svg>
  );
}

function PencilIcon({ size = 11, color = palette.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ClockIcon({ size = 20, color = palette.green700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2.2} fill="none" />
      <Path d="M12 7v5l3 2" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function MedalIcon({ size = 20, color = palette.amber800 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={15} r={6} stroke={color} strokeWidth={2.2} fill="none" />
      <Path d="M8.5 10 6 3h4l2 4 2-4h4l-2.5 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

type StatIconName = keyof typeof STAT_ICONS;

function BadgeStatus({ earned }: { earned: boolean }) {
  return (
    <View style={[styles.badgeDot, earned ? styles.badgeDotUnlocked : styles.badgeDotLocked]}>
      {earned ? (
        <Svg width={9} height={9} viewBox="0 0 24 24">
          <Path d="M20 6 9 17l-5-5" stroke={palette.white} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      ) : (
        <Svg width={9} height={9} viewBox="0 0 24 24">
          <Path d="M7 10V7a5 5 0 0 1 10 0v3" stroke={palette.white} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <Path d="M5 10h14v10H5z" fill={palette.white} />
        </Svg>
      )}
    </View>
  );
}

/** One figure in the stats strip: icon, number, label. */
function ProfileStat({ icon, value, label }: { icon: StatIconName; value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: STAT_ICONS[icon].tint }]}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          {STAT_ICONS[icon].paths.map((d) => (
            <Path key={d} d={d} stroke={STAT_ICONS[icon].color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </Svg>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const RING = 124;
const RING_STROKE = 6;

/**
 * The avatar wrapped in its level ring: the arc is how far through this
 * level the athlete is, so the photo itself carries the progress.
 */
function LevelRing({ percent, children }: { percent: number; children: React.ReactNode }) {
  const r = (RING - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent)) / 100;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="levelRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.green300} />
            <Stop offset="1" stopColor={palette.amber300} />
          </SvgGradient>
        </Defs>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke="url(#levelRing)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          fill="none"
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export default function ProfileScreen() {
  useTabView('profile');
  const router = useRouter();
  const profile = useProfileStore();
  const isPro = useIsPro();
  const setAvatar = useProfileStore((s) => s.setAvatar);
  const syncAvatar = useAuthStore((s) => s.syncAvatar);
  const pushProfile = useAuthStore((s) => s.pushProfile);

  const pickAvatar = async () => {
    /* No permission request, and none needed.
     *
     * `expo-image-picker` defaults to `legacy: false`, which on Android means
     * the system Photo Picker: the athlete chooses one image in Google's own
     * UI and the app is handed only that image. Nothing reads the library, so
     * READ_MEDIA_IMAGES is not required — and Play asks every app requesting it
     * to justify the access, which is a declaration worth not having to make.
     *
     * Asking anyway was worse than pointless: with the permission dropped from
     * the manifest the request can only be denied, so the dialog that used to
     * follow would block a picker that works perfectly well without it. */
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const local = result.assets[0].uri;
    setAvatar(local);
    // Upload to Storage so the public profile never stores a file:// URI.
    const remote = await syncAvatar(local);
    setAvatar(remote);
    void pushProfile();
  };

  const removeAvatar = () => {
    const uid = useAuthStore.getState().user?.uid;
    showDialog({
      title: 'Remove photo?',
      message: 'Your profile will show your initial instead.',
      tone: 'info',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Remove',
          variant: 'destructive',
          onPress: () => {
            setAvatar(null);
            if (uid) void deleteAvatar(uid);
            void pushProfile();
          },
        },
      ],
    });
  };

  const level = selectLevel(profile);
  const totalReps = selectTotalReps(profile);
  const duelsWon = selectDuelsWon(profile);
  const winRate = selectWinRate(profile);
  const bestStreak = selectBestStreak(profile);

  const achievements = evaluateAchievements({
    sessions: profile.sessions,
    bestStreak,
    weeklyXp: selectWeeklyXp(profile),
  });
  const featured = achievements.slice(0, 3);
  const earnedCount = achievements.filter((a) => a.earned).length;
  const initial = (profile.username || 'C').charAt(0).toUpperCase();
  const setCount = profile.sessions.length;

  return (
    <Screen>
      {/* ── Identity hero ── the athlete, their level wrapped around their
          photo, and their numbers on a strip that overlaps the hero's foot. */}
      <StaggerIn index={0}>
        <View style={styles.hero}>
          <LinearGradient
            pointerEvents="none"
            colors={gradients.heroEmerald}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={[styles.glow, styles.glowTop]} />
          <View pointerEvents="none" style={[styles.glow, styles.glowBottom]} />

          <View style={styles.topBar}>
            {/* Profile left the tab bar — it opens from the avatar on Home — so
                it needs its own way back. */}
            <PressableScale
              onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(tabs)'))}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.glassButton}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d="M15 5l-7 7 7 7" stroke={palette.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </PressableScale>
            <Text style={styles.topTitle}>Profile</Text>
            <PressableScale
              onPress={() => router.push('/modal/settings')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={styles.glassButton}
            >
              <GearIcon />
            </PressableScale>
          </View>

          <PressableScale
            onPress={pickAvatar}
            onLongPress={profile.avatarUri ? removeAvatar : undefined}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={styles.avatarWrap}
          >
            <LevelRing percent={level.percent}>
              {profile.avatarUri ? (
                <Image source={{ uri: profile.avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarInitial]}>
                  <Text style={font('extrabold', 38, { color: palette.white })}>{initial}</Text>
                </View>
              )}
            </LevelRing>
            <View style={styles.avatarEdit}>
              <CameraIcon />
            </View>
            <View style={styles.levelChip}>
              <Text style={styles.levelChipText}>LV {level.level}</Text>
            </View>
          </PressableScale>

          <Text style={styles.name} numberOfLines={1}>
            {profile.displayName}
          </Text>
          {/* The handle is the affordance: tapping the thing you want to change
              is where people look first, and a rename buried in Settings would
              not be found by someone who mistyped it during onboarding. */}
          <PressableScale
            onPress={() => router.push('/modal/username')}
            accessibilityRole="button"
            accessibilityLabel="Change username"
            style={styles.handleRow}
          >
            <Text style={styles.handle} numberOfLines={1}>
              @{profile.username || 'champion'}
            </Text>
            <View style={styles.handleEdit}>
              <PencilIcon />
            </View>
          </PressableScale>

          <View style={styles.rankPill}>
            <View style={styles.rankDot} />
            <Text style={styles.rankPillText}>{level.rankName}</Text>
            {isPro ? (
              <View style={styles.proTag}>
                <Text style={styles.proTagText}>PRO</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.xpBlock}>
            <View style={styles.xpLabelRow}>
              <Text style={styles.xpNow}>{level.xpInLevel.toLocaleString()} XP</Text>
              <Text style={styles.xpNext}>
                {level.xpToNextLevel.toLocaleString()} to Level {level.level + 1}
              </Text>
            </View>
            <ProgressBar
              percent={level.percent}
              height={7}
              trackColor="rgba(255,255,255,0.16)"
              fillColors={[palette.green300, palette.amber300]}
            />
          </View>
        </View>
      </StaggerIn>

      {/* ── Stats ── */}
      <StaggerIn index={1}>
        {setCount === 0 ? (
          <PressableScale
            onPress={() =>
              router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } })
            }
            accessibilityRole="button"
            accessibilityLabel="Start your first set"
            style={styles.statsCard}
          >
            <View style={styles.emptyStats}>
              <View style={styles.emptyIconChip}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path d="M18 20V10M12 20V4M6 20v-6" stroke={palette.green700} strokeWidth={2.5} strokeLinecap="round" fill="none" />
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 15, { color: palette.ink })}>No stats yet</Text>
                <Text style={text.caption}>Your reps, duels and streak land here after your first set.</Text>
              </View>
              <Text style={font('extrabold', 13, { color: palette.green700 })}>Start →</Text>
            </View>
          </PressableScale>
        ) : (
          <View style={styles.statsCard}>
            <ProfileStat icon="reps" value={totalReps.toLocaleString()} label="Reps" />
            <View style={styles.statDivider} />
            <ProfileStat icon="duels" value={duelsWon} label="Duels won" />
            <View style={styles.statDivider} />
            <ProfileStat icon="rate" value={`${winRate}%`} label="Win rate" />
            <View style={styles.statDivider} />
            <ProfileStat icon="streak" value={bestStreak} label="Best streak" />
          </View>
        )}
      </StaggerIn>

      {/* ── Shortcuts ──
          History has been recorded since launch and never shown back; this is
          the way in, beside the badge count, both one tap from the top. */}
      <StaggerIn index={2}>
        <View style={styles.tileRow}>
          <PressableScale
            onPress={() => router.push('/modal/history')}
            accessibilityRole="button"
            accessibilityLabel="See your workout history"
            style={styles.tile}
          >
            <View style={[styles.tileIcon, { backgroundColor: palette.green50 }]}>
              <ClockIcon />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tileTitle}>History</Text>
              <Text style={styles.tileSub} numberOfLines={1}>
                {setCount === 0 ? 'No sets yet' : `${setCount} ${setCount === 1 ? 'set' : 'sets'}`}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
          <PressableScale
            onPress={() => router.push('/modal/achievements')}
            accessibilityRole="button"
            accessibilityLabel="See all achievements"
            style={styles.tile}
          >
            <View style={[styles.tileIcon, { backgroundColor: palette.amber50 }]}>
              <MedalIcon />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tileTitle}>Badges</Text>
              <Text style={styles.tileSub} numberOfLines={1}>
                {earnedCount} of {ACHIEVEMENTS.length}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        </View>
      </StaggerIn>

      {/* ── Progress ── this week against last, twelve weeks of days, and
          per-exercise gains. The totals above only ever go up; this is where
          the athlete sees whether they are actually improving. */}
      {setCount > 0 ? (
        <StaggerIn index={3}>
          <HomeSectionHeader title="Progress" />
          <ProgressSection sessions={profile.sessions} />
        </StaggerIn>
      ) : null}

      {/* ── Achievements ── */}
      <StaggerIn index={4}>
        <HomeSectionHeader
          title="Achievements"
          right={
            <PressableScale
              onPress={() => router.push('/modal/achievements')}
              accessibilityRole="button"
              accessibilityLabel="See all achievements"
            >
              <Text style={homeSectionLink}>See all ›</Text>
            </PressableScale>
          }
        />
        <View style={styles.badgeRow}>
          {featured.map((a) => (
            <View key={a.id} style={[styles.card, styles.badgeTile, !a.earned && styles.badgeLocked]}>
              <View style={[styles.badgeIconWrap, a.earned && styles.badgeEarnedWrap]}>
                <Text style={{ fontSize: 26 }}>{a.emoji}</Text>
                <BadgeStatus earned={a.earned} />
              </View>
              <Text style={styles.badgeLabel} numberOfLines={1}>
                {a.title}
              </Text>
            </View>
          ))}
        </View>
      </StaggerIn>

      {/* ── Pro ── */}
      <StaggerIn index={5}>
        <View style={[styles.proCard, shadow.card]}>
          <LinearGradient
            pointerEvents="none"
            colors={gradients.ink}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.proGlow} />
          <View style={styles.proLogoBadge}>
            <Image source={require('../../assets/logo.png')} style={styles.proLogo} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font('extrabold', 15, { color: palette.white })}>RepChamp Pro</Text>
            <Text style={font('semibold', 12, { color: 'rgba(255,255,255,0.65)', marginTop: 2 })}>
              {isPro ? 'Active — thanks for the support' : 'Full library, programmes & form reports'}
            </Text>
          </View>
          {isPro ? (
            <View style={styles.proBadge}>
              <Text style={font('extrabold', 12, { color: palette.ink })}>ACTIVE</Text>
            </View>
          ) : (
            <PressableScale
              onPress={() => router.push({ pathname: '/modal/paywall', params: { source: 'profile' } })}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to RepChamp Pro"
              style={styles.proButton}
            >
              <Text style={font('extrabold', 12.5, { color: palette.ink })}>Upgrade</Text>
            </PressableScale>
          )}
        </View>
      </StaggerIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    paddingBottom: 52,
    paddingHorizontal: 20,
    borderRadius: radius['6xl'],
    overflow: 'hidden',
  },
  glow: { position: 'absolute', borderRadius: 999 },
  glowTop: { width: 260, height: 260, top: -130, right: -80, backgroundColor: 'rgba(134,239,172,0.18)' },
  glowBottom: { width: 220, height: 220, bottom: -120, left: -70, backgroundColor: 'rgba(251,191,36,0.10)' },
  topBar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  topTitle: font('extrabold', 15, { color: 'rgba(255,255,255,0.9)' }),
  glassButton: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: { marginBottom: 14 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: RING - RING_STROKE * 2 - 10,
    height: RING - RING_STROKE * 2 - 10,
    borderRadius: (RING - RING_STROKE * 2 - 10) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { backgroundColor: 'rgba(255,255,255,0.14)' },
  avatarEdit: {
    position: 'absolute',
    top: 6,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  levelChip: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.amber300,
    borderWidth: 2,
    borderColor: '#0B5132',
  },
  levelChipText: { ...font('extrabold', 11, { color: palette.ink }), letterSpacing: 0.6 },
  name: { ...font('extrabold', 26, { color: palette.white }), letterSpacing: -0.6, marginTop: 4 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  handle: font('bold', 13.5, { color: 'rgba(255,255,255,0.72)' }),
  handleEdit: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingLeft: 12,
    paddingRight: 6,
  },
  rankDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green300 },
  rankPillText: { ...font('extrabold', 12.5, { color: palette.white }), marginRight: 6 },
  proTag: { backgroundColor: palette.amber300, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  proTagText: { ...font('extrabold', 10, { color: palette.ink }), letterSpacing: 0.6 },
  xpBlock: { alignSelf: 'stretch', marginTop: 18 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 7 },
  xpNow: font('extrabold', 12.5, { color: palette.white }),
  xpNext: font('bold', 11.5, { color: 'rgba(255,255,255,0.6)' }),

  /* Stats strip — overlaps the hero's foot */
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -36,
    marginHorizontal: 12,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...shadow.card,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  statIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  statValue: { ...font('extrabold', 19, { color: palette.ink }), fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  statLabel: { ...font('bold', 10.5, { color: palette.grey550 }), marginTop: 2 },
  statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 6, backgroundColor: palette.border },
  emptyStats: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 },
  emptyIconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Shortcut tiles */
  tileRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius['3xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  tileIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tileTitle: font('extrabold', 14, { color: palette.ink }),
  tileSub: font('semibold', 11.5, { color: palette.slate500 }),
  chevron: { color: palette.grey500, fontSize: 20, marginTop: -2 },

  /* Achievements */
  badgeRow: { flexDirection: 'row', gap: 12 },
  badgeTile: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  badgeLocked: { opacity: 0.55 },
  badgeIconWrap: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f4f5f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEarnedWrap: {
    backgroundColor: palette.tintGreenBottom,
    borderWidth: 1.5,
    borderColor: palette.green400,
  },
  badgeDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
  },
  badgeDotUnlocked: { backgroundColor: palette.green500 },
  badgeDotLocked: { backgroundColor: palette.grey500 },
  badgeLabel: {
    ...font('extrabold', 10.5, { color: palette.ink }),
    marginTop: 8,
    textAlign: 'center',
  },

  /* Pro */
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 8,
    borderRadius: radius['4xl'],
    overflow: 'hidden',
  },
  proGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -60,
    top: -90,
    backgroundColor: 'rgba(251,191,36,0.16)',
  },
  proLogoBadge: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  proLogo: { width: 27, height: 27 },
  proBadge: {
    backgroundColor: palette.amber300,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  proButton: {
    backgroundColor: palette.amber300,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
});
