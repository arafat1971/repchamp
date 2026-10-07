import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AnnualUpgradeCard } from '@/components/AnnualUpgradeCard';
import { ModalHeader } from '@/components/ModalHeader';
import { Chevron, Divider, PressableScale, Screen, Toggle } from '@/components/ui';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { HomeCard as Card } from '@/components/ui/HomeCard';
import { captureError } from '@/lib/crash';
import {
  cancelDailyTrainingReminder,
  syncHydrationReminders,
  syncLocalReminders,
} from '@/lib/notifications';
import { clearAllStorage } from '@/lib/storage';
import {
  CLOUD_ERASED_REAUTH_MESSAGE,
  closeOpenDuels,
  deleteAccount,
  exportAccountData,
} from '@/services/accountService';
import { flushCoupleCreditOutbox } from '@/services/coupleCreditOutbox';
import { forceBankPendingLiveSettles } from '@/services/liveResultSettle';
import { emitRetention, retentionSnapshot } from '@/services/recordSessionWithRetention';
import { isWidgetSupported } from '@/services/partnerWidget';
import { isPurchasesConfigured, resetPurchases, restore } from '@/services/purchases';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/authStore';
import { useEffectivePro, useProStore } from '@/state/proStore';
import { SUPPORT_EMAIL, manageSubscriptionsUrl } from '@/lib/urls';
import { showDialog } from '@/state/useDialog';
import { daysSinceLastSession } from '@/domain/dormantReminder';
import { dayKey } from '@/domain/progression';
import { useCouple } from '@/state/useCouple';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { setStepServiceEnabled } from '@/services/pedometer';
import { useHydrationStore } from '@/state/hydrationStore';
import { useSettingsStore, type SettingsToggle } from '@/state/settingsStore';
import { reservedControlHeight } from '@/theme/fontScale';
import { font, scaleForRole, text } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';

interface ToggleRow {
  key: SettingsToggle;
  title: string;
  subtitle: string;
}

const WORKOUT_TOGGLES: ToggleRow[] = [
  { key: 'sound', title: 'Rep sounds', subtitle: 'Beep on every counted rep' },
  { key: 'haptics', title: 'Haptics', subtitle: 'Vibrate on rep & duel events' },
  {
    key: 'voiceCoach',
   
    title: 'Voice coach',
    subtitle: 'Spoken form cues while you train',
  },
];

const STEP_COUNTING_ROW: ToggleRow = {
  key: 'stepCounting',
 
  title: 'Background step counting',
  subtitle: 'Keeps a quiet notification so your daily total is complete',
};

/** What is allowed to ping the athlete — kept apart from who can see them. */
const NOTIFICATION_TOGGLES: ToggleRow[] = [
  { key: 'duelInvites', title: 'Duel invites', subtitle: 'Get notified when challenged' },
  {
    key: 'dailyReminder',
   
    title: 'Daily reminders',
    subtitle: 'One evening nudge if you haven’t trained',
  },
  {
    key: 'hydrationReminder',
   
    title: 'Water reminders',
    subtitle: 'Up to two a day, only when you’re behind',
  },
  {
    key: 'ritualReminder',
   
    title: 'Ritual reminder',
    subtitle: 'One evening nudge with what’s left of your routine',
  },
];

