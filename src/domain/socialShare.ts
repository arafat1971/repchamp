/**
 * Where an invite can be sent: X, Facebook, Instagram and TikTok.
 *
 * X and Facebook publish a web share URL that takes the text and link, so the
 * invite arrives pre-filled (the OS opens the app if installed, else the
 * browser). Instagram and TikTok have no such URL: a link can only be pasted
 * into a story, bio, post or DM. For those the app copies the invite, opens
 * the app, and tells the athlete to paste. We never post for anyone.
 *
 * Pure: the component asks for a target and does the opening.
 */

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x';

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ['instagram', 'tiktok', 'facebook', 'x'];

export const SOCIAL_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
};

/** The invite text sent with the link. */
export function inviteMessage(link: string): string {
  return `Race me on RepChamp — count reps, beat my score, and train together. Join here: ${link}`;
}

export type ShareTarget =
  /** A web share URL that pre-fills the post. */
  | { kind: 'prefilled'; url: string }
  /** Copy the message, open the app, and ask the athlete to paste. */
  | { kind: 'paste'; message: string; appUrl: string; hint: string };

export function shareTarget(platform: SocialPlatform, link: string): ShareTarget {
  const message = inviteMessage(link);
  switch (platform) {
    case 'x':
      return {
        kind: 'prefilled',
        url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message.replace(` ${link}`, ''))}&url=${encodeURIComponent(link)}`,
      };
    case 'facebook':
      return {
        kind: 'prefilled',
        url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(message.replace(` ${link}`, ''))}`,
      };
    case 'instagram':
      return {
        kind: 'paste',
        message,
        appUrl: 'instagram://app',
        hint: 'Invite copied — paste it in a story, your bio or a DM.',
      };
    case 'tiktok':
      return {
        kind: 'paste',
        message,
        appUrl: 'tiktok://',
        hint: 'Invite copied — paste it in a post, your bio or a message.',
      };
  }
}
