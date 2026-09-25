/**
 * History that belongs to one pairing.
 *
 * The water streak, the week's totals and the ritual's day-by-day history are
 * kept on the phone, and they describe *this* couple. If someone re-pairs with
 * a different person, the new partner must start from a clean slate — never
 * inherit the old one's week under their own name. Data written before this
 * existed has no owner; the first pairing seen adopts it.
 */
export type BindAction = 'keep' | 'adopt' | 'reset';

export function bindAction(owner: string, coupleId: string): BindAction {
  if (!coupleId || owner === coupleId) return 'keep';
  if (!owner) return 'adopt';
  return 'reset';
}
