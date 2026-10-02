/**
 * Onboarding progress that survives the app being closed.
 *
 * Twenty-odd screens, a Google sign-in that leaves the app, and permission
 * dialogs: a kill mid-flow is routine, and the answers lived only in React
 * state, so the athlete restarted at the welcome screen having typed their
 * username and picked a plan for nothing. A draft is saved on every step and
 * cleared when onboarding finishes.
 *
 * Parsing is defensive on purpose — this is read from disk at launch, and a
 * malformed value must mean "no draft", never a crash on the first screen.
 */

export const ONBOARDING_DRAFT_KEY = 'onboarding.draft';
const DRAFT_VERSION = 1;
const MAX_AGE_MS = 14 * 86_400_000;

export interface OnboardingDraft {
  step: number;
  username: string;
  avatarUri: string | null;
  goal: string | null;
  level: string | null;
  blocker: string | null;
  weeklyGoal: number;
  plan: 'year' | 'month';
}

interface Stored extends OnboardingDraft {
  v: number;
  savedAt: number;
}

export function serializeDraft(draft: OnboardingDraft, now: number): string {
  const stored: Stored = { ...draft, v: DRAFT_VERSION, savedAt: now };
  return JSON.stringify(stored);
}

const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.length <= max ? v : null;

export function parseDraft(raw: string | null | undefined, now: number): OnboardingDraft | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    o = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (o.v !== DRAFT_VERSION) return null;
  if (typeof o.savedAt !== 'number' || now - o.savedAt > MAX_AGE_MS || o.savedAt > now + 60_000) {
    return null;
  }
  if (typeof o.step !== 'number' || !Number.isFinite(o.step)) return null;
  const weeklyGoal = typeof o.weeklyGoal === 'number' ? Math.round(o.weeklyGoal) : NaN;
  return {
    step: Math.floor(o.step),
    username: (str(o.username, 20) ?? '').replace(/[^a-zA-Z0-9_]/g, ''),
    avatarUri: str(o.avatarUri, 2000),
    goal: str(o.goal, 40),
    level: str(o.level, 40),
    blocker: str(o.blocker, 40),
    weeklyGoal: weeklyGoal >= 1 && weeklyGoal <= 7 ? weeklyGoal : 4,
    plan: o.plan === 'month' ? 'month' : 'year',
  };
}
