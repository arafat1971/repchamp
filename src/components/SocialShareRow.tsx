import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import {
  SOCIAL_LABEL,
  SOCIAL_PLATFORMS,
  inviteMessage,
  shareTarget,
  type SocialPlatform,
} from '@/domain/socialShare';
import { track } from '@/lib/analytics';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

const MARK: Record<SocialPlatform, string> = { instagram: 'IG', tiktok: 'TT', facebook: 'f', x: 'X' };

/**
 * Invite buttons for Instagram, TikTok, Facebook and X, plus the system share
 * sheet for everything else. The athlete always taps Send/Post themselves.
 */
export function SocialShareRow({ link }: { link: string }) {
  const [hint, setHint] = useState<string | null>(null);

  const systemShare = () => {
    track('share_opened', { kind: 'invite-system' });
    void Share.share({ message: inviteMessage(link) });
  };

  const share = async (platform: SocialPlatform) => {
    track('share_opened', { kind: `invite-${platform}` });
    const target = shareTarget(platform, link);
    try {
      if (target.kind === 'prefilled') {
        await Linking.openURL(target.url);
        return;
      }
      await Clipboard.setStringAsync(target.message);
      setHint(target.hint);
      setTimeout(() => setHint(null), 5000);
      await Linking.openURL(target.appUrl);
    } catch {
      /* App not installed or link blocked: the system sheet always works. */
      systemShare();
    }
  };

  return (
    <View style={{ marginTop: 12 }}>
      <View style={styles.row}>
        {SOCIAL_PLATFORMS.map((p) => (
          <PressableScale
            key={p}
            onPress={() => void share(p)}
            accessibilityRole="button"
            accessibilityLabel={`Invite on ${SOCIAL_LABEL[p]}`}
            style={styles.chip}
          >
            <Text style={font('extrabold', 15, { color: palette.white })}>{MARK[p]}</Text>
            <Text style={font('semibold', 10.5, { color: 'rgba(255,255,255,0.85)' })} numberOfLines={1}>
              {SOCIAL_LABEL[p]}
            </Text>
          </PressableScale>
        ))}
      </View>
      {hint ? (
        <Text style={font('semibold', 12, { color: palette.white, marginTop: 8, textAlign: 'center' })}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
