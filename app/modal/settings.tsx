import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, Chevron, Divider, Eyebrow, PressableScale, Screen, Toggle } from '@/components/ui';
import { captureError } from '@/lib/crash';
import {
  cancelDailyTrainingReminder,
  syncLocalReminders,
} from '@/lib/notifications';
import { clearAllStorage } from '@/lib/storage';
import { deleteAccount, exportAccountData } from '@/services/accountService';
import { isPurchasesConfigured, resetPurchases, restore } from '@/services/purchases';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { showDialog } from '@/state/useDialog';
import { dayKey } from '@/domain/progression';
import { useCouple } from '@/state/useCouple';
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
    key: 'dailyReminder',
    emoji: '⏰',
    title: 'Daily reminders',
    subtitle: 'One evening nudge if you haven’t trained',
  },
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
  const sessions = useProfileStore((s) => s.sessions);
  const couple = useCouple();
  const cloudConfigured = useAuthStore((s) => s.configured);
  const syncStatus = useAuthStore((s) => s.status);
  const cloudSignOut = useAuthStore((s) => s.signOut);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const setPro = useProStore((s) => s.setPro);
  const refreshPro = useProStore((s) => s.refresh);
  const [busy, setBusy] = useState<null | 'export' | 'delete' | 'restore'>(null);

  const clearLocalSession = async () => {
    await resetPurchases();
    setPro(false);
    void cloudSignOut();
    resetProfile();
    clearAllStorage();
  };

  const logOut = () => {
    showDialog({
      title: 'Log out?',
      message:
        'This clears your profile, session history and XP on this device. It cannot be undone.',
      tone: 'danger',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Log out',
          variant: 'destructive',
          onPress: () => {
            void (async () => {
              await clearLocalSession();
              router.replace('/onboarding');
            })();
          },
        },
      ],
    });
  };

  const onRestore = () => {
    if (busy || !isPurchasesConfigured()) return;
    setBusy('restore');
    void (async () => {
      const result = await restore();
      setBusy(null);
      if (result.ok && result.isPro) {
        setPro(true);
        await refreshPro();
        track('restore_completed', { restored: true });
        showDialog({
          title: 'Restored',
          message: 'Your Pro subscription is active again.',
          tone: 'success',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
        return;
      }
      track('restore_completed', { restored: false });
      showDialog({
        title: result.ok ? 'Nothing to restore' : 'Restore failed',
        message: result.message ?? 'No active subscription was found for this account.',
        tone: result.ok ? 'info' : 'danger',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    })();
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
        showDialog({
          title: 'Nothing to export yet',
          message:
            'Your data lives only on this device — connect cloud sync to enable a portable export.',
          tone: 'info',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
        return;
      }
      await Share.share({ message: JSON.stringify(data, null, 2) });
    } catch (error) {
      captureError(error);
      showDialog({
        title: 'Export failed',
        message: 'Could not gather your data right now. Please try again.',
        tone: 'danger',
        actions: [{ label: 'Try again', variant: 'primary' }],
      });
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
    showDialog({
      title: 'Delete account?',
      message:
        'This permanently erases your profile, XP, leaderboard standing and shared couple data from the cloud and this device. It cannot be undone.',
      tone: 'danger',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Delete everything',
          variant: 'destructive',
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
                await clearLocalSession();
                setBusy(null);
                router.replace('/onboarding');
              }
            })();
          },
        },
      ],
    });
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
              onChange={(next) => {
                settings.set(row.key, next);
                // The daily-reminder toggle owns real OS schedules, so arm or
                // clear them the moment it flips.
                if (row.key === 'dailyReminder') {
                  const trainedToday = sessions.some((s) => s.day === dayKey());
                  if (next) {
                    void syncLocalReminders({
                      dailyReminderEnabled: true,
                      trainedToday,
                      coupleAtRisk: couple.paired && couple.atRisk,
                      partnerName: couple.partner?.displayName ?? null,
                    });
                  } else {
                    void cancelDailyTrainingReminder();
                  }
                }
                // Privacy toggle re-syncs immediately so the leaderboard row is
                // pulled (or restored) right away, not on the next session.
                if (row.key === 'privateProfile') {
                  void useAuthStore.getState().pushProfile();
                }
              }}
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
        <Divider />
        <LinkRow
          emoji="🚫"
          label="Blocked users"
          onPress={() => router.push('/modal/blocked' as never)}
        />
        {isPurchasesConfigured() ? (
          <>
            <Divider />
            <LinkRow
              emoji="♻️"
              label={busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
              onPress={onRestore}
            />
          </>
        ) : null}
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
