import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';

import type { SessionMode } from '@/domain/progression';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

export interface ResultShareCardProps {
  name: string;
  avatarUri?: string | null;
  reps: number;
  exerciseLabel: string;
  exerciseId?: string;
  streak: number;
  formScore?: number;
  peakDepthPct?: number;
  fullDepthReps?: number;
  trackingStatus?: string;
  /** True when pose tracking actually counted reps this set. */
  aiVerified?: boolean;
  /** Live versus ended level — neither side is WINNER. */
  drew?: boolean;
  /** Clock length for the versus meta line. */
  durationSec?: number;

  mode?: SessionMode;
  opponentName?: string;
  opponentReps?: number;
  won?: boolean;
  /** A live "together" set — both sides shown, no winner framing. */
  cooperative?: boolean;
}

/*
 * A single-accent share card: white surface, brand green as the only accent,
 * neutral slate for hierarchy. Built to read cleanly at thumbnail size in a
 * social feed — one hero number, one accent, a clear hook, no rainbow.
 */
const ACCENT = palette.green600;
const ACCENT_SOFT = palette.green50;
const INK = palette.ink;
const MUTED = palette.slate500;
const FAINT = palette.slate400;
const SURFACE = '#F7F9F7';
const BORDER = palette.border;

export const ResultShareCard = forwardRef<View, ResultShareCardProps>(
  function ResultShareCard(
    {
      name,
      avatarUri,
      reps,
      exerciseLabel,
      exerciseId = 'push',
      streak,
      formScore,
      peakDepthPct = 100,
      fullDepthReps,
      trackingStatus = 'AI POSE TRACKED',
      aiVerified = false,
      drew = false,
      durationSec = 60,
      mode = 'solo',
      opponentName = 'Opponent',
      opponentReps = 0,
      won = true,
      cooperative = false,
    },
    ref,
  ) {
    const displayFullReps = fullDepthReps !== undefined ? fullDepthReps : reps;
    const displayForm = formScore !== undefined ? Math.round(formScore) : peakDepthPct;
    const userInitial = name ? name.trim().charAt(0).toUpperCase() : 'A';
    const oppInitial = opponentName ? opponentName.trim().charAt(0).toUpperCase() : 'O';
    const isVersus = mode === 'versus' && !cooperative;
    const isTogether = mode === 'together' || cooperative;
    const durationLabel = `${Math.max(1, Math.round(durationSec))}s`;
    const combinedReps = reps + opponentReps;

    return (
      <View ref={ref} collapsable={false} style={styles.wrap}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandGroup}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <Text style={styles.brandTitle}>REPCHAMP</Text>
            </View>
            <View style={styles.aiPill}>
              <View style={styles.aiDot} />
              <Text style={styles.aiPillText}>{aiVerified ? 'AI VERIFIED' : 'SESSION LOGGED'}</Text>
            </View>
          </View>

          {isVersus ? (
            <>
              {/* Result headline */}
              <Text style={styles.resultKicker}>DUEL FINISHED</Text>
              <Text style={[styles.resultTitle, { color: won ? ACCENT : INK }]}>
                {drew ? 'Draw' : won ? 'Victory' : 'Good effort'}
              </Text>

              {/* Athletes — the local avatar when set, an initial per side
                  otherwise. */}
              <View style={styles.duelPhotoRow}>
                <View style={styles.duelPhotoCol}>
                  <View style={[styles.duelPhotoTile, won && !drew && styles.duelPhotoTileWin]}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.duelPhotoImg} contentFit="cover" />
                    ) : (
                      <View style={[styles.duelPhotoFallback, styles.avatarFallbackAccent]}>
                        <Text style={styles.avatarInitialLight}>{userInitial}</Text>
                      </View>
                    )}
                    <View style={styles.duelPhotoVignette} />
                  </View>
                  <Text style={styles.versusName} numberOfLines={1}>You</Text>
                  <Text style={[styles.versusScore, { color: won && !drew ? ACCENT : INK }]}>{reps}</Text>
                  {drew ? (
                    <Text style={styles.winnerTag}>DRAW</Text>
                  ) : won ? (
                    <Text style={styles.winnerTag}>WINNER</Text>
                  ) : (
                    <View style={styles.tagSpacer} />
                  )}
                </View>

                <View style={styles.vsBadge}>
                  <Text style={styles.vsGlyph}>VS</Text>
                </View>

                <View style={styles.duelPhotoCol}>
                  <View style={[styles.duelPhotoTile, !won && !drew && styles.duelPhotoTileWin]}>
                    <View style={styles.duelPhotoFallback}>
                      <Text style={styles.avatarInitialMuted}>{oppInitial}</Text>
                    </View>
                    <View style={styles.duelPhotoVignette} />
                  </View>
                  <Text style={styles.versusName} numberOfLines={1}>{opponentName}</Text>
                  <Text style={[styles.versusScore, { color: !won && !drew ? ACCENT : INK }]}>{opponentReps}</Text>
                  {drew ? (
                    <Text style={styles.winnerTag}>DRAW</Text>
                  ) : !won ? (
                    <Text style={styles.winnerTag}>WINNER</Text>
                  ) : (
                    <View style={styles.tagSpacer} />
                  )}
                </View>
              </View>

              {/* Workout summary */}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{exerciseLabel}</Text>
                <Text style={styles.metaValue}>Most reps in {durationLabel}</Text>
              </View>
            </>
          ) : isTogether ? (
            <>
              {/* Together sets have no loser — domain rule already refuses to
                  compute a winner (see finishDuel's `cooperative` guard), so
                  the card mirrors that: no VS glyph, no WINNER tag, just both
                  athletes and the combined total. */}
              <Text style={styles.resultKicker}>TRAINED TOGETHER</Text>
              <Text style={[styles.resultTitle, { color: ACCENT }]}>Nice work</Text>

              <View style={styles.duelPhotoRow}>
                <View style={styles.duelPhotoCol}>
                  <View style={styles.duelPhotoTile}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.duelPhotoImg} contentFit="cover" />
                    ) : (
                      <View style={[styles.duelPhotoFallback, styles.avatarFallbackAccent]}>
                        <Text style={styles.avatarInitialLight}>{userInitial}</Text>
                      </View>
                    )}
                    <View style={styles.duelPhotoVignette} />
                  </View>
                  <Text style={styles.versusName} numberOfLines={1}>You</Text>
                  <Text style={styles.versusScore}>{reps}</Text>
                </View>

                <View style={styles.togetherBadge}>
                  <Text style={styles.togetherGlyph}>+</Text>
                </View>

                <View style={styles.duelPhotoCol}>
                  <View style={styles.duelPhotoTile}>
                    <View style={styles.duelPhotoFallback}>
                      <Text style={styles.avatarInitialMuted}>{oppInitial}</Text>
                    </View>
                    <View style={styles.duelPhotoVignette} />
                  </View>
                  <Text style={styles.versusName} numberOfLines={1}>{opponentName}</Text>
                  <Text style={styles.versusScore}>{opponentReps}</Text>
                </View>
              </View>

              <View style={styles.hero}>
                <Text style={styles.heroNumber}>{combinedReps}</Text>
                <Text style={styles.heroLabel}>COMBINED {exerciseLabel.toUpperCase()}</Text>
              </View>
            </>
          ) : (
            <>
              {/* Hero */}
              <View style={styles.hero}>
                <Text style={styles.heroNumber}>{reps}</Text>
                <Text style={styles.heroLabel}>{exerciseLabel.toUpperCase()}</Text>
              </View>

              {/* AI pose stage */}
              <View style={styles.stage}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.stagePhoto} contentFit="cover" blurRadius={10} />
                ) : (
                  <View style={styles.stageEmpty} />
                )}
                <View style={styles.stageVignette} />
                <View style={styles.skeletonWrap}>
                  <PoseSkeletonSvg exerciseId={exerciseId} />
                </View>
                <View style={styles.stageTag}>
                  <View style={styles.liveDot} />
                  <Text style={styles.stageTagText}>{trackingStatus}</Text>
                </View>
              </View>

              {/* Metrics */}
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{displayForm}%</Text>
                  <Text style={styles.statLabel}>FORM</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{displayFullReps}/{reps}</Text>
                  <Text style={styles.statLabel}>FULL DEPTH</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{streak}d</Text>
                  <Text style={styles.statLabel}>STREAK</Text>
                </View>
              </View>
            </>
          )}

          {/* Athlete identity */}
          <View style={styles.identityRow}>
            <View style={styles.identityAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.identityAvatarImg} />
              ) : (
                <Text style={styles.identityInitial}>{userInitial}</Text>
              )}
            </View>
            <Text style={styles.identityName} numberOfLines={1}>{name}</Text>
          </View>

          {/* Hook */}
          <Text style={styles.hook}>
            {aiVerified
              ? 'Every rep verified by AI. Think you can beat me?'
              : 'Logged on RepChamp. Think you can beat me?'}
          </Text>

          {/* Footer */}
          <View style={styles.footer}>
            <View>
              <Text style={styles.footerBrand}>REPCHAMP</Text>
              <Text style={styles.footerDomain}>repchamp.web.app</Text>
            </View>
            <View style={styles.cta}>
              <Text style={styles.ctaText}>Accept challenge</Text>
            </View>
          </View>
        </View>
      </View>
    );
  },
);

