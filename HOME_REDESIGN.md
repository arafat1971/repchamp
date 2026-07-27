# Home Tab — Redesign Plan

_Audit of `app/(tabs)/index.tsx` (468 lines), written 2026-07-26._

## What's wrong today

The screen is **attractive but not intelligent**. Current order:

`Level card → Week + League → Today's Challenges → Couple mode → Quick match → Recovery → Jump back in`

Seven competing sections, each a peer. Specific problems:

1. **No hierarchy — no single "do this now."** A user opening the app at 7pm with a
   streak about to break sees the same layout as someone who just finished a set.
   The most important action is never visually dominant.
2. **Almost nothing adapts.** The only state-aware pieces are the greeting
   (time of day) and the couple card's at-risk colour. A day-1 user and a day-90
   user see an identical screen.
3. **Vanity above utility.** The largest, most colourful element is the Level/XP
   card — a *status* display. It occupies the prime slot but prompts no action.
4. **No first-run state.** A brand-new account sees "0 / 4 days", empty bests and
   a Level 1 bar. The emptiest moment gets zero guidance — the worst possible
   first impression, and directly harmful to activation.
5. **Couple mode is buried 4th** — despite being the differentiator and the viral
   loop. It should be near the top for unpaired users (invite = growth) and for
   paired users at risk (streak = retention).
6. **Redundancy.** "Today's Challenges" (push/squat duel) and "Quick match" and
   "Jump back in" all ultimately start a session. Three entry points, unclear
   difference.

## Design principle for the new Home

> **One screen, one obvious next action, chosen by the app.**

Home stops being a menu of everything and becomes a *decision*: given the time,
the streak, the couple state and what they did last, what should this person do in
the next 60 seconds? Everything else moves below the fold or into other tabs.

## New structure

### 1. Compact status bar (replaces the giant Level card)
Slim row: avatar · name · level chip · streak flame · notification bell.
Full level/XP detail moves to the **Profile** tab where status belongs.
_Frees the prime slot; keeps identity present._

### 2. **The Hero Card** — the single adaptive next action ⭐ (the core change)
One large card whose content is chosen by priority rules. First match wins:

| Priority | Condition | Hero shows |
|---|---|---|
| 1 | First ever session not done | **"Start your first set"** — 60-second intro, no target |
| 2 | Couple streak at risk today | **"Your streak with {partner} needs you"** — amber, one tap to start |
| 3 | Partner trained today, you haven't | **"{partner} did 24. Your turn."** — the strongest social pull |
| 4 | Unpaired | **"Train with your partner"** — invite CTA (viral loop) |
| 5 | Daily challenge not done | **"Today's challenge: 25 push-ups"** |
| 6 | Weekly goal already met | **"Goal hit — 5/4 days"** + optional bonus set |
| 7 | Rest day / trained already today | **"Recovery"** — mobility, gentle |

This one card replaces the reason Home currently needs seven sections.

### 3. Couple strip (only when paired)
Compact horizontal card: both avatars · shared streak · combined reps · a
7-day dot row showing who trained which day. Tapping opens couple mode.
_Keeps the differentiator visible without competing with the hero._

### 4. This week
Keep the current weekly-goal card (it's good), now **secondary** in size.
Add the 7-dot week strip so progress is glanceable.

### 5. Quick start row
Two small tiles — Push-Ups · Squats — for users who want to bypass the hero.
Replaces "Today's Challenges" + "Quick match" + "Jump back in" (three redundant
entry points collapse into one).

### 6. Below the fold
League standing, achievements teaser, recovery. Low-frequency, so low position.

## Implementation plan

**Step 1 — extract the decision logic (pure + tested).**
New `src/domain/homeFocus.ts`:
```ts
export type HomeFocus =
  | { kind: 'first-session' }
  | { kind: 'streak-at-risk'; partnerName: string }
  | { kind: 'partner-trained'; partnerName: string; partnerReps: number }
  | { kind: 'invite-partner' }
  | { kind: 'daily-challenge'; exercise: ExerciseId; target: number }
  | { kind: 'goal-met'; days: number; goal: number }
  | { kind: 'recovery' };

export function selectHomeFocus(input: {...}): HomeFocus
```
Pure function, no React, no Firebase — unit-tested exactly like `couple.ts`.
This is the heart of the redesign and must be provably correct.

**Step 2 — `src/components/home/HeroCard.tsx`.** Renders a `HomeFocus`. One
component, seven states, each with its own copy, colour and CTA.

**Step 3 — `CoupleStrip.tsx`** with the who-trained-which-day dot row.

**Step 4 — rebuild `app/(tabs)/index.tsx`** around the new order. Target: well
under 468 lines by moving the level card to Profile and collapsing the three
redundant session entry points.

**Step 5 — first-run empty state.** Explicit, warm, single CTA.

## Motion & polish (uses what's already there)
- `StaggerIn` on entry (already used — keep).
- `PopOnChange` on streak/rep numbers (already used — keep).
- Hero card: subtle breathing scale when at-risk (urgency without a red alarm).
- Respect **reduce-motion** — currently not checked anywhere; add it.

## What this fixes, measurably
Instrument these (needs the analytics from `GROWTH_PLAN.md` Phase 1):
- `home_hero_shown` (with `kind`) → `home_hero_tapped` = hero CTR per state.
- Session-start rate from Home (expect a large lift vs. a 7-section menu).
- D1/D7 retention — the at-risk and partner-trained heroes target exactly this.

## Sequencing note
The redesign is worth doing **after** analytics land (Phase 1 of `GROWTH_PLAN.md`),
so the lift is measurable rather than assumed. If you want it sooner, build it —
but add the events at the same time.
