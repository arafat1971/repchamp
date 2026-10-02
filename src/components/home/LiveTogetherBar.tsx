import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Face, IOS } from '@/components/home/HealthCard';
import { track } from '@/lib/analytics';
import { lightImpactHaptic, playPopSound, playReceiveSound, successHaptic } from '@/lib/feedback';
import { partnerHereAt, partnerPokeToday, type CoupleMember } from '@/domain/couple';
import { HERE_BEAT_MS, POKES, cleanPoke, isHere, isNewPoke, type Poke } from '@/domain/ritual';
import { beatHere, sendPoke } from '@/services/ritualSync';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

/**
 * The live wire between the two of you, on Home.
 *
 * While Home is in front it beats "here" into my slice of the couple doc —
 * the same channel "Today, together" uses — so each of you can see the other
 * is in the app right now. The emoji row throws a poke across; theirs land
 * here as a pop with a sound, once each and only while fresh.
 *
 * Nothing new server-side: presence and pokes ride the couple document the
 * partner is already watching, so they arrive in a second or two.
 */
export function LiveTogetherBar({
  coupleId,
  uid,
  partner,
  partnerAvatar,
  today,
}: {
  coupleId: string | null;
  uid: string | null;
  partner: CoupleMember;
  partnerAvatar: string | null;
  today: string;
}) {
  const name = (partner.displayName?.trim() || 'Partner').split(/\s+/)[0] ?? 'Partner';

  /* My heartbeat, while Home is focused. */
  useFocusEffect(
    useCallback(() => {
      void beatHere(coupleId, uid);
      const id = setInterval(() => void beatHere(coupleId, uid), HERE_BEAT_MS);
      return () => clearInterval(id);
    }, [coupleId, uid]),
  );

  /* A clock for "here" — it expires without any new snapshot. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const hereAt = partnerHereAt(partner, today);
  const here = isHere(hereAt, now);
  const wasHere = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasHere.current === false && here) {
      playReceiveSound();
      successHaptic();
    }
    wasHere.current = here;
  }, [here]);

  const status = here
    ? `${name} is here now`
    : hereAt && now - hereAt < 60 * 60_000
      ? `${name} was here ${Math.max(1, Math.round((now - hereAt) / 60_000))}m ago`
      : `Send ${name} a little something`;

  /* Their pokes: once each, only while fresh. */
  const poke = cleanPoke(partnerPokeToday(partner, today));
  const lastPoke = useRef<number | null>(null);
  const [incoming, setIncoming] = useState<{ e: string; at: number } | null>(null);
  useEffect(() => {
    if (lastPoke.current === null) {
      // First look: whatever is there is history, not a live moment.
      lastPoke.current = poke?.at ?? 0;
      return;
    }
    if (!isNewPoke(poke, lastPoke.current, Date.now())) return;
    lastPoke.current = poke!.at;
    setIncoming(poke);
    playReceiveSound();
    lightImpactHaptic();
    const t = setTimeout(() => setIncoming(null), 2600);
    return () => clearTimeout(t);
    // Keyed by the poke's time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poke?.at]);

  /* Mine: a quick "sent" float over the button I pressed. */
  const [sent, setSent] = useState<{ e: Poke; key: number } | null>(null);
  const sentCount = useRef(0);
  const throwPoke = (e: Poke) => {
    const ok = sendPoke(coupleId, uid, e);
    if (!ok) return;
    playPopSound();
    lightImpactHaptic();
    sentCount.current += 1;
    setSent({ e, key: sentCount.current });
    track('couple_poke', { emoji: e, here, source: 'home' });
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View>
          <Face uri={partnerAvatar} name={name} color={IOS.duo} size={36} />
          <PresenceDot live={here} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.status} numberOfLines={1}>
            {status}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {here ? 'Tap to react — they see it live' : 'Reactions land on their phone live'}
          </Text>
        </View>
        {here ? (
          <View style={styles.livePill}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.pokes}>
        {POKES.map((e) => (
          <PokeButton key={e} emoji={e} onPress={() => throwPoke(e)} sentKey={sent?.e === e ? sent.key : 0} />
        ))}
      </View>

      {incoming ? (
        <Animated.View
          key={incoming.at}
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(300)}
          style={styles.incoming}
          pointerEvents="none"
        >
          <IncomingPop emoji={incoming.e} />
          <Text style={styles.incomingText} numberOfLines={1}>
            {name} sent you {incoming.e}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function PresenceDot({ live }: { live: boolean }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!live || reduced) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [live, reduced, pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.6 }],
  }));
  return (
    <View style={styles.dotSlot} pointerEvents="none">
      {live ? <Animated.View style={[styles.dot, styles.dotRing, ring]} /> : null}
      <View style={[styles.dot, { backgroundColor: live ? palette.green500 : palette.grey400 }]} />
    </View>
  );
}

function PokeButton({ emoji, onPress, sentKey }: { emoji: string; onPress: () => void; sentKey: number }) {
  const scale = useSharedValue(1);
  const fly = useSharedValue(0);
  useEffect(() => {
    if (!sentKey) return;
    fly.set(0);
    fly.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [sentKey, fly]);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const flying = useAnimatedStyle(() => ({
    opacity: fly.value > 0 && fly.value < 1 ? 1 - fly.value : 0,
    transform: [{ translateY: -34 * fly.value }, { scale: 1 + fly.value * 0.6 }],
  }));
  return (
    <Pressable
      onPress={() => {
        scale.set(withSequence(withTiming(0.82, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 300 })));
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Send ${emoji}`}
      style={styles.pokeSlot}
    >
      <Animated.View style={[styles.poke, press]}>
        <Text style={styles.pokeEmoji}>{emoji}</Text>
      </Animated.View>
      <Animated.Text style={[styles.flyEmoji, flying]} pointerEvents="none">
        {emoji}
      </Animated.Text>
    </Pressable>
  );
}

function IncomingPop({ emoji }: { emoji: string }) {
  const s = useSharedValue(0.3);
  useEffect(() => {
    s.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 220 }), withSpring(1, { damping: 10 }));
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.Text style={[styles.incomingEmoji, style]}>{emoji}</Animated.Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginTop: 12,
    overflow: 'hidden',
    ...surfaceShadow,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { ...font('bold', 14, { color: IOS.label }), letterSpacing: -0.2 },
  sub: font('medium', 11.5, { color: IOS.secondary, marginTop: 1 }),
  livePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(52,199,89,0.14)',
  },
  liveText: { ...font('extrabold', 10, { color: '#15803D' }), letterSpacing: 0.8 },
  dotSlot: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: palette.white },
  dotRing: { backgroundColor: palette.green500, borderWidth: 0 },

  pokes: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pokeSlot: { flex: 1, alignItems: 'center' },
  poke: {
    width: '100%',
    height: 38,
    borderRadius: 14,
    backgroundColor: IOS.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pokeEmoji: { fontSize: 19 },
  flyEmoji: { position: 'absolute', top: 6, fontSize: 20 },

  incoming: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius['4xl'],
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  incomingEmoji: { fontSize: 40 },
  incomingText: font('bold', 13.5, { color: IOS.label }),
});