/** Minimal single-accent pose overlay. */
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
                stroke={palette.green400}
                strokeWidth="10"
                strokeOpacity="0.35"
              />
              <Line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={palette.green400}
                strokeWidth="5"
              />
            </G>
          );
        })}

        {joints.map((j, idx) => (
          <G key={`joint-${idx}`}>
            <Circle cx={j.x} cy={j.y} r="12" fill={palette.green400} fillOpacity="0.35" />
            <Circle cx={j.x} cy={j.y} r="9" fill={palette.white} />
          </G>
        ))}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  // Transparent so the rounded card's corners aren't backed by a white square
  // that pokes out past the radius. The exported image is PNG, so the corners
  // outside the radius stay transparent — exactly what a rounded card wants.
  wrap: { backgroundColor: 'transparent', alignSelf: 'center' },

  card: {
    width: 340,
    borderRadius: 32,
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: BORDER,
    // Clip children (e.g. the pose stage / avatars) to the card's rounded
    // corners so nothing bleeds past the radius.
    overflow: 'hidden',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 18,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24, borderRadius: 7, overflow: 'hidden' },
  brandTitle: font('extrabold', 14, { color: INK, letterSpacing: 2 }),
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT_SOFT,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  aiDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  aiPillText: font('extrabold', 9, { color: palette.green700, letterSpacing: 1 }),

  /* Hero (solo) */
  hero: { alignItems: 'center', marginBottom: 18 },
  heroNumber: {
    ...font('extrabold', 76, { color: INK }),
    lineHeight: 80,
    letterSpacing: -3,
  },
  heroLabel: font('extrabold', 12, { color: MUTED, letterSpacing: 3, marginTop: 2 }),

  /* Stage (solo) */
  stage: {
    width: 296,
    height: 160,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: palette.slate900,
    marginBottom: 16,
  },
  stagePhoto: { width: '100%', height: '100%' },
  stageEmpty: { ...StyleSheet.absoluteFill, backgroundColor: palette.slate800 },
  stageVignette: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.28)' },
  skeletonWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  stageTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green400 },
  stageTagText: font('extrabold', 9, { color: palette.white, letterSpacing: 0.8 }),

  /* Stats (solo) */
  statsRow: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 18 },
  statPill: {
    flex: 1,
    backgroundColor: SURFACE,
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  statValue: font('extrabold', 17, { color: ACCENT }),
  statLabel: font('bold', 9, { color: MUTED, letterSpacing: 0.8, marginTop: 3 }),

  /* Versus / together */
  resultKicker: font('extrabold', 11, { color: MUTED, letterSpacing: 3, marginBottom: 2 }),
  resultTitle: font('extrabold', 30, { letterSpacing: -0.5, marginBottom: 18 }),
  duelPhotoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 16,
  },
  duelPhotoCol: { alignItems: 'center', flex: 1 },
  duelPhotoTile: {
    width: '100%',
    aspectRatio: 0.88,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: palette.slate900,
    borderWidth: 2,
    borderColor: BORDER,
  },
  duelPhotoTileWin: { borderColor: ACCENT },
  duelPhotoImg: { width: '100%', height: '100%' },
  duelPhotoFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE,
  },
  duelPhotoVignette: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.18)' },
  avatarFallbackAccent: { backgroundColor: ACCENT_SOFT },
  avatarInitialLight: font('extrabold', 24, { color: ACCENT }),
  avatarInitialMuted: font('extrabold', 24, { color: FAINT }),
  versusName: font('extrabold', 13, { color: INK, marginTop: 8, maxWidth: 100 }),
  versusScore: font('extrabold', 30, { marginTop: 2 }),
  winnerTag: {
    ...font('extrabold', 9, { color: palette.green700, letterSpacing: 1 }),
    backgroundColor: ACCENT_SOFT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 4,
    overflow: 'hidden',
  },
  tagSpacer: { height: 21, marginTop: 4 },
  vsBadge: {
    marginTop: 44,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsGlyph: font('extrabold', 13, { color: palette.green700, letterSpacing: 1 }),
  togetherBadge: {
    marginTop: 44,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togetherGlyph: font('extrabold', 18, { color: palette.green700 }),
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 18,
  },
  metaLabel: font('extrabold', 15, { color: INK }),
  metaValue: font('medium', 12, { color: MUTED }),

  /* Identity */
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  identityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  identityAvatarImg: { width: '100%', height: '100%' },
  identityInitial: font('extrabold', 15, { color: ACCENT }),
  identityName: font('extrabold', 15, { color: INK, flex: 1 }),

  /* Hook */
  hook: {
    ...font('semibold', 13, { color: palette.slate600 }),
    alignSelf: 'flex-start',
    lineHeight: 19,
    marginBottom: 18,
  },

  /* Footer */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerBrand: font('extrabold', 13, { color: INK, letterSpacing: 2 }),
  footerDomain: font('medium', 10, { color: MUTED, marginTop: 2 }),
  cta: {
    backgroundColor: ACCENT,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
  },
  ctaText: font('extrabold', 12, { color: palette.white, letterSpacing: 0.5 }),
});
