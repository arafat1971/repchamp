import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, G, Text as SvgText } from 'react-native-svg';

import type { SessionMode } from '@/domain/progression';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

export interface ResultShareCardProps {
  name: string;
  avatarUri?: string | null;
  snapshotUri?: string | null;
  reps: number;
  exerciseLabel: string;
  exerciseId?: string;
  streak: number;
  formScore?: number;
  peakDepthPct?: number;
  fullDepthReps?: number;
  trackingStatus?: string;

  mode?: SessionMode;
  opponentName?: string;
  opponentReps?: number;
  won?: boolean;
}

/**
 * Ultra-sleek iOS Viral Share Card.
 * Clean, light premium layout matching Duel Finished design across both solo and versus modes.
 */
export const ResultShareCard = forwardRef<View, ResultShareCardProps>(
  function ResultShareCard(
    {
      name,
      avatarUri,
      snapshotUri,
      reps,
      exerciseLabel,
      exerciseId = 'push',
      streak,
      peakDepthPct = 100,
      fullDepthReps,
      trackingStatus = '100% AI POSE TRACKED',
      mode = 'solo',
      opponentName = 'Opponent',
      opponentReps = 0,
      won = true,
    },
    ref,
  ) {
    const isSquat = exerciseId === 'squat' || (exerciseLabel ? exerciseLabel.toLowerCase().includes('squat') : false);
    const displayFullReps = fullDepthReps !== undefined ? fullDepthReps : reps;
    const userInitial = name ? name.trim().charAt(0).toUpperCase() : 'A';
    const oppInitial = opponentName ? opponentName.trim().charAt(0).toUpperCase() : 'O';

    const isVersus = mode === 'versus';

    return (
      <View ref={ref} collapsable={false} style={styles.wrap}>
        {isVersus ? (
          /* ---------------- DUEL FINISHED CARD STYLE ---------------- */
          <LinearGradient
            colors={['#f8fafc', '#edf2f7', '#e2e8f0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cardVersus}
          >
            {/* Top Brand Header */}
            <View style={styles.versusHeaderRow}>
              <View style={styles.brandBadgeGroup}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.headerAppLogo}
                  contentFit="contain"
                />
                <Text style={styles.versusBrandTitle}>REPCHAMP</Text>
              </View>
              <View style={styles.versusAiPill}>
                <Text style={styles.versusAiPillText}>🤖 {trackingStatus}</Text>
              </View>
            </View>

            {/* Duel Title */}
            <Text style={styles.duelTitleText}>Duel Finished!</Text>
            <Text style={[styles.duelWinnerText, { color: won ? '#22c55e' : '#64748b' }]}>
              {won ? 'You Won!' : 'Good Effort!'}
            </Text>

            {/* Avatars & 3D Gold Trophy Section */}
            <View style={styles.versusAvatarRow}>
              {/* User Side */}
              <View style={styles.versusUserCol}>
                {won ? <Text style={styles.crownEmoji}>👑</Text> : <View style={{ height: 24 }} />}
                <View style={styles.versusAvatarRing}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.versusAvatarImg} />
                  ) : (
                    <View style={[styles.versusAvatarPlaceholder, { backgroundColor: '#10b981' }]}>
                      <Text style={styles.versusAvatarInitial}>{userInitial}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.versusUserName}>You</Text>
                <Text style={styles.versusUserScore}>{reps} reps</Text>
              </View>

              {/* Center 3D Gold Trophy */}
              <View style={styles.trophyCol}>
                <Image
                  source={require('../../../assets/trophy-gold.png')}
                  style={styles.trophy3DImg}
                  contentFit="contain"
                />
              </View>

              {/* Opponent Side */}
              <View style={styles.versusUserCol}>
                {!won ? <Text style={styles.crownEmoji}>👑</Text> : <View style={{ height: 24 }} />}
                <View style={styles.versusAvatarRing}>
                  <View style={[styles.versusAvatarPlaceholder, { backgroundColor: '#6366f1' }]}>
                    <Text style={styles.versusAvatarInitial}>{oppInitial}</Text>
                  </View>
                </View>
                <Text style={styles.versusUserName}>{opponentName}</Text>
                <Text style={styles.versusOppScore}>{opponentReps} reps</Text>
              </View>
            </View>

            {/* Workout Result Box */}
            <View style={styles.workoutBoxCard}>
              <Text style={styles.workoutBoxHeader}>Workout</Text>
              <View style={styles.workoutRow}>
                <Image
                  source={
                    isSquat
                      ? require('../../../assets/ic-squat.png')
                      : require('../../../assets/ic-pushup.png')
                  }
                  style={styles.workoutIcon}
                  contentFit="contain"
                />
                <View style={styles.workoutMeta}>
                  <Text style={styles.workoutLabelText}>{exerciseLabel}</Text>
                  <Text style={styles.workoutSubText}>Most reps in 1 minute</Text>
                </View>
              </View>

              <View style={styles.versusScoreSplitRow}>
                <View style={styles.versusScoreCol}>
                  <Text style={styles.versusScoreSub}>Your Reps</Text>
                  <Text style={styles.versusScoreMyNum}>{reps}</Text>
                </View>

                <View style={styles.versusScoreDivider} />

                <View style={styles.versusScoreCol}>
                  <Text style={styles.versusScoreSub}>Opponent Reps</Text>
                  <Text style={styles.versusScoreOppNum}>{opponentReps}</Text>
                </View>
              </View>
            </View>

            {/* Bottom Brand & 3D Button */}
            <View style={styles.versusFooterRow}>
              <View style={styles.footerBrandBlock}>
                <Text style={styles.versusFooterBrand}>REPCHAMP</Text>
                <Text style={styles.versusFooterSub}>repchamp.web.app</Text>
              </View>

              <View style={styles.btn3DWrapper}>
                <LinearGradient
                  colors={['#22c55e', '#15803d']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.btn3DInner}
                >
                  <Text style={styles.btn3DText}>ACCEPT CHALLENGE 🚀</Text>
                </LinearGradient>
              </View>
            </View>
          </LinearGradient>
        ) : (
          /* ---------------- SOLO / PRACTICE AI CARD STYLE (CLEAN LIGHT THEME) ---------------- */
          <LinearGradient
            colors={['#f8fafc', '#edf2f7', '#e2e8f0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cardLight}
          >
            {/* Top Header Bar */}
            <View style={styles.headerRow}>
              <View style={styles.brandBadgeGroup}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.headerAppLogo}
                  contentFit="contain"
                />
                <Text style={styles.headerBrandTitleLight}>REPCHAMP</Text>
              </View>

              <View style={styles.versusAiPill}>
                <Text style={styles.versusAiPillText}>🤖 {trackingStatus}</Text>
              </View>
            </View>

            {/* User Profile Card */}
            <View style={styles.userProfileCardLight}>
              <LinearGradient
                colors={['#10b981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRingLight}
              >
                <View style={styles.avatarInnerLight}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitialTextLight}>{userInitial}</Text>
                  )}
                </View>
              </LinearGradient>

              <View style={styles.userInfoCol}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userNameTextLight}>{name}</Text>
                  <Text style={styles.muscle3DIcon}>💪</Text>
                </View>
              </View>

              <LinearGradient
                colors={['#ff416c', '#ff4b2b']}
                style={styles.streak3DBadge}
              >
                <Text style={styles.streak3DText}>🔥 {streak}D</Text>
              </LinearGradient>
            </View>

            {/* Hero Rep Count Box */}
            <View style={styles.heroScoreCardLight}>
              <Text style={styles.heroRepNumberLight}>{reps}</Text>
              <Text style={styles.heroRepLabelLight}>
                {exerciseLabel.toUpperCase()} COMPLETED 🦾
              </Text>
            </View>

            {/* High-Tech AI Workout Studio Stage */}
            <View style={styles.photoStageContainerLight}>
              {snapshotUri ? (
                <Image source={{ uri: snapshotUri }} style={styles.snapshotPhoto} contentFit="cover" />
              ) : avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.snapshotPhoto} contentFit="cover" blurRadius={8} />
              ) : (
                <LinearGradient
                  colors={isSquat ? ['#1e1b4b', '#0f172a'] : ['#064e3b', '#022c22']}
                  style={StyleSheet.absoluteFill}
                />
              )}

              <View style={styles.darkVignette} />

              <View style={styles.skeletonOverlayWrap}>
                <PoseSkeletonSvg exerciseId={exerciseId} />
              </View>

              <View style={styles.stageHeaderTag}>
                <View style={styles.liveGreenDot} />
                <Text style={styles.stageHeaderText}>AI POSE SKELETON LOCKED</Text>
              </View>

              <View style={[styles.cornerBracket, styles.bracketTopLeft]} />
              <View style={[styles.cornerBracket, styles.bracketTopRight]} />
              <View style={[styles.cornerBracket, styles.bracketBottomLeft]} />
              <View style={[styles.cornerBracket, styles.bracketBottomRight]} />
            </View>

            {/* 3 Metric Pills */}
            <View style={styles.statsGridRow}>
              <View style={styles.statPillLight}>
                <Text style={styles.statPillValueLight}>🎯 {peakDepthPct}%</Text>
                <Text style={styles.statPillLabelLight}>PEAK DEPTH</Text>
              </View>
              <View style={styles.statPillLight}>
                <Text style={styles.statPillValueLight}>✨ {displayFullReps}/{reps}</Text>
                <Text style={styles.statPillLabelLight}>FULL DEPTH</Text>
              </View>
              <View style={styles.statPillLight}>
                <Text style={styles.statPillValueLight}>🔥 {streak} DAYS</Text>
                <Text style={styles.statPillLabelLight}>STREAK</Text>
              </View>
            </View>

            {/* Viral Hook Quote Card */}
            <View style={styles.hookQuoteCardLight}>
              <Text style={styles.hookQuoteIconLight}>⚡</Text>
              <Text style={styles.hookQuoteTextLight}>
                "Zero cheating. AI motion tracked every rep. Think you can beat me?"
              </Text>
            </View>

            {/* Footer & 3D iOS Action Button */}
            <View style={styles.cardFooterLight}>
              <View style={styles.footerBrandBlock}>
                <Text style={styles.footerBrandNameLight}>REPCHAMP</Text>
                <Text style={styles.footerDomainTextLight}>repchamp.web.app</Text>
              </View>

              <View style={styles.btn3DWrapper}>
                <LinearGradient
                  colors={['#22c55e', '#15803d']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.btn3DInner}
                >
                  <Text style={styles.btn3DText}>ACCEPT CHALLENGE 🚀</Text>
                </LinearGradient>
              </View>
            </View>
          </LinearGradient>
        )}
      </View>
    );
  },
);

