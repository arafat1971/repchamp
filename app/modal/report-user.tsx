import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, PressableScale, PrimaryButton, Screen } from '@/components/ui';
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReasonId } from '@/domain/safety';
import { SUPPORT_EMAIL } from '@/lib/urls';
import { createReport } from '@/services/safetyService';
import { useAuthStore } from '@/state/authStore';
import { showDialog } from '@/state/useDialog';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Report a peer for review. Writes to Firestore `reports` (create-only) and
 * confirms with a support contact — required for Play Store UGC apps.
 */
export default function ReportUserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string; name?: string }>();
  const uid = useAuthStore((s) => s.user?.uid);
  const [reason, setReason] = useState<ReportReasonId>('inappropriate_avatar');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const target = typeof params.target === 'string' ? params.target : '';
  const name = typeof params.name === 'string' ? params.name : 'Athlete';

  const submit = async () => {
    if (!uid || !target || busy) return;
    setBusy(true);
    try {
      await createReport({
        reporterUid: uid,
        targetUid: target,
        reason,
        note,
        context: 'friend-profile',
      });
      showDialog({
        title: 'Report sent',
        message: `Thanks. Our team will review @${name}. For urgent issues email ${SUPPORT_EMAIL}.`,
        tone: 'success',
        actions: [{ label: 'Done', variant: 'primary', onPress: () => router.back() }],
      });
    } catch (err) {
      showDialog({
        title: 'Could not send',
        message: err instanceof Error ? err.message : 'Please try again.',
        tone: 'danger',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ModalHeader title="Report user" subtitle={`About ${name}`} />

      <Text style={[text.body, { marginBottom: 12 }]}>
        Reports are confidential. Choose the closest reason — false reports may lead to limits on
        your account.
      </Text>

      <View style={{ gap: 8 }}>
        {REPORT_REASONS.map((r) => {
          const selected = reason === r.id;
          return (
            <PressableScale
              key={r.id}
              onPress={() => setReason(r.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={r.label}
              style={[styles.reason, selected && styles.reasonSelected]}
            >
              <Text style={font('extrabold', 14, { color: palette.ink })}>{r.label}</Text>
            </PressableScale>
          );
        })}
      </View>

      <Card style={{ marginTop: 16, padding: 12 }}>
        <Text style={font('bold', 12, { color: palette.grey600, marginBottom: 8 })}>
          Optional details
        </Text>
        <TextInput
          value={note}
          onChangeText={(t) => setNote(t.slice(0, REPORT_NOTE_MAX))}
          placeholder="What happened?"
          placeholderTextColor={palette.grey450}
          multiline
          maxLength={REPORT_NOTE_MAX}
          style={styles.note}
          accessibilityLabel="Report details"
        />
      </Card>

      <PrimaryButton
        label={busy ? 'Sending…' : 'Submit report'}
        onPress={() => void submit()}
        disabled={busy || !target || !uid}
        style={{ marginTop: 20 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  reason: {
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: radius.xl,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: palette.white,
  },
  reasonSelected: {
    borderColor: palette.green500,
    backgroundColor: palette.green50,
  },
  note: {
    minHeight: 88,
    textAlignVertical: 'top',
    ...font('semibold', 14, { color: palette.ink }),
  },
});
