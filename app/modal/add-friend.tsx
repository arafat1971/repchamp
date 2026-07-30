import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, Divider, Eyebrow, PressableScale, Screen } from '@/components/ui';
import { addFriendByUsername } from '@/services/leaderboardService';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { useAuthStore } from '@/state/authStore';
import { showDialog } from '@/state/useDialog';
import { useProfileStore } from '@/state/profileStore';
import { friendInviteLink } from '@/lib/urls';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

export default function AddFriendScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ u?: string }>();
  const username = useProfileStore((s) => s.username) || 'champion';
  const uid = useAuthStore((s) => s.user?.uid);
  const cloudConfigured = useAuthStore((s) => s.configured);
  const [query, setQuery] = useState('');
  const [duelCode, setDuelCode] = useState('');
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [searching, setSearching] = useState(false);

  // Deep link `repchamp://modal/add-friend?u=name` prefills the search box.
  useEffect(() => {
    const fromLink = typeof params.u === 'string' ? params.u.trim().replace(/^@/, '') : '';
    if (fromLink) setQuery(fromLink);
  }, [params.u]);

  const inviteLink = friendInviteLink(username);

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
        showDialog({
          title: 'Friend added',
          message: `@${name.toLowerCase()} is on your list. They can add you back by your username.`,
          tone: 'success',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
        setQuery('');
      } else {
        showDialog({
          title: 'Not available yet',
          message:
            'Adding friends by username switches on once the app is connected to the cloud. Share your invite link below instead.',
          tone: 'info',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
      }
    } catch (err) {
      showDialog({
        title: 'Could not add',
        message: err instanceof Error ? err.message : 'Please try again.',
        tone: 'danger',
        actions: [{ label: 'Try again', variant: 'primary' }],
      });
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
        emoji: p.emoji,
        isAI: true as const,
        reason: 'AI training partner',
        background: p.tintBg,
        color: p.tintColor,
      }))
    : [];

  const visible = suggestionsList.filter((s) =>
    s.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  /** Suggested AI partners start a paced duel — they are not cloud friends. */
  const addSuggestion = (person: (typeof suggestionsList)[number]) => {
    if (added[person.id]) return;
    setAdded((prev) => ({ ...prev, [person.id]: true }));
    router.push({
      pathname: '/session',
      params: { exercise: 'push', mode: 'versus', opponent: person.id },
    });
  };

  return (
    <Screen>
      <ModalHeader title="Add Friends" />

      <Card style={styles.search}>
        <View style={styles.searchIcon}>
          <View style={styles.searchGlass} />
          <View style={styles.searchHandle} />
        </View>
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
        <Svg width={17} height={17} viewBox="0 0 24 24" style={{ marginLeft: 1 }}>
          <Path
            d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"
            stroke={palette.grey450}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
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
        <Text style={font('extrabold', 17, { color: palette.white })}>Invite a rival</Text>
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
        {suggestionsList.length === 0 ? (
          <Text style={[text.caption, { padding: 16, textAlign: 'center' }]}>
            Search a username above, or share your invite link to add real friends.
          </Text>
        ) : visible.length === 0 ? (
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
                  emoji={person.emoji}
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
                  onPress={() => addSuggestion(person)}
                  accessibilityRole="button"
                  accessibilityLabel={`Duel ${person.name}`}
                  style={[styles.addButton, added[person.id] && styles.addedButton]}
                >
                  <Text
                    style={font('extrabold', 12, {
                      color: added[person.id] ? palette.green600 : palette.white,
                    })}
                  >
                    {added[person.id] ? 'Ready' : 'Duel'}
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
  searchIcon: { width: 17, height: 17 },
  searchGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.7,
    borderColor: palette.grey450,
  },
  searchHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 6,
    height: 1.9,
    borderRadius: 1,
    backgroundColor: palette.grey450,
    transform: [{ rotate: '45deg' }],
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