/**
 * Cyber AI pose estimation overlay vector graphics.
 */
function PoseSkeletonSvg({ exerciseId }: { exerciseId: string }) {
  const isSquat = exerciseId === 'squat';

  const joints = isSquat
    ? [
        { x: 140, y: 30 },
        { x: 130, y: 55 },
        { x: 150, y: 55 },
        { x: 115, y: 80 },
        { x: 165, y: 80 },
        { x: 110, y: 105 },
        { x: 170, y: 105 },
        { x: 132, y: 115 },
        { x: 148, y: 115 },
        { x: 120, y: 155 },
        { x: 160, y: 155 },
        { x: 125, y: 188 },
        { x: 155, y: 188 },
      ]
    : [
        { x: 50, y: 110 },
        { x: 80, y: 115 },
        { x: 80, y: 125 },
        { x: 85, y: 145 },
        { x: 85, y: 155 },
        { x: 95, y: 175 },
        { x: 95, y: 180 },
        { x: 150, y: 120 },
        { x: 150, y: 128 },
        { x: 210, y: 122 },
        { x: 210, y: 130 },
        { x: 260, y: 125 },
        { x: 260, y: 132 },
      ];

  const bones: [number, number][] = isSquat
    ? [
        [0, 1], [0, 2], [1, 2], [1, 3], [3, 5], [2, 4], [4, 6],
        [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12],
      ]
    : [
        [0, 1], [1, 2], [1, 3], [3, 5], [2, 4], [4, 6],
        [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12],
      ];

  return (
    <Svg width="280" height="150" viewBox="0 0 280 150">
      <Line x1="0" y1="37.5" x2="280" y2="37.5" stroke="rgba(34,197,94,0.15)" strokeWidth="1" strokeDasharray="4,4" />
      <Line x1="0" y1="75" x2="280" y2="75" stroke="rgba(34,197,94,0.15)" strokeWidth="1" strokeDasharray="4,4" />
      <Line x1="0" y1="112.5" x2="280" y2="112.5" stroke="rgba(34,197,94,0.15)" strokeWidth="1" strokeDasharray="4,4" />
      <Line x1="70" y1="0" x2="70" y2="150" stroke="rgba(34,197,94,0.15)" strokeWidth="1" strokeDasharray="4,4" />
      <Line x1="140" y1="0" x2="140" y2="150" stroke="rgba(34,197,94,0.15)" strokeWidth="1" strokeDasharray="4,4" />
      <Line x1="210" y1="0" x2="210" y2="150" stroke="rgba(34,197,94,0.15)" strokeWidth="1" strokeDasharray="4,4" />

      <G>
        {bones.map(([b1, b2], idx) => {
          const p1 = joints[b1];
          const p2 = joints[b2];
          if (!p1 || !p2) return null;
          return (
            <G key={`bone-${idx}`}>
              <Line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#00f2fe"
                strokeWidth="7"
                strokeOpacity="0.45"
              />
              <Line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#22c55e"
                strokeWidth="3"
              />
            </G>
          );
        })}

        {joints.map((j, idx) => (
          <G key={`joint-${idx}`}>
            <Circle cx={j.x} cy={j.y} r="7" fill="#00f2fe" fillOpacity="0.6" />
            <Circle cx={j.x} cy={j.y} r="3.5" fill="#ffffff" />
          </G>
        ))}

        <SvgText x="12" y="142" fill="#86efac" fontSize="9" fontWeight="bold">
          {isSquat ? 'HIP FLEXION: 82°' : 'ELBOW ANGLE: 74°'}
        </SvgText>
        <SvgText x="200" y="142" fill="#00f2fe" fontSize="9" fontWeight="bold">
          [LOCKED ⚡]
        </SvgText>
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: palette.canvas, borderRadius: radius['5xl'], alignSelf: 'flex-start' },
  card: {
    width: 340,
    borderRadius: radius['5xl'],
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  /* ---------------- VERSUS / DUEL STYLES ---------------- */
  cardVersus: {
    width: 340,
    borderRadius: radius['5xl'],
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  versusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  versusBrandTitle: font('extrabold', 14, { color: '#0f172a', letterSpacing: 2 }),
  versusAiPill: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  versusAiPillText: font('extrabold', 9, { color: '#15803d', letterSpacing: 0.5 }),

  duelTitleText: font('extrabold', 26, { color: '#0f172a', letterSpacing: -0.5 }),
  duelWinnerText: font('extrabold', 15, { marginTop: 2, marginBottom: 12 }),

  versusAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 16,
  },
  versusUserCol: { alignItems: 'center', flex: 1 },
  crownEmoji: { fontSize: 22, height: 24 },
  versusAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  versusAvatarImg: { width: '100%', height: '100%' },
  versusAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  versusAvatarInitial: font('extrabold', 22, { color: palette.white }),
  versusUserName: font('extrabold', 14, { color: '#0f172a', marginTop: 4 }),
  versusUserScore: font('extrabold', 13, { color: '#22c55e', marginTop: 1 }),
  versusOppScore: font('extrabold', 13, { color: '#64748b', marginTop: 1 }),

  trophyCol: { alignItems: 'center', justifyContent: 'center', width: 70 },
  trophy3DImg: { width: 68, height: 68 },

  workoutBoxCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: radius['3xl'],
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  workoutBoxHeader: font('extrabold', 14, { color: '#0f172a', marginBottom: 6 }),
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  workoutIcon: { width: 36, height: 36 },
  workoutMeta: { flex: 1 },
  workoutLabelText: font('extrabold', 15, { color: '#0f172a' }),
  workoutSubText: font('medium', 11, { color: '#64748b' }),

  versusScoreSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  versusScoreCol: { flex: 1, alignItems: 'center' },
  versusScoreSub: font('bold', 10, { color: '#64748b' }),
  versusScoreMyNum: font('extrabold', 34, { color: '#22c55e' }),
  versusScoreOppNum: font('extrabold', 34, { color: '#0f172a' }),
  versusScoreDivider: { width: 1, height: 36, backgroundColor: '#e2e8f0' },

  footerBrandBlock: { alignItems: 'flex-start' },
  versusFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  versusFooterBrand: font('extrabold', 12, { color: '#0f172a', letterSpacing: 2 }),
  versusFooterSub: font('medium', 9, { color: '#64748b' }),

  /* ---------------- SOLO LIGHT STYLES ---------------- */
  cardLight: {
    width: 340,
    borderRadius: radius['5xl'],
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  brandBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerAppLogo: {
    width: 24,
    height: 24,
    borderRadius: 7,
  },
  headerBrandTitleLight: font('extrabold', 14, { color: '#0f172a', letterSpacing: 2 }),

  userProfileCardLight: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
  },
  avatarRingLight: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInnerLight: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  avatarInitialTextLight: font('extrabold', 18, { color: palette.white }),
  userInfoCol: { flex: 1, marginLeft: 10 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userNameTextLight: font('extrabold', 16, { color: '#0f172a' }),
  muscle3DIcon: { fontSize: 18 },

  streak3DBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    shadowColor: '#ff416c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  streak3DText: font('extrabold', 11, { color: palette.white }),

  heroScoreCardLight: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: radius['3xl'],
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
  },
  heroRepNumberLight: {
    ...font('extrabold', 56, { color: '#22c55e' }),
    lineHeight: 60,
    letterSpacing: -1,
  },
  heroRepLabelLight: font('extrabold', 11, { color: '#15803d', letterSpacing: 2 }),

  photoStageContainerLight: {
    width: 280,
    height: 150,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#051d13',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    marginBottom: 12,
  },
  snapshotPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: radius['2xl'],
  },
  darkVignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 29, 19, 0.45)',
  },
  skeletonOverlayWrap: {
    ...StyleSheet.absoluteFill,
  },

  stageHeaderTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  stageHeaderText: font('extrabold', 8, { color: '#86efac', letterSpacing: 0.6 }),

  cornerBracket: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: '#22c55e',
  },
  bracketTopLeft: {
    top: 6,
    left: 6,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  bracketTopRight: {
    top: 6,
    right: 6,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bracketBottomLeft: {
    bottom: 6,
    left: 6,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  bracketBottomRight: {
    bottom: 6,
    right: 6,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },

  statsGridRow: {
    flexDirection: 'row',
    gap: 7,
    width: '100%',
    marginBottom: 12,
  },
  statPillLight: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  statPillValueLight: font('extrabold', 13, { color: '#0f172a' }),
  statPillLabelLight: font('bold', 8, { color: '#64748b', marginTop: 2, letterSpacing: 0.5 }),

  hookQuoteCardLight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    marginBottom: 12,
    gap: 8,
  },
  hookQuoteIconLight: { fontSize: 16 },
  hookQuoteTextLight: {
    ...font('semibold', 11, { color: '#15803d' }),
    flex: 1,
    lineHeight: 15,
  },

  cardFooterLight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
  },
  footerBrandNameLight: font('extrabold', 12, { color: '#0f172a', letterSpacing: 2 }),
  footerDomainTextLight: font('medium', 9, { color: '#64748b' }),

  btn3DWrapper: {
    borderRadius: radius.pill,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  btn3DInner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn3DText: font('extrabold', 11, { color: '#ffffff', letterSpacing: 0.8 }),
});
