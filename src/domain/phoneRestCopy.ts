/**
 * Wording for the "your phone needs a rest" notices.
 *
 * Kept free of React Native so it can be unit-tested. The tone is deliberate:
 * the *phone* has had a long workout, the athlete's reps are safe, and nothing
 * here apologises for or hints at a fault in the app.
 */
export type PhoneRestNoticeKind = 'during' | 'next-set';

export const PHONE_REST_COPY: Record<PhoneRestNoticeKind, { title: string; body: string }> = {
  during: {
    title: 'Your phone needs a short rest',
    body: 'It has been working hard for a while. A minute or two off keeps rep tracking accurate. Your reps so far are safe.',
  },
  'next-set': {
    title: 'Your phone may still be warm',
    body: 'A few minutes between sets keeps tracking smooth. You can start whenever you are ready.',
  },
};