/** What other people, and the app's own analytics, can see. */
const PRIVACY_TOGGLES: ToggleRow[] = [
  {
    key: 'shareActivity',

    title: 'Show when I’m active',
    subtitle: 'Friends see “Active now” and when you were last around',
  },
  {
    key: 'shareAnalytics',

    title: 'Share usage analytics',
    subtitle: 'Which screens you use, tied to an anonymous ID — never your name or email',
  },
  {
    key: 'privateProfile',
   
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
  const { fontScale } = useWindowDimensions();
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
  const isPro = useEffectivePro();
  const [busy, setBusy] = useState<null | 'export' | 'delete' | 'restore'>(null);

  const clearLocalSession = async (opts?: { syncFirst?: boolean }) => {
    if (opts?.syncFirst !== false) {
      // Bank any live-duel XP still in the settle outbox before MMKV wipe.
      forceBankPendingLiveSettles((item, bank) => {
        // Force-banked XP still counts as the training day it was. Snapshot
        // before the write, or the comparison is against the new state.
        const before = retentionSnapshot();
        useProfileStore.getState().recordSession({
          exercise: item.record.exercise,
          mode: item.record.sessionMode,
          reps: item.record.reps,
          opponentReps:
            item.record.sessionMode === 'versus' ? bank.opponentReps : null,
          opponentId: bank.opponentId ?? item.record.opponentId ?? null,
          target: item.record.target,
          won: bank.won,
          drew: bank.drew,
          xp: bank.xp,
          formScore: item.record.formScore,
          durationSec: item.record.durationSec,
        });
        emitRetention(before.days, before.league);
        return true;
      });
      // Best-effort cloud mirror — unsynced XP / couple credits are lost otherwise.
      try {
        await useAuthStore.getState().pushProfile();
      } catch {
        // Offline / App Check — still proceed; the dialog already warned.
      }
      try {
        await flushCoupleCreditOutbox();
      } catch {
        // Same — wipe continues; credits may already be on the couple doc.
      }
    }
    // Don't leave partners mid-match against a ghost uid after logout.
    if (uid) {
      try {
        await closeOpenDuels(uid);
      } catch {
        // Best-effort; wipe still proceeds.
      }
    }
    await resetPurchases();
    setPro(false);
    try {
      await cloudSignOut();
    } catch {
      // Local wipe still proceeds; next launch mints a fresh anon session.
    }
    resetProfile();
    clearAllStorage();
  };

  const logOut = () => {
    showDialog({
      title: 'Log out?',
      /* "It cannot be undone" was true when signing back in gave you a blank
         profile. It no longer is: sync runs first, and signing in with the same
         Google account now restores the username, photo and XP from the server.
         What is genuinely lost is anything this device never managed to push —
         so the warning stays, aimed at the part that is still true. */
      message:
        'This clears your profile, session history and XP from this device. Signing back in with the same Google account restores them — but anything not yet synced is lost.',
      tone: 'danger',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Log out',
          variant: 'destructive',
          onPress: () => {
            void (async () => {
              await clearLocalSession({ syncFirst: true });
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
      const result = await restore(uid);
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
                if (!uid) {
                  throw new Error('Sign in first, then try deleting again.');
                }
                await deleteAccount(uid);
                // Cloud + auth erased — wipe device and leave.
                await clearLocalSession({ syncFirst: false });
                setBusy(null);
                router.replace('/onboarding');
              } catch (error) {
                captureError(error);
                const message =
                  error instanceof Error
                    ? error.message
                    : 'Could not delete your account right now. Please try again.';
                // Cloud wiped but Auth needs a fresh login — keep the session so
                // they can reauth and tap Delete again. Signing out here orphans
                // the Auth user that still needs current.delete().
                const cloudErased =
                  message === CLOUD_ERASED_REAUTH_MESSAGE ||
                  /cloud data was erased/i.test(message);
                setBusy(null);
                showDialog({
                  title: cloudErased ? 'Confirm your login' : 'Delete failed',
                  message: cloudErased ? CLOUD_ERASED_REAUTH_MESSAGE : message,
                  tone: cloudErased ? 'info' : 'danger',
                  actions: [{ label: 'Got it', variant: 'primary' }],
                });
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
            <View style={{ flex: 1 }}>
              <Text style={font('semibold', 15, { color: palette.ink })}>{row.title}</Text>
              <Text style={font('regular', 12.5, { color: palette.grey600, marginTop: 1 })}>{row.subtitle}</Text>
            </View>
            <Toggle
              value={settings[row.key]}
              onChange={(next) => {
                settings.set(row.key, next);
                // The daily-reminder toggle owns real OS schedules, so arm or
                // clear them the moment it flips.
                /* Water owns its own OS schedules, so flip them with the
                   switch rather than waiting for the next foreground sync. */
                if (row.key === 'stepCounting') {
                  void setStepServiceEnabled(next);
                }
                if (row.key === 'hydrationReminder') {
                  const h = useHydrationStore.getState();
                  void syncHydrationReminders({
                    enabled: next,
                    drinks: h.drinks,
                    goalMl: h.goalMl,
                    day: dayKey(),
                  });
                }
                if (row.key === 'dailyReminder') {
                  const today = dayKey();
                  const trainedToday = sessions.some((s) => s.day === today);
                  if (next) {
                    void syncLocalReminders({
                      dailyReminderEnabled: true,
                      trainedToday,
                      coupleAtRisk: couple.paired && couple.atRisk,
                      partnerName: couple.partner?.displayName ?? null,
                      /* `sessions` is what the schedule is *derived* from, not
                         extra detail: `reminderHourFor` reads the training hours
                         out of it, and `buildDormantReminder` the headline. Omit
                         it and this call re-arms at a flat 19:00 with the generic
                         copy — so toggling the switch off and on silently undid
                         the learned hour for the athlete it was learned for. */
                      sessions,
                      streak: selectStreak({ sessions }, today),
                      daysSinceLastSession: daysSinceLastSession(
                        sessions.reduce((latest, s) => (s.day > latest ? s.day : latest), '') ||
                          null,
                        today,
                      ),
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
    <Screen enter>
      <ModalHeader title="Settings" />

      <HomeSectionHeader title="During workouts" />
      {renderGroup(WORKOUT_TOGGLES)}

      <HomeSectionHeader title="Notifications" />
      {renderGroup(
        /* Android only: iOS counts steps without a background service, so the
           switch would control nothing there. */
        Platform.OS === 'android' ? [...NOTIFICATION_TOGGLES, STEP_COUNTING_ROW] : NOTIFICATION_TOGGLES,
      )}

      <HomeSectionHeader title="Privacy" />
      {renderGroup(PRIVACY_TOGGLES)}

      {/* Where the athlete can see what they have, and what to do about it.
          Shown only when billing exists on this build — a plan row with nothing
          to buy would be a dead end. */}
      {isPurchasesConfigured() ? (
        <>
          <HomeSectionHeader title="Subscription" />
          <Card style={styles.group}>
            <LinkRow
              label="RepChamp Pro"
              detail={isPro ? 'Active' : 'Free plan'}
              onPress={() =>
                isPro
                  ? void Linking.openURL(manageSubscriptionsUrl()).catch(captureError)
                  : router.push({ pathname: '/modal/paywall', params: { source: 'settings' } })
              }
            />
          </Card>
          {isPro ? <AnnualUpgradeCard /> : null}
        </>
      ) : null}

      {cloudConfigured ? (
        <>
          <HomeSectionHeader title="Account" />
          <Card style={styles.group}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={font('semibold', 15, { color: palette.ink })}>Cloud sync</Text>
                <Text style={font('regular', 12.5, { color: palette.grey600, marginTop: 1 })}>
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

      {/* Android-only: the row is hidden rather than shown-and-disabled on a
          build that cannot host a widget, because a dead entry point is worse
          than no entry point. */}
      {isWidgetSupported() ? (
        <>
          <HomeSectionHeader title="Home screen" />
          <Card style={styles.group}>
            <LinkRow
              label="Widget studio"
              onPress={() => router.push('/modal/widget')}
            />
          </Card>
        </>
      ) : null}

      <HomeSectionHeader title="Your data" />
      <Card style={styles.group}>
        <LinkRow
          label="Privacy Policy & Terms"
          onPress={() => router.push('/modal/legal')}
        />
        <Divider />
        <LinkRow
          label="Blocked users"
          onPress={() => router.push('/modal/blocked')}
        />
        {isPurchasesConfigured() ? (
          <>
            <Divider />
            <LinkRow
              label={busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
              onPress={onRestore}
            />
          </>
        ) : null}
        {cloudConfigured ? (
          <>
            <Divider />
            <LinkRow
              label={busy === 'export' ? 'Preparing your data…' : 'Export my data'}
              onPress={() => void exportData()}
            />
            <Divider />
            <LinkRow
              label={busy === 'delete' ? 'Deleting…' : 'Delete my account'}
              onPress={confirmDelete}
              destructive
            />
          </>
        ) : null}
      </Card>

      <HomeSectionHeader title="Help" />
      <Card style={styles.group}>
        <LinkRow
          label="Contact support"
          onPress={() =>
            void Linking.openURL(
              `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('RepChamp support')}`,
            ).catch(captureError)
          }
        />
        <Divider />
        <LinkRow
          label="Replay intro"
          onPress={() => router.replace('/onboarding')}
        />
      </Card>

      <PressableScale
        onPress={logOut}
        accessibilityRole="button"
        accessibilityLabel="Log out and clear this device"
        style={[styles.logOut, { minHeight: reservedControlHeight(52, fontScale) }]}
      >
        <Text style={font('extrabold', 14, { color: palette.red500 })} {...scaleForRole('control')}>
          Log out
        </Text>
      </PressableScale>

      <Text style={styles.version}>RepChamp v2.0</Text>
    </Screen>
  );
}

function LinkRow({
  label,
  onPress,
  destructive = false,
  detail,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Current state shown before the chevron, e.g. "Active". */
  detail?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.row}
    >
      <Text
        style={[
          font('semibold', 15, { color: destructive ? palette.red500 : palette.ink }),
          { flex: 1 },
        ]}
      >
        {label}
      </Text>
      {detail ? (
        <Text style={font('semibold', 13, { color: palette.grey600, marginRight: 6 })}>{detail}</Text>
      ) : null}
      <Chevron />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  eyebrow: { marginBottom: 8 },
  group: { paddingHorizontal: 16, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  syncDot: { width: 10, height: 10, borderRadius: 5 },
  logOut: {
    // `minHeight` at render time — see `@/theme/fontScale`.
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
