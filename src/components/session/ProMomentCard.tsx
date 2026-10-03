import Animated, { FadeInDown } from 'react-native-reanimated';

import { PromoCard } from '@/components/PromoCard';
import type { ProMoment } from '@/domain/proMoment';

/** The peak-moment Pro offer, shown under the score after a real high. */
export function ProMomentCard({
  moment,
  onAccept,
  onDismiss,
}: {
  moment: ProMoment;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(500).delay(700)}>
      <PromoCard
        headline={moment.headline}
        body={moment.body}
        cta={moment.cta}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    </Animated.View>
  );
}
