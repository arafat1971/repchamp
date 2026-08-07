import { Redirect, useLocalSearchParams } from 'expo-router';

import { isValidUsername, normalizeUsername } from '@/domain/input';

/**
 * Deep-link landing for a friend invite — `https://repchamp.web.app/@username`.
 *
 * The website has always served this path (`friend-invite.html`) and deep-linked
 * onward to `repchamp://modal/add-friend?u=…`. What was missing was the app half:
 * with no route matching `/@username`, Android had nothing to open, so the https
 * link could not be claimed in the manifest and every friend invite bounced to
 * the browser. The web page's scheme fallback hid that — the loop worked, just
 * always via a browser hop.
 *
 * This route is deliberately thin. It resolves nothing itself: `add-friend`
 * already seeds its search box from `?u=` and owns the real lookup, blocking and
 * collision handling (`addFriendByUsername`). Duplicating any of that here would
 * mean two paths to keep in step.
 *
 * Matching `[handle]` at the app root is broad — it catches any unmatched
 * single-segment path, not just `@name` — so anything that is not a handle is
 * sent home rather than shown a dead end.
 */
export default function FriendHandleScreen() {
  const { handle } = useLocalSearchParams<{ handle?: string }>();

  const raw = typeof handle === 'string' ? handle : '';
  // Only `@name` is a friend invite. A bare segment is some other stray link.
  const username = raw.startsWith('@') ? normalizeUsername(raw) : '';

  // Validate here rather than handing a doomed query to the search box: a
  // malformed handle would otherwise land on add-friend and fail there, which
  // reads as "this person does not exist" instead of "this link is broken".
  if (!isValidUsername(username)) return <Redirect href="/(tabs)" />;

  return <Redirect href={{ pathname: '/modal/add-friend', params: { u: username } }} />;
}
