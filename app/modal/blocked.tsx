import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, Divider, PressableScale, Screen } from '@/components/ui';
import { captureError } from '@/lib/crash';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '@/services/safetyService';
import { useAuthStore } from '@/state/authStore';
import { showDialog } from '@/state/useDialog';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** Manage blocked athletes — unblock restores discoverability / friend adds. */
export default function BlockedUsersScreen() {
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid);
  const [rows, setRows] = useState<BlockedUser[] | null>(null);

  const refresh = useCallback(() => {
    if (!uid) {
      setRows([]);
      return;
    }
    void fetchBlockedUsers(uid)
      .then(setRows)
      .catch((err) => {
        captureError(err);
        setRows([]);
      });
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onUnblock = (row: BlockedUser) => {
    if (!uid) return;
    showDialog({
      title: `Unblock ${row.displayName}?`,
      message: 'They can add you and appear in discovery again.',
      tone: 'info',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Unblock',
          variant: 'primary',
          onPress: () => {
            void unblockUser(uid, row.uid)
              .then(refresh)
              .catch((err) => {
                showDialog({
                  title: 'Could not unblock',
                  message: err instanceof Error ? err.message : 'Please try again.',
                  tone: 'danger',
                  actions: [{ label: 'Got it', variant: 'primary' }],
                });
              });
          },
        },
      ],
    });
  };

  return (
    <Screen>
      <ModalHeader title="Blocked" subtitle="People you’ve blocked" />

      {rows === null ? (
        <Text style={text.caption}>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text style={[text.body, { marginTop: 8 }]}>
          No one blocked. You can block someone from their profile.
        </Text>
      ) : (
        <Card style={styles.group}>
          {rows.map((row, i) => (
            <View key={row.uid}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={font('extrabold', 14, { color: palette.ink })}>
                    {row.displayName}
                  </Text>
                </View>
                <PressableScale
                  onPress={() => onUnblock(row)}
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock ${row.displayName}`}
                  style={styles.unblock}
                >
                  <Text style={font('extrabold', 12, { color: palette.green700 })}>Unblock</Text>
                </PressableScale>
              </View>
            </View>
          ))}
        </Card>
      )}

      <PressableScale
        onPress={() => router.back()}
        accessibilityRole="button"
        style={{ alignSelf: 'center', marginTop: 24, padding: 12 }}
      >
        <Text style={font('bold', 13, { color: palette.grey600 })}>Done</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  unblock: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: palette.green50,
  },
});
