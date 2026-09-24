/**
 * Whether logging a drink should tell the partner.
 *
 * "Nkll just drank 250 ml — your turn" is the most natural nudge a couple can
 * send, and nobody has to remember to send it. But an automatic message is
 * only welcome while it is useful, so it goes only when:
 * - the athlete shares water with their partner at all, and has not turned
 *   drink updates off;
 * - the partner has not already met their goal (then it is noise);
 * - it is a real amount, not an undo or a zero.
 * Frequency is capped separately by the `waterShare` rate limit.
 */
export function shouldShareDrink(input: {
  paired: boolean;
  sharingWater: boolean;
  drinkUpdates: boolean;
  ml: number;
  partnerMet: boolean;
}): boolean {
  return (
    input.paired &&
    input.sharingWater &&
    input.drinkUpdates &&
    input.ml > 0 &&
    !input.partnerMet
  );
}
