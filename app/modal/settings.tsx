import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, Chevron, Divider, Eyebrow, PressableScale, Screen, Toggle } from '@/components/ui';
import { captureError } from '@/lib/crash';
import { clearAllStorage } from '@/lib/storage';
import { deleteAccount, exportAccountData } from '@/services/accountService';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { useSettingsStore, type SettingsToggle } from '@/state/settingsStore';
import { font, text } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';

interface ToggleRow {
  key: SettingsToggle;
  emoji: string;
  title: string;
  subtitle: string;
}

const WORKOUT_TOGGLES: ToggleRow[] = [
  { key: 'sound', emoji: '🔊', title: 'Rep sounds', subtitle: 'Beep on every counted rep' },
  { key: 'haptics', emoji: '📳', title: 'Haptics', subtitle: 'Vibrate on rep & duel events' },
  {
    key: 'voiceCoach',
    emoji: '🗣️',
    title: 'Voice coach',
    subtitle: 'Spoken form cues while you train',
  },
];

const PRIVACY_TOGGLES: ToggleRow[] = [
  { key: 'duelInvites', emoji: '🔔', title: 'Duel invites', subtitle: 'Get notified when challenged' },
  {
    key: 'privateProfile',
    emoji: '🔒',
    title: 'Private profile',
    subtitle: 'Hide from the global leaderboard',
  },
];

/** Human-readable line for each cloud-sync state. */
const SYNC_LABEL: Record<string, string> = {
  idle: 'Waiting to sync',
  'signing-in': 'Signing in…',
  syncing: 'Syncing your progress…',
  synced: 'Your progress is backed up',
  error: 'Offline — will retry automatically',
};

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettingsStore();
  const resetProfile = useProfileStore((s) => s.reset);
  const cloudConfigured = useAuthStore((s) => s.configured);
  const syncStatus = useAuthStore((s) => s.status);
  const cloudSignOut = useAuthStore((s) => s.signOut);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const [busy, setBusy] = useState<null | 'export' | 'delete'>(null);

  const logOut = () => {
    Alert.alert(
      'Log out?',
      'This clears your profile, session history and XP on this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => {
            // Sign out of the cloud first (no-op when unconfigured), then wipe
            // the local device so nothing lingers behind.
            void cloudSignOut();
            resetProfile();
            clearAllStorage();
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  /**
   * Hand the user a full copy of their cloud data. We serialise it to JSON and
   * pass it to the OS share sheet (built-in `Share`, no new native dep) so they
   * can save it to Files, mail it to themselves, etc. — the app never picks a
   * destination. Falls back to a clear message for a local-only account.
   */
  const exportData = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const data = await exportAccountData(uid ?? '');
      if (!data) {
        Alert.alert(
          'Nothing to export yet',
          'Your data lives only on this device — connect cloud sync to enable a portable export.',
        );
        return;
      }
      await Share.share({ message: JSON.stringify(data, null, 2) });
    } catch (error) {
      captureError(error);
      Alert.alert('Export failed', 'Could not gather your data right now. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Permanent account deletion — the erase half of the data rights. Erases the
   * cloud footprint (profile, leaderboard, matchmaking, shared couple, avatar)
   * and the auth account, then wipes the device and returns to onboarding. Two
   * confirmations, because it cannot be undone.
   */
  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently erases your profile, XP, leaderboard standing and shared couple data from the cloud and this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            if (busy) return;
            setBusy('delete');
            void (async () => {
              try {
                await deleteAccount(uid ?? '');
              } catch (error) {
                // Even a partial failure shouldn't strand the user signed-in with
                // half-deleted data; log it, then still wipe local and sign out.
                captureError(error);
              } finally {
                void cloudSignOut();
                resetProfile();
                clearAllStorage();
                setBusy(null);
                router.replace('/onboarding');
              }
            })();
          },
        },
      ],
    );
  };

  const renderGroup = (rows: ToggleRow[]) => (
    <Card style={styles.group}>
      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>{row.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={font('extrabold', 14, { color: palette.ink })}>{row.title}</Text>
              <Text style={font('semibold', 10, { color: palette.grey600 })}>{row.subtitle}</Text>
            </View>
            <Toggle
              value={settings[row.key]}
              onChange={(next) => settings.set(row.key, next)}
              label={row.title}
            />
          </View>
        </View>
      ))}
    </Card>
  );

  return (
    <Screen>
      <ModalHeader title="Settings" />

      <Eyebrow style={styles.eyebrow}>DURING WORKOUTS</Eyebrow>
      {renderGroup(WORKOUT_TOGGLES)}

      <Eyebrow style={styles.eyebrow}>NOTIFICATIONS &amp; PRIVACY</Eyebrow>
      {renderGroup(PRIVACY_TOGGLES)}

      {cloudConfigured ? (
        <>
          <Eyebrow style={styles.eyebrow}>ACCOUNT</Eyebrow>
          <Card style={styles.group}>
            <View style={styles.row}>
              <Text style={{ fontSize: 18 }}>☁️</Text>
              <View style={{ flex: 1 }}>
                <Text style={font('extrabold', 14, { color: palette.ink })}>Cloud sync</Text>
                <Text style={font('semibold', 10, { color: palette.grey600 })}>
                  {SYNC_LABEL[syncStatus]}
                </Text>
              </View>
              <View
                style={[
                  styles.syncDot,
                  { backgroundColor: syncStatus === 'error' ? palette.red500 : palette.green500 },
                ]}
              />
            </View>
          </Card>
        </>
      ) : null}

      <Eyebrow style={styles.eyebrow}>YOUR DATA</Eyebrow>
      <Card style={styles.group}>
        <LinkRow
          emoji="📄"
          label="Privacy Policy & Terms"
          onPress={() => router.push('/modal/legal')}
        />
        {cloudConfigured ? (
          <>
            <Divider />
            <LinkRow
              emoji="📤"
              label={busy === 'export' ? 'Preparing your data…' : 'Export my data'}
              onPress={() => void exportData()}
            />
            <Divider />
            <LinkRow
              emoji="🗑️"
              label={busy === 'delete' ? 'Deleting…' : 'Delete my account'}
              onPress={confirmDelete}
              destructive
            />
          </>
        ) : null}
      </Card>

      <Card style={styles.group}>
        <LinkRow
          emoji="🔁"
          label="Replay intro"
          onPress={() => router.replace('/onboarding')}
        />
      </Card>

      <PressableScale
        onPress={logOut}
        accessibilityRole="button"
        accessibilityLabel="Log out and clear this device"
        style={styles.logOut}
      >
        <Text style={font('extrabold', 14, { color: palette.red500 })}>Log out</Text>
      </PressableScale>

      <Text style={styles.version}>RepChamp v2.0 · Made for champions</Text>
    </Screen>
  );
}

function LinkRow({
  emoji,
  label,
  onPress,
  destructive = false,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.row}
    >
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text
        style={[
          font('extrabold', 14, { color: destructive ? palette.red500 : palette.ink }),
          { flex: 1 },
        ]}
      >
        {label}
      </Text>
      <Chevron />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  eyebrow: { marginBottom: 10 },
  group: { paddingHorizontal: 16, marginBottom: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  syncDot: { width: 10, height: 10, borderRadius: 5 },
  logOut: {
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  version: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginTop: 16,
  },
});
