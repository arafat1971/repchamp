import { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, PrimaryButton, Screen } from '@/components/ui';
import { normalizeUsername } from '@/domain/input';
import { planRename, renameConfirmation } from '@/domain/renameUsername';
import { checkUsername, renameProfileUsername } from '@/services/userService';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { captureError } from '@/lib/crash';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Change your handle.
 *
 * Until this existed the name typed during onboarding was permanent — a typo,
 * or a name chosen before you knew rivals would see it, was yours forever. The
 * only escape was deleting the account.
 */
export default function UsernameScreen() {
  const current = useProfileStore((s) => s.username);
  const uid = useAuthStore((s) => s.user?.uid);

  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const onSave = useCallback(async () => {
    if (busy) return;
    setError(null);
    setDone(null);

    /* Shape first, so an obviously invalid name never costs a network round
       trip and the athlete gets the specific reason rather than a lookup
       result that was never meaningful. */
    const offline = planRename(current, value, 'free');
    if (offline.kind === 'rejected') return setError(offline.reason);
    if (offline.kind === 'unchanged') {
      return setError('That’s already your username.');
    }

    /* Signed out: the handle is local-only, so there is nothing to reserve and
       nobody to collide with. Renaming still has to work — otherwise anyone who
       skipped sign-in is stuck with their first guess. */
    if (!uid) {
      useProfileStore.getState().setUsername(offline.username);
      setDone(renameConfirmation(offline.username));
      return;
    }

    setBusy(true);
    try {
      const availability = await checkUsername(offline.username, uid);
      const plan = planRename(current, value, availability);
      if (plan.kind !== 'ok') {
        setError(plan.kind === 'rejected' ? plan.reason : 'That’s already your username.');
        return;
      }

      const written = await renameProfileUsername(uid, plan.username);
      if (!written) {
        /* The write is the source of truth. Updating the local store on a
           failed write would show the new name on this phone while every
           leaderboard still showed the old one. */
        setError("Couldn't save that name. Check your connection and try again.");
        return;
      }

      useProfileStore.getState().setUsername(plan.username);
      setDone(renameConfirmation(plan.username));
    } catch (e) {
      captureError(e);
      setError("Couldn't save that name. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, current, uid, value]);

  const changed = normalizeUsername(value) !== normalizeUsername(current);

  return (
    <Screen>
      <ModalHeader title="Username" />

      <Card style={styles.card}>
        <Text style={text.captionMd}>
          This is the name your rivals see on the leaderboard.
        </Text>

        <View style={styles.field}>
          <Text style={font('extrabold', 18, { color: palette.grey450 })}>@</Text>
          <TextInput
            value={value}
            onChangeText={(v) => {
              setValue(v.replace(/[^a-zA-Z0-9_]/g, ''));
              setError(null);
              setDone(null);
            }}
            placeholder="username"
            placeholderTextColor={palette.grey450}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            editable={!busy}
            accessibilityLabel="Username"
            style={styles.input}
          />
        </View>

        <Text style={[text.captionMd, { marginTop: 10 }]}>
          3–20 characters. Letters, numbers, and underscores only.
        </Text>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {done ? (
          <Text style={styles.done} accessibilityLiveRegion="polite">
            ✓ {done}
          </Text>
        ) : null}

        <PrimaryButton
          label={busy ? 'Saving…' : 'Save'}
          onPress={onSave}
          disabled={busy || !changed}
          style={{ marginTop: 18 }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, padding: 18, gap: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  input: { flex: 1, ...font('extrabold', 18, { color: palette.ink }) },
  error: { ...font('bold', 12.5, { color: palette.red500 }), marginTop: 10 },
  done: { ...font('bold', 12.5, { color: palette.green700 }), marginTop: 10 },
});
