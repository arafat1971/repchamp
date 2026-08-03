import { BrandedQR } from '@/components/BrandedQR';
import { inviteDeepLink } from '@/domain/couple';

/**
 * A QR code for a couple pair code, with the RepChamp logo in the centre.
 *
 * The payload is the app's own deep link (`repchamp://couple/join?code=…`), so
 * a partner scanning it with *any* phone camera / Google Lens is offered "Open
 * in RepChamp" and lands straight in pairing — not only via the in-app
 * scanner. The web `inviteLink` needs universal links configured to do the
 * same, so it is reserved for the shared text message instead. Either form is
 * understood by the in-app scanner, which parses the code back out with
 * `parseInviteCode`.
 *
 * The drawing itself lives in `BrandedQR`, shared with the duel invite.
 */
export function CoupleQR({ code, size = 232 }: { code: string; size?: number }) {
  return (
    <BrandedQR
      payload={inviteDeepLink(code)}
      size={size}
      accessibilityLabel="RepChamp couple invite"
    />
  );
}
