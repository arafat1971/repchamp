import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, Divider, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { addFriendByUsername } from '@/services/leaderboardService';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const SUGGESTIONS = [
  { id: 'lena', name: 'Lena', initial: 'L', reason: '2 mutual friends', background: '#fecdd3', color: '#be123c' },
  { id: 'kojo', name: 'Kojo', initial: 'K', reason: 'In your league', background: '#bbf7d0', color: '#15803d' },
  { id: 'dani', name: 'Dani', initial: 'D', reason: 'From your contacts', background: '#e9d5ff', color: '#7c3aed' },
] as const;

export default function AddFriendScreen() {
  const router = useRouter();
  const username = useProfileStore((s) => s.username) || 'champion';
  const uid = useAuthStore((s) => s.user?.uid);
  const cloudConfigured = useAuthStore((s) => s.configured);
  const [query, setQuery] = useState('');
  const [duelCode, setDuelCode] = useState('');
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [searching, setSearching] = useState(false);

  const inviteLink = `https://repchamp.gg/@${username}`;

  /** Jump into the waiting room as the guest for a pasted duel code. */
  const joinDuelByCode = () => {
    const code = duelCode.trim();
    if (!code) return;
    router.push({ pathname: '/duel/[id]', params: { id: code, role: 'guest' } });
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Share opens the OS sheet — the athlete chooses the recipient, we never send.
  const shareLink = () => {
    void Share.share({ message: `Duel me on RepChamp: ${inviteLink}` });
  };

  /**
   * Resolve a typed username against the real user directory and add the friend
   * edge. Only meaningful once Firebase is provisioned; unconfigured it resolves
   * to `false`, so the button falls back to a friendly "not available yet" note.
   */
  const addByUsername = async () => {
    const name = query.trim();
    if (!name || !uid) return;
    setSearching(true);
    try {
      const ok = await addFriendByUsername(uid, name);
      if (ok) {
        setAdded((prev) => ({ ...prev, [`@${name.toLowerCase()}`]: true }));
        Alert.alert('Friend added', `You and @${name.toLowerCase()} are now connected.`);
        setQuery('');
      } else {
        Alert.alert(
          'Not available yet',
          'Adding friends by username switches on once the app is connected to the cloud. Share your invite link below instead.',
        );
      }
    } catch (err) {
      Alert.alert('Could not add', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const seed = usePhantomSeed();

  const suggestionsList = seed.isSeeding && seed.phantomFriends.length > 0
    ? seed.phantomFriends.slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        initial: p.initial,
        emoji: p.emoji, isAI: p.isAI,
        reason: 'Recommended athlete',
        background: p.tintBg,
        color: p.tintColor,
      }))
    : SUGGESTIONS;

  const visible = suggestionsList.filter((s) =>
    s.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Screen>
      <ModalHeader title="Add Friends" />

      <Card style={styles.search}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void addByUsername()}
          returnKeyType="search"
          placeholder="Search by username…"
          placeholderTextColor={palette.grey450}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search for friends by username"
          style={styles.searchInput}
        />
        {query.trim().length > 0 ? (
          <PressableScale
            onPress={() => void addByUsername()}
            disabled={searching}
            accessibilityRole="button"
            accessibilityLabel={`Add ${query.trim()} by username`}
            style={styles.searchAdd}
          >
            <Text style={font('extrabold', 12, { color: palette.white })}>
              {searching ? '…' : cloudConfigured ? 'Add' : 'Invite'}
            </Text>
          </PressableScale>
        ) : null}
      </Card>

      <Card style={styles.search}>
        <Text style={{ fontSize: 16 }}>⚔️</Text>
        <TextInput
          value={duelCode}
          onChangeText={setDuelCode}
          onSubmitEditing={joinDuelByCode}
          returnKeyType="go"
          placeholder="Paste a duel code to join…"
          placeholderTextColor={palette.grey450}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Join a duel by code"
          style={styles.searchInput}
        />
        {duelCode.trim().length > 0 ? (
          <PressableScale
            onPress={joinDuelByCode}
            accessibilityRole="button"
            accessibilityLabel="Join the duel"
            style={styles.searchAdd}
          >
            <Text style={font('extrabold', 12, { color: palette.white })}>Join</Text>
          </PressableScale>
        ) : null}
      </Card>

      <LinearGradient colors={gradients.brand} style={[styles.inviteCard, shadow.brand]}>
        <Text style={font('extrabold', 17, { color: palette.white })}>Invite a rival 💪</Text>
        <Text style={styles.inviteCopy}>
          Share your link — when they join, you both get 100 XP.
        </Text>

        <View style={styles.linkRow}>
          <Text style={styles.linkText} numberOfLines={1}>
            {inviteLink}
          </Text>
          <PressableScale
            onPress={copyLink}
            accessibilityRole="button"
            accessibilityLabel="Copy invite link"
            style={styles.copyButton}
          >
            <Text style={font('extrabold', 12, { color: palette.green600 })}>
              {copied ? 'Copied ✓' : 'Copy'}
            </Text>
          </PressableScale>
        </View>

        <PressableScale
          onPress={shareLink}
          accessibilityRole="button"
          accessibilityLabel="Share invite link"
          style={styles.shareButton}
        >
          <Text style={font('extrabold', 12, { color: palette.white })}>Share link</Text>
        </PressableScale>
      </LinearGradient>

      <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>SUGGESTED FOR YOU</Eyebrow>
      <Card style={{ padding: 8 }}>
        {visible.length === 0 ? (
          <Text style={[text.caption, { padding: 16, textAlign: 'center' }]}>
            No matches for “{query}”.
          </Text>
        ) : (
          visible.map((person, index) => (
            <View key={person.id}>
              {index > 0 ? <Divider style={{ marginHorizontal: 10 }} /> : null}
              <View style={styles.row}>
                <Avatar
                  initial={person.initial}
                  emoji={(person as any).emoji}
                  size={44}
                  background={person.background}
                  color={person.color}
                />
                <View style={{ flex: 1 }}>
                  <Text style={font('extrabold', 14, { color: palette.ink })}>{person.name}</Text>
                  <Text style={font('semibold', 10, { color: palette.grey600 })}>
                    {person.reason}
                  </Text>
                </View>
                <PressableScale
                  onPress={() => setAdded((prev) => ({ ...prev, [person.id]: true }))}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${person.name}`}
                  style={[styles.addButton, added[person.id] && styles.addedButton]}
                >
                  <Text
                    style={font('extrabold', 12, {
                      color: added[person.id] ? palette.green600 : palette.white,
                    })}
                  >
                    {added[person.id] ? 'Added' : 'Add'}
                  </Text>
                </PressableScale>
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.xl,
    marginBottom: 20,
  },
  searchInput: { flex: 1, ...font('semibold', 14, { color: palette.ink }) },
  searchAdd: {
    backgroundColor: palette.green500,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  inviteCard: { borderRadius: radius['4xl'], padding: 20 },
  inviteCopy: {
    ...font('semibold', 12, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: 4,
    maxWidth: 250,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  linkText: { flex: 1, ...font('bold', 13, { color: palette.white }) },
  copyButton: {
    backgroundColor: palette.white,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  shareButton: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10 },
  addButton: {
    backgroundColor: palette.green500,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
  },
  addedButton: { backgroundColor: palette.green50 },
});
