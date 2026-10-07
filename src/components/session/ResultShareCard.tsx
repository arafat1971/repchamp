import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionMode } from '@/domain/progression';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

export interface ResultShareCardProps {
  name: string;
  avatarUri?: string | null;
  reps: number;
  exerciseLabel: string;
  streak: number;
  formScore?: number;
  peakDepthPct?: number;
  fullDepthReps?: number;
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
      streak,
      formScore,
      peakDepthPct = 100,
      fullDepthReps,
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
              {/* Hero — one number, one label */}
              <View style={styles.soloHero}>
                <Text style={styles.soloNumber}>{reps}</Text>
                <Text style={styles.heroLabel}>{exerciseLabel.toUpperCase()}</Text>
              </View>

              {/* Metrics — a hairline strip, not three boxes */}
              <View style={styles.statsStrip}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{displayForm}%</Text>
                  <Text style={styles.statLabel}>FORM</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{displayFullReps}/{reps}</Text>
                  <Text style={styles.statLabel}>FULL DEPTH</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
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

const styles = StyleSheet.create({
  // Transparent so the rounded card's corners aren't backed by a white square
  // that pokes out past the radius. The exported image is PNG, so the corners
  // outside the radius stay transparent — exactly what a rounded card wants.
  wrap: { backgroundColor: 'transparent', alignSelf: 'center' },

  card: {
    width: 340,
    borderRadius: radius['6xl'],
    paddingVertical: 24,
    paddingHorizontal: 20,
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
    marginBottom: 16,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24, borderRadius: radius.sm, overflow: 'hidden' },
  brandTitle: font('extrabold', 14, { color: INK, letterSpacing: 2 }),
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ACCENT_SOFT,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  aiDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  aiPillText: font('extrabold', 9.5, { color: palette.green700, letterSpacing: 1 }),

  /* Hero (solo) */
  hero: { alignItems: 'center', marginBottom: 16 },
  heroNumber: {
    ...font('extrabold', 76, { color: INK }),
    lineHeight: 80,
    letterSpacing: -3,
  },
  heroLabel: font('extrabold', 12, { color: MUTED, letterSpacing: 3, marginTop: 4 }),

  /* Solo hero + metrics */
  soloHero: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  soloNumber: {
    ...font('extrabold', 112, { color: INK }),
    lineHeight: 112,
    letterSpacing: -5,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 14,
    marginBottom: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: BORDER },
  statValue: font('extrabold', 18, { color: INK }),
  statLabel: font('bold', 9.5, { color: MUTED, letterSpacing: 1, marginTop: 4 }),

  /* Versus / together */
  resultKicker: font('extrabold', 11, { color: MUTED, letterSpacing: 3, marginBottom: 4 }),
  resultTitle: font('extrabold', 30, { letterSpacing: -0.5, marginBottom: 16 }),
  duelPhotoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 16,
  },
  duelPhotoCol: { alignItems: 'center', flex: 1 },
  duelPhotoTile: {
    width: '100%',
    aspectRatio: 0.88,
    borderRadius: radius['2xl'],
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
  versusScore: font('extrabold', 30, { marginTop: 4 }),
  winnerTag: {
    ...font('extrabold', 9.5, { color: palette.green700, letterSpacing: 1 }),
    backgroundColor: ACCENT_SOFT,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  metaLabel: font('extrabold', 15, { color: INK }),
  metaValue: font('medium', 12, { color: MUTED }),

  /* Identity */
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
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
    marginBottom: 16,
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
  footerDomain: font('medium', 10, { color: MUTED, marginTop: 4 }),
  cta: {
    backgroundColor: ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  ctaText: font('extrabold', 12, { color: palette.white, letterSpacing: 0.5 }),
});
